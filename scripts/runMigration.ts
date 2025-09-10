import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import pg from 'pg';

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('Usage: tsx scripts/runMigration.ts <path-to-sql>');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Check your .env');
    process.exit(1);
  }

  const sqlPath = path.resolve(fileArg);
  if (!fs.existsSync(sqlPath)) {
    console.error(`SQL file not found: ${sqlPath}`);
    process.exit(1);
  }

  const sqlText = fs.readFileSync(sqlPath, 'utf8');
  const { Pool } = pg;
  const urlObj = new URL(process.env.DATABASE_URL!);
  const needsSSL = /neon\.tech$/.test(urlObj.hostname);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: needsSSL ? { rejectUnauthorized: false } : undefined });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sqlText);
    await client.query('COMMIT');
    console.log(`Applied migration: ${sqlPath}`);
  } catch (e: any) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', e?.message || e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('Unexpected error:', e);
  process.exit(1);
});

