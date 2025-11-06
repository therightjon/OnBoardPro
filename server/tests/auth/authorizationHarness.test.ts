import { test } from "node:test";
import assert from "node:assert/strict";
import { createAuthTestEnvironment } from "../utils/testEnvironment";
import { seedAuthorizationFixtures } from "../utils/seedAuthorizationFixtures";
import { buildUserSessionPayload } from "../utils/testAgent";

test("manager authorization context includes scoped candidates", async (t) => {
  const env = await createAuthTestEnvironment();
  const resetStorage = env.useAsGlobalStorage();

  const fixtures = await seedAuthorizationFixtures(env.storage);
  const managerSession = await buildUserSessionPayload(env.storage, fixtures.users.manager);
  assert.ok(managerSession, "manager user should exist in fixtures");

  const context = await env.storage.buildAuthorizationContext(managerSession);
  assert.ok(context.managedCandidateIds.has(fixtures.candidates.managedOnly), "managed candidate should be visible to manager");

  t.after(async () => {
    resetStorage();
    await env.dispose();
  });
});
