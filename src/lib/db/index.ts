import "server-only";
import path from "node:path";
import { env } from "@/lib/env";
import { createPgliteDb, createPostgresDb, migrate, type Db } from "./core";

export type { Db } from "./core";

const g = globalThis as unknown as { __fragfunDb?: Promise<Db> };

/** Lazily-created singleton database handle. */
export function getDb(): Promise<Db> {
  if (!g.__fragfunDb) {
    g.__fragfunDb = (async () => {
      const e = env();
      if (e.DATABASE_URL) {
        const db = await createPostgresDb(e.DATABASE_URL);
        if (e.AUTO_MIGRATE) {
          const ran = await migrate(db);
          if (ran.length) console.log(`[fragfun] applied migrations: ${ran.join(", ")}`);
        }
        return db;
      }
      const db = await createPgliteDb(path.resolve(/*turbopackIgnore: true*/ process.cwd(), e.PGLITE_DIR));
      // Embedded development database: apply migrations automatically.
      await migrate(db);
      return db;
    })().catch((err) => {
      g.__fragfunDb = undefined;
      throw err;
    });
  }
  return g.__fragfunDb;
}

export async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
  const db = await getDb();
  return db.query<T>(text, params);
}

export async function q1<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (db: Db) => Promise<T>) {
  const db = await getDb();
  return db.tx(fn);
}
