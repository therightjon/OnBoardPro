import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Client } from "pg";

dotenv.config();

async function run() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("Usage: tsx scripts/runSqlFiles.ts <file1.sql> [file2.sql ...]");
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set in environment or .env");
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    for (const file of files) {
      // Resolve path relative to repo root for safety
      const resolved = path.resolve(process.cwd(), file);
      const sql = await readFile(resolved, "utf8");
      console.log(`\n--- Executing: ${resolved} ---`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("COMMIT");
        console.log(`Applied ${path.basename(resolved)} successfully.`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`Error applying ${resolved}:`, err);
        throw err;
      }
    }
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error("Migration execution failed:", err);
  process.exit(1);
});

