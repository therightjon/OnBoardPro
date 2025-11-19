import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schemas";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

// Pool already imported above
const urlObj = new URL(process.env.DATABASE_URL);
const needsSSL = /neon\.tech$/.test(urlObj.hostname);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: needsSSL ? { rejectUnauthorized: false } : undefined
});

// Configure database with query logging in development
export const db = drizzle(pool, {
  schema,
  logger: process.env.NODE_ENV === 'development' ? {
    logQuery(query: string, params: unknown[]) {
      const timestamp = new Date().toISOString();
      console.log(`[DB Query ${timestamp}]`, query);
      if (params && params.length > 0) {
        console.log(`[DB Params]`, params);
      }
    }
  } : false
});