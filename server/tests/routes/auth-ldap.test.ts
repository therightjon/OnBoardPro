import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createAuthTestEnvironment } from "../utils/testEnvironment";
import { AUTH_FIXTURE_IDS, seedAuthorizationFixtures } from "../utils/seedAuthorizationFixtures";
import { createAuthedAgent } from "../utils/testAgent";

const FIXED_FILTER = "(sAMAccountName={{username}})";

async function setupTest(t: any) {
  const env = await createAuthTestEnvironment();
  const resetStorage = env.useAsGlobalStorage();
  await seedAuthorizationFixtures(env.storage);
  const { agent } = await createAuthedAgent({
    mockFactory: env.storage,
    userId: AUTH_FIXTURE_IDS.users.hrStaff
  });

  t.after(async () => {
    resetStorage();
    await env.dispose();
  });

  return { agent, storage: env.storage };
}

describe("LDAP Settings API", () => {
  test("GET /api/auth/ldap returns fixed filter even when legacy value is stored", async (t) => {
    const { agent, storage } = await setupTest(t);
    storage.setSystemSetting("auth.ldap", {
      url: "ldaps://ad.example.com:636",
      startTls: false,
      bindDn: "CN=svc,DC=example,DC=com",
      bindPassword: "secret",
      baseDn: "DC=example,DC=com",
      userFilter: "(uid={{username}})"
    });

    const response = await agent.get("/api/auth/ldap").expect(200);

    assert.equal(response.body.settings.userFilter, FIXED_FILTER);
  });

  test("PUT /api/auth/ldap ignores supplied userFilter and persists fixed template", async (t) => {
    const { agent, storage } = await setupTest(t);

    await agent
      .put("/api/auth/ldap")
      .send({
        url: "ldaps://ad.example.com:636",
        startTls: false,
        bindDn: "CN=svc,DC=example,DC=com",
        bindPassword: "secret",
        baseDn: "DC=example,DC=com",
        userFilter: "(uid={{username}})"
      })
      .expect(200);

    const stored = storage.data.systemSettings.get("auth.ldap");
    assert.ok(stored, "LDAP settings should be persisted in test storage");
    assert.equal(stored.userFilter, FIXED_FILTER);
  });

  test("POST /api/auth/ldap/test strips userFilter from payload instead of treating it as schema input", async (t) => {
    const { agent, storage } = await setupTest(t);

    // Seed an empty LDAP config so the mock doesn't fall back to env vars
    storage.setSystemSetting("auth.ldap", {});

    const response = await agent
      .post("/api/auth/ldap/test")
      .send({ userFilter: "(uid={{username}})" })
      .expect(400);

    assert.equal(
      response.body.message,
      "Missing required settings (url, bindDn, bindPassword, baseDn)"
    );
  });
});
