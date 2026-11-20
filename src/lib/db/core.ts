/**
 * Database access layer shared by the app, scripts and tests.
 *
 * - Production: Postgres (Supabase) through postgres.js, using DATABASE_URL.
 * - Development / tests without DATABASE_URL: embedded PGlite (real Postgres compiled to WASM),
 *   persisted to a directory or held in memory. The same SQL migrations run on both.
 */
import fs from "node:fs";
import path from "node:path";

export type Row = Record<string, unknown>;

export interface Db {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  /** Run a multi-statement SQL script (no parameters). */
  script(sql: string): Promise<void>;
  close(): Promise<void>;
  kind: "postgres" | "pglite";
}

export async function createPostgresDb(url: string): Promise<Db> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // compatible with Supabase transaction pooler
    types: { bigint: postgres.BigInt },
  });
  const wrap = (runner: { unsafe: typeof sql.unsafe }): Db => ({
    kind: "postgres",
    async query<T>(text: string, params: unknown[] = []) {
      const rows = await runner.unsafe(text, params as never[]);
      return rows as unknown as T[];
    },
    async tx<T>(fn: (db: Db) => Promise<T>) {
      return (await sql.begin(async (t) => fn(wrap(t as never)))) as T;
    },
    async script(text: string) {
      await runner.unsafe(text);
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  });
  return wrap(sql);
}

export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  const { pgcrypto } = await import("@electric-sql/pglite/contrib/pgcrypto");
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
  const pg = await PGlite.create({ dataDir, extensions: { pg_trgm, pgcrypto } });

  type Runner = { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };
  // PGlite runs one transaction at a time; serialise transactions to avoid interleaving.
  let chain: Promise<unknown> = Promise.resolve();
  const wrap = (runner: Runner, inTx: boolean): Db => ({
    kind: "pglite",
    async query<T>(text: string, params: unknown[] = []) {
      const res = await runner.query(text, params);
      return res.rows as T[];
    },
    async tx<T>(fn: (db: Db) => Promise<T>) {
      if (inTx) return fn(wrap(runner, true));
      const run = chain.then(() => pg.transaction(async (t) => fn(wrap(t as unknown as Runner, true))));
      chain = run.catch(() => undefined);
      return run as Promise<T>;
    },
    async script(text: string) {
      await (runner as unknown as { exec: (s: string) => Promise<unknown> }).exec(text);
    },
    async close() {
      await pg.close();
    },
  });
  return wrap(pg as unknown as Runner, false);
}

export async function migrate(db: Db, dir = path.join(/*turbopackIgnore: true*/ process.cwd(), "supabase", "migrations")) {
  await db.query(`create table if not exists schema_migrations (
    name text primary key, applied_at timestamptz not null default now())`);
  const applied = new Set(
    (await db.query<{ name: string }>("select name from schema_migrations")).map((r) => r.name),
  );
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sqlText = fs.readFileSync(path.join(dir, file), "utf8");
    await db.tx(async (t) => {
      await t.script(sqlText);
      await t.query("insert into schema_migrations (name) values ($1)", [file]);
    });
    ran.push(file);
  }
  return ran;
}
