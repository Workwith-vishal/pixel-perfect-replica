/**
 * Applies the proctoring migrations to a Supabase project over the direct
 * Postgres connection, then verifies the result.
 *
 * The password is read from SUPABASE_DB_PASSWORD in the environment and is
 * never written to disk. Keeping it out of .env is deliberate: .env is
 * gitignored, but a master database credential has no business sitting in a
 * project directory at all.
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_DB_PASSWORD = "..."; node scripts/apply-migrations.mjs
 *
 * Optional overrides: SUPABASE_DB_HOST, SUPABASE_DB_PORT, SUPABASE_DB_NAME,
 * SUPABASE_DB_USER.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import pg from "pg";

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");

const config = {
  host: process.env.SUPABASE_DB_HOST ?? "db.ckprdakavirmumznppon.supabase.co",
  port: Number(process.env.SUPABASE_DB_PORT ?? 5432),
  database: process.env.SUPABASE_DB_NAME ?? "postgres",
  user: process.env.SUPABASE_DB_USER ?? "postgres",
  password: process.env.SUPABASE_DB_PASSWORD,
  // The direct host is IPv6-only on most projects, so give v4 a short grace
  // period before falling back rather than hanging.
  connectionTimeoutMillis: 15_000,
};

if (!config.password) {
  console.error("SUPABASE_DB_PASSWORD is not set. Nothing was changed.");
  process.exit(1);
}

const client = new pg.Client(config);

async function apply(file) {
  const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
  // Postgres runs DDL transactionally, so a failure leaves nothing half-applied.
  await client.query("begin");
  try {
    await client.query(sql);
    await client.query("commit");
    console.log(`  applied  ${file}`);
  } catch (error) {
    await client.query("rollback");
    console.error(`  FAILED   ${file}\n  ${error.message}`);
    throw error;
  }
}

async function verify() {
  const tables = await client.query(`
    select c.relname as name, c.relrowsecurity as rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('proctoring_artifacts', 'proctoring_evidence_access')
    order by c.relname
  `);
  console.log("\ntables:");
  for (const row of tables.rows) {
    console.log(`  ${row.name}  rls_enabled=${row.rls}`);
  }

  const bucket = await client.query(`
    select id, public, file_size_limit, allowed_mime_types
    from storage.buckets where id = 'proctoring-media'
  `);
  console.log("\nbucket:");
  if (bucket.rowCount === 0) console.log("  MISSING proctoring-media");
  else {
    const b = bucket.rows[0];
    console.log(`  ${b.id}  public=${b.public}  max=${b.file_size_limit}`);
    console.log(`  mime types: ${b.allowed_mime_types.join(", ")}`);
  }

  const policies = await client.query(`
    select schemaname, tablename, policyname
    from pg_policies
    where tablename like 'proctoring%'
  `);
  console.log(`\npolicies (must be 0 — service role only): ${policies.rowCount}`);

  const fn = await client.query(`
    select proname from pg_proc where proname = 'purge_expired_proctoring_artifacts'
  `);
  console.log(`purge function present: ${fn.rowCount === 1}`);
}

const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();

console.log(
  `Applying ${files.length} migration(s) to ${config.host}:${config.port}/${config.database}\n`,
);

await client.connect();
try {
  for (const file of files) await apply(file);
  await verify();
  console.log("\nDone.");
} catch {
  process.exitCode = 1;
} finally {
  await client.end();
}
