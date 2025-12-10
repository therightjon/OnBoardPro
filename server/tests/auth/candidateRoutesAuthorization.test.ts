import { test } from "node:test";
import assert from "node:assert/strict";
import { createAuthTestEnvironment } from "../utils/testEnvironment";
import { seedAuthorizationFixtures, AUTH_FIXTURE_IDS } from "../utils/seedAuthorizationFixtures";
import { createAuthedAgent } from "../utils/testAgent";

async function setupTest(t: any, userId: string) {
  const env = await createAuthTestEnvironment();
  const resetStorage = env.useAsGlobalStorage();
  const fixtures = await seedAuthorizationFixtures(env.storage);
  const { agent } = await createAuthedAgent({ mockFactory: env.storage, userId });

  t.after(async () => {
    resetStorage();
    await env.dispose();
  });

  return { agent, fixtures };
}

test("hr staff can list all candidates", async (t) => {
  const { agent, fixtures } = await setupTest(t, AUTH_FIXTURE_IDS.users.hrStaff);

  const response = await agent.get("/api/candidates").expect(200);
  const ids = response.body.map((candidate: any) => candidate.id);

  assert.deepEqual(new Set(ids), new Set([
    fixtures.candidates.alphaPrimary,
    fixtures.candidates.betaCandidate,
    fixtures.candidates.managedOnly
  ]));
});

test("department admin limited to their department", async (t) => {
  const { agent, fixtures } = await setupTest(t, AUTH_FIXTURE_IDS.users.departmentAdmin);

  const response = await agent.get("/api/candidates").expect(200);
  const ids = response.body.map((candidate: any) => candidate.id);

  assert.deepEqual(new Set(ids), new Set([
    fixtures.candidates.alphaPrimary
  ]));
});

test("division leader limited to their division", async (t) => {
  const { agent, fixtures } = await setupTest(t, AUTH_FIXTURE_IDS.users.divisionLeader);

  const response = await agent.get("/api/candidates").expect(200);
  const ids = response.body.map((candidate: any) => candidate.id);

  assert.deepEqual(new Set(ids), new Set([
    fixtures.candidates.alphaPrimary
  ]));
});

test("manager sees direct reports and scoped candidates", async (t) => {
  const { agent, fixtures } = await setupTest(t, AUTH_FIXTURE_IDS.users.manager);

  const response = await agent.get("/api/candidates").expect(200);
  const ids = response.body.map((candidate: any) => candidate.id);

  assert.deepEqual(new Set(ids), new Set([
    fixtures.candidates.alphaPrimary,
    fixtures.candidates.managedOnly
  ]));
});

test("candidate sees only their record with sanitized fields", async (t) => {
  const { agent, fixtures } = await setupTest(t, AUTH_FIXTURE_IDS.users.candidateUser);

  const response = await agent.get("/api/candidates").expect(200);
  assert.equal(response.body.length, 1);
  const candidate = response.body[0];
  assert.equal(candidate.id, fixtures.candidates.alphaPrimary);
  assert.equal(candidate.templateAppliedFromId, undefined);
  assert.equal(candidate.templateLocked, undefined);
});

test("department admin cannot access candidate outside scope", async (t) => {
  const { agent, fixtures } = await setupTest(t, AUTH_FIXTURE_IDS.users.departmentAdmin);

  await agent
    .get(`/api/candidates/${fixtures.candidates.betaCandidate}`)
    .expect(404);
});

test("manager can view candidate detail in scope", async (t) => {
  const { agent, fixtures } = await setupTest(t, AUTH_FIXTURE_IDS.users.manager);

  const response = await agent
    .get(`/api/candidates/${fixtures.candidates.alphaPrimary}`)
    .expect(200);

  assert.equal(response.body.id, fixtures.candidates.alphaPrimary);
});

test("manager cannot view candidate outside scope", async (t) => {
  const { agent, fixtures } = await setupTest(t, AUTH_FIXTURE_IDS.users.manager);

  await agent
    .get(`/api/candidates/${fixtures.candidates.betaCandidate}`)
    .expect(404);
});

test("manager task feed respects scopes", async (t) => {
  const { agent, fixtures } = await setupTest(t, AUTH_FIXTURE_IDS.users.manager);

  const response = await agent.get("/api/tasks/mine").expect(200);
  const taskIds = response.body.map((task: any) => task.id).sort();
  assert.deepEqual(taskIds, [
    fixtures.tasks.alphaTask,
    fixtures.tasks.managedTask
  ]);
});

test("candidate task detail is sanitized", async (t) => {
  const { agent, fixtures } = await setupTest(t, AUTH_FIXTURE_IDS.users.candidateUser);

  const response = await agent
    .get(`/api/candidates/${fixtures.candidates.alphaPrimary}/tasks`)
    .expect(200);

  const task = response.body[0];
  assert.ok(task);
  assert.equal(task.assigneeUserId, undefined);
  assert.equal(task.description, undefined);

  await agent
    .get(`/api/tasks/${fixtures.tasks.betaTask}`)
    .expect(404);
});
