import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createAuthTestEnvironment } from "../utils/testEnvironment";
import { createAuthedAgent } from "../utils/testAgent";

async function setupTest(t: any, userId: string | null = null) {
  const env = await createAuthTestEnvironment();
  const resetStorage = env.useAsGlobalStorage();
  const previousEnableInvitations = process.env.ENABLE_INVITATIONS;
  process.env.ENABLE_INVITATIONS = "false";

  const { agent } = await createAuthedAgent({
    mockFactory: env.storage,
    userId
  });

  t.after(async () => {
    if (previousEnableInvitations === undefined) {
      delete process.env.ENABLE_INVITATIONS;
    } else {
      process.env.ENABLE_INVITATIONS = previousEnableInvitations;
    }
    resetStorage();
    await env.dispose();
  });

  return { agent, storage: env.storage };
}

describe("Security hardening - invitations disabled by default", () => {
  test("POST /api/invitations returns 404 when invitations are disabled", async (t) => {
    const { agent } = await setupTest(t);

    await agent
      .post("/api/invitations")
      .send({
        email: "new.user@example.com",
        roles: ["hr_staff"]
      })
      .expect(404);
  });

  test("DELETE /api/invitations/:id returns 404 when invitations are disabled", async (t) => {
    const { agent } = await setupTest(t);

    await agent
      .delete("/api/invitations/test-id")
      .expect(404);
  });

  test("POST /api/invitations/accept returns 404 when invitations are disabled", async (t) => {
    const { agent } = await setupTest(t);

    await agent
      .post("/api/invitations/accept")
      .send({ token: "test-token" })
      .expect(404);
  });

  test("GET /api/users does not include invitation pseudo-users when invitations are disabled", async (t) => {
    const adminId = "test-admin-user";
    const { storage } = await setupTest(t);

    await storage.createUser({
      id: adminId,
      email: "admin@example.com",
      firstName: "Admin",
      lastName: "User",
      mentionKey: "admin.user",
      passwordHash: "hashed",
      role: "system_admin",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await storage.createUser({
      id: "test-staff-user",
      email: "staff@example.com",
      firstName: "Staff",
      lastName: "User",
      mentionKey: "staff.user",
      passwordHash: "hashed",
      role: "hr_staff",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const { agent } = await createAuthedAgent({
      mockFactory: storage,
      userId: adminId
    });

    const response = await agent
      .get("/api/users")
      .expect(200);

    assert.ok(Array.isArray(response.body), "Response should be an array");
    assert.equal(
      response.body.some((user: any) => typeof user.id === "string" && user.id.startsWith("invite:")),
      false,
      "Invitation pseudo-users should not be returned when invitations are disabled"
    );
  });
});
