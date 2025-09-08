import { db } from "../server/db/connection";
import { sql, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { candidates, candidateTasks, hiringStages, systemSettings, candidateStageHistory } from "@shared/schemas";
import { recomputeCandidateStageState } from "../server/features/tasks/services/advance-stage.service";

async function ensureStage(name: string, orderIndex: number) {
  const rows = await db.select().from(hiringStages).where(eq(hiringStages.name, name)).limit(1);
  if (rows.length) return rows[0];
  const id = randomUUID();
  await db.execute(sql`INSERT INTO hiring_stages (id, name, order_index, created_at, updated_at) VALUES (${id}::uuid, ${name}, ${orderIndex}, now(), now())`);
  const [stage] = await db.select().from(hiringStages).where(eq(hiringStages.id, id));
  return stage!;
}

async function ensureSetting() {
  const rows = await db.select().from(systemSettings).where(eq(systemSettings.key, 'auto_regress_on_prior_open'));
  if (!rows.length) {
    await db.execute(sql`INSERT INTO system_settings (key, value, created_at, updated_at) VALUES ('auto_regress_on_prior_open', '{"enabled": false}'::jsonb, now(), now())`);
  }
}

async function setAutoRegress(enabled: boolean) {
  await db.execute(sql`INSERT INTO system_settings (key, value, created_at, updated_at)
  VALUES ('auto_regress_on_prior_open', ${JSON.stringify({enabled})}::jsonb, now(), now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`);
}

async function run() {
  const s1 = await ensureStage('Stage 1', 1);
  const s2 = await ensureStage('Stage 2', 2);
  await ensureSetting();
  // Ensure basic reference data
  // Department
  let deptId: string = randomUUID();
  await db.execute(sql`INSERT INTO departments (id, name, archived, created_at, updated_at) VALUES (${deptId}::uuid, 'IT', false, now(), now()) ON CONFLICT (name) DO NOTHING`);
  const dept = await db.execute(sql`SELECT id FROM departments WHERE name = 'IT' LIMIT 1`);
  // @ts-ignore
  deptId = (dept.rows[0]?.id) || deptId;

  // Candidate Type
  let ctypeId: string = randomUUID();
  await db.execute(sql`INSERT INTO candidate_types (id, name, created_at, updated_at) VALUES (${ctypeId}::uuid, 'Staff', now(), now()) ON CONFLICT (name) DO NOTHING`);
  const ctype = await db.execute(sql`SELECT id FROM candidate_types WHERE name = 'Staff' LIMIT 1`);
  // @ts-ignore
  ctypeId = (ctype.rows[0]?.id) || ctypeId;

  // Task Category
  let catId: string = randomUUID();
  await db.execute(sql`INSERT INTO task_categories (id, name, created_at, updated_at) VALUES (${catId}::uuid, 'General', now(), now()) ON CONFLICT (name) DO NOTHING`);
  const cat = await db.execute(sql`SELECT id FROM task_categories WHERE name = 'General' LIMIT 1`);
  // @ts-ignore
  catId = (cat.rows[0]?.id) || catId;

  // Ensure a user exists and capture id (schema may vary)
  let userId: string = randomUUID();
  // Try new schema (first_name/last_name)
  try {
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role, status, active, created_at, updated_at)
      VALUES (${userId}::uuid, 'smoke@example.com', 'Smoke', 'Tester', 'hr_staff'::role, 'active'::user_status, true, now(), now())`);
  } catch {
    // Fallback to legacy single name column
    await db.execute(sql`INSERT INTO users (id, email, name, password_hash, role, active, created_at, updated_at)
      VALUES (${userId}::uuid, 'smoke@example.com', 'Smoke Tester', 'x', 'hr_staff'::role, true, now(), now())`);
  }

  // Create candidate at Stage 2
  const candidateId = randomUUID();
  await db.execute(sql`INSERT INTO candidates (id, first_name, last_name, email, candidate_type_id, department_id, status, current_stage_id, start_date, created_at, updated_at)
    VALUES (${candidateId}::uuid, 'Test', 'Candidate', 'test@example.com', ${ctypeId}::uuid, ${deptId}::uuid, 'active', ${s2.id}::uuid, now()::date, now(), now())`);

  // Create an open task in prior Stage 1
  const taskId = randomUUID();
  await db.execute(sql`INSERT INTO candidate_tasks (id, candidate_id, title, stage_id, priority, category_id, status, required, created_at, updated_at)
    VALUES (${taskId}::uuid, ${candidateId}::uuid, 'Prior Task', ${s1.id}::uuid, 'medium', ${catId}::uuid, 'todo', true, now(), now())`);

  // With auto-regress disabled
  await setAutoRegress(false);
  let result = await recomputeCandidateStageState({ candidateId, invokerUserId: userId });
  const [cand1] = await db.select().from(candidates).where(eq(candidates.id, candidateId));
  console.log('AutoRegress=false result:', result);
  console.log('Candidate flags:', { isBlockedByPriorStage: cand1.isBlockedByPriorStage, currentStageId: cand1.currentStageId });

  // With auto-regress enabled
  await setAutoRegress(true);
  result = await recomputeCandidateStageState({ candidateId, invokerUserId: userId });
  const [cand2] = await db.select().from(candidates).where(eq(candidates.id, candidateId));
  const history = await db.select().from(candidateStageHistory).where(eq(candidateStageHistory.candidateId, candidateId));
  console.log('AutoRegress=true result:', result);
  console.log('Candidate flags after regress:', { isBlockedByPriorStage: cand2.isBlockedByPriorStage, currentStageId: cand2.currentStageId });
  console.log('Stage history count:', history.length);
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
