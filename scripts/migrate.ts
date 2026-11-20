/* Apply SQL migrations in supabase/migrations to DATABASE_URL (or the local PGlite database). */
import path from "node:path";
import { createPgliteDb, createPostgresDb, migrate } from "../src/lib/db/core";

async function main() {
  const url = process.env.DATABASE_URL;
  const db = url
    ? await createPostgresDb(url)
    : await createPgliteDb(path.resolve(process.env.PGLITE_DIR ?? ".data/pglite"));
  const ran = await migrate(db);
  console.log(ran.length ? `Applied: ${ran.join(", ")}` : "Database is up to date.");
  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
