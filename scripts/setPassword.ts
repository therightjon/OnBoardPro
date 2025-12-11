#!/usr/bin/env tsx
import 'dotenv/config';
import pg from 'pg';
import { assertPasswordPolicy, hashPassword } from "../server/utils/passwords";

const { Pool } = pg;

async function main() {
  const [,, email, plain] = process.argv;
  if (!email || !plain) {
    console.error('Usage: npm run user:set-password -- <email> <newPassword>');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  try {
    assertPasswordPolicy(plain);
  } catch (err: any) {
    console.error(`Password does not meet policy: ${err?.message || err}`);
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const hash = await hashPassword(plain);
    const { rowCount } = await client.query(
      'UPDATE users SET password_hash = $1, email_verified = true WHERE lower(email) = lower($2)',
      [hash, email]
    );
    if (!rowCount) {
      console.error('No user updated');
      process.exit(2);
    }
    console.log('Password updated for', email);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
