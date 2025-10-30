import dotenv from "dotenv";
import { Client } from "pg";

dotenv.config();

async function main() {
  const forceFlag = process.argv.includes("--force");
  if (!forceFlag) {
    console.error("Refusing to reset domain data without --force flag.");
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set in the environment.");
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("BEGIN;");
    await client.query("TRUNCATE TABLE candidate_tasks RESTART IDENTITY CASCADE;");
    await client.query("TRUNCATE TABLE candidate_template_stages RESTART IDENTITY CASCADE;");
    await client.query("TRUNCATE TABLE candidate_stage_history RESTART IDENTITY CASCADE;");
    await client.query("TRUNCATE TABLE candidates RESTART IDENTITY CASCADE;");
    await client.query("TRUNCATE TABLE template_tasks RESTART IDENTITY CASCADE;");
    await client.query("TRUNCATE TABLE template_stages RESTART IDENTITY CASCADE;");
    await client.query("TRUNCATE TABLE templates RESTART IDENTITY CASCADE;");
    await client.query("COMMIT;");
    console.log("Domain data reset complete. Task library tables were left untouched.");
  } catch (error) {
    await client.query("ROLLBACK;");
    console.error("Failed to reset domain data:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
