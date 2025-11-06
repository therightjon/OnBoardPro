import { test } from "node:test";
import assert from "node:assert/strict";
import { createAuthTestEnvironment } from "../utils/testEnvironment";
import { seedAuthorizationFixtures } from "../utils/seedAuthorizationFixtures";
import { createAuthedAgent } from "../utils/testAgent";

const IDS = {
  users: {
    systemAdmin: "f1111111-1111-1111-1111-111111111111",
    hrStaff: "f2222222-2222-2222-2222-222222222222",
    departmentAdmin: "f3333333-3333-3333-3333-333333333333",
    divisionLeader: "f4444444-4444-4444-4444-444444444444",
    manager: "f5555555-5555-5555-5555-555555555555",
    dualRole: "f6666666-6666-6666-6666-666666666666",
    candidateUser: "f7777777-7777-7777-7777-777777777777"
  },
  candidates: {
    alphaPrimary: "f8888888-8888-8888-8888-888888888888",
    betaCandidate: "f9999999-9999-9999-9999-999999999999",
    managedOnly: "fababab0-0000-0000-0000-000000000000"
  },
  tasks: {
    alphaTask: "fcdcdcdc-dcdc-dcdc-dcdc-dcdcdcdcdcdc",
    betaTask: "fdeedeee-deee-deee-deee-deeedeeedeee",
    managedTask: "fff0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0"
  }
} as const;

async function setupTest(t: any, userId: string) {
  const env = await createAuthTestEnvironment();
  const resetStorage = env.useAsGlobalStorage();
  const fixtures = await seedAuthorizationFixtures(env.storage);
  const { agent } = await createAuthedAgent({ storage: env.storage, userId });

  t.after(async () => {
    resetStorage();
    await env.dispose();
  });

  return { agent, fixtures };
}

test("hr staff can list all candidates", async (t) => {
  const { agent, fixtures } = await setupTest(t, IDS.users.hrStaff);

  const response = await agent.get("/api/candidates").expect(200);
  const ids = response.body.map((candidate: any) => candidate.id);

  assert.deepEqual(new Set(ids), new Set([
    fixtures.candidates.alphaPrimary,
    fixtures.candidates.betaCandidate,
    fixtures.candidates.managedOnly
  ]));
});

test("department admin limited to their department", async (t) => {
  const { agent, fixtures } = await setupTest(t, IDS.users.departmentAdmin);

  const response = await agent.get("/api/candidates").expect(200);
  const ids = response.body.map((candidate: any) => candidate.id);

  assert.deepEqual(new Set(ids), new Set([
    fixtures.candidates.alphaPrimary
  ]));
});

test("division leader limited to their division", async (t) => {
  const { agent, fixtures } = await setupTest(t, IDS.users.divisionLeader);

  const response = await agent.get("/api/candidates").expect(200);
  const ids = response.body.map((candidate: any) => candidate.id);

  assert.deepEqual(new Set(ids), new Set([
    fixtures.candidates.alphaPrimary
  ]));
});

test("manager sees direct reports and scoped candidates", async (t) => {
  const { agent, fixtures } = await setupTest(t, IDS.users.manager);

  const response = await agent.get("/api/candidates").expect(200);
  const ids = response.body.map((candidate: any) => candidate.id);

  assert.deepEqual(new Set(ids), new Set([
    fixtures.candidates.alphaPrimary,
    fixtures.candidates.managedOnly
  ]));
});

test("candidate sees only their record with sanitized fields", async (t) => {
  const { agent, fixtures } = await setupTest(t, IDS.users.candidateUser);

  const response = await agent.get("/api/candidates").expect(200);
  assert.equal(response.body.length, 1);
  const candidate = response.body[0];
  assert.equal(candidate.id, fixtures.candidates.alphaPrimary);
  assert.equal(candidate.templateAppliedFromId, undefined);
  assert.equal(candidate.templateLocked, undefined);
});

test("department admin cannot access candidate outside scope", async (t) => {
  const { agent, fixtures } = await setupTest(t, IDS.users.departmentAdmin);

  await agent
    .get(`/api/candidates/${fixtures.candidates.betaCandidate}`)
    .expect(404);
});

test("manager can view candidate detail in scope", async (t) => {
  const { agent, fixtures } = await setupTest(t, IDS.users.manager);

  const response = await agent
    .get(`/api/candidates/${fixtures.candidates.alphaPrimary}`)
    .expect(200);

  assert.equal(response.body.id, fixtures.candidates.alphaPrimary);
});

test("manager cannot view candidate outside scope", async (t) => {
  const { agent, fixtures } = await setupTest(t, IDS.users.manager);

  await agent
    .get(`/api/candidates/${fixtures.candidates.betaCandidate}`)
    .expect(404);
});

test("manager task feed respects scopes", async (t) => {
  const { agent, fixtures } = await setupTest(t, IDS.users.manager);

  const response = await agent.get("/api/tasks/mine").expect(200);
  const taskIds = response.body.map((task: any) => task.id).sort();
  assert.deepEqual(taskIds, [
    fixtures.tasks.alphaTask,
    fixtures.tasks.managedTask
  ]);
});

test("candidate task detail is sanitized", async (t) => {
  const { agent, fixtures } = await setupTest(t, IDS.users.candidateUser);

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
