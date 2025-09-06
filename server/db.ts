import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

const { Pool } = pg;
const urlObj = new URL(process.env.DATABASE_URL);
const needsSSL = /neon\.tech$/.test(urlObj.hostname);

export const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: needsSSL ? { rejectUnauthorized: false } : undefined });
export const db = drizzle(pool, { schema });