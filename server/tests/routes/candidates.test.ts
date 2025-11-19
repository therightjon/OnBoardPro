import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createAuthTestEnvironment } from "../utils/testEnvironment";
import { seedAuthorizationFixtures } from "../utils/seedAuthorizationFixtures";
import { createAuthedAgent } from "../utils/testAgent";
import type { InMemoryStorage } from "../utils/inMemoryStorage";

const IDS = {
  users: {
    systemAdmin: "f1111111-1111-1111-1111-111111111111",
    hrStaff: "f2222222-2222-2222-2222-222222222222",
    departmentAdmin: "f3333333-3333-3333-3333-333333333333",
    manager: "f5555555-5555-5555-5555-555555555555",
    candidateUser: "f7777777-7777-7777-7777-777777777777"
  },
  departments: {
    alpha: "11111111-1111-1111-1111-111111111111",
    beta: "22222222-2222-2222-2222-222222222222"
  },
  divisions: {
    alpha: "33333333-3333-3333-3333-333333333333",
  },
  candidates: {
    alphaPrimary: "f8888888-8888-8888-8888-888888888888",
    betaCandidate: "f9999999-9999-9999-9999-999999999999",
  },
  candidateTypes: {
    faculty: "55555555-5555-5555-5555-555555555555"
  },
  facultyRanks: {
    instructor: "66666666-6666-6666-6666-666666666666"
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

  return { agent, fixtures, storage: env.storage };
}

describe("Candidate API - Create Operations", () => {
  test("hr staff can create a new candidate", async (t) => {
    const { agent, storage } = await setupTest(t, IDS.users.hrStaff);

    const newCandidate = {
      firstName: "John",
      lastName: "Doe",
      email: "john.doe@example.com",
      departmentId: IDS.departments.alpha,
      divisionId: IDS.divisions.alpha,
      candidateTypeId: IDS.candidateTypes.faculty,
      facultyRankId: IDS.facultyRanks.instructor,
      currentStatus: "pending_documents"
    };

    const response = await agent
      .post("/api/candidates")
      .send(newCandidate)
      .expect(200);

    assert.ok(response.body.id, "Response should include candidate ID");
    assert.equal(response.body.firstName, "John");
    assert.equal(response.body.lastName, "Doe");
    assert.equal(response.body.email, "john.doe@example.com");
    assert.equal(response.body.departmentId, IDS.departments.alpha);

    // Verify candidate was actually created in storage
    const created = await storage.getCandidate(response.body.id);
    assert.ok(created, "Candidate should exist in storage");
    assert.equal(created?.firstName, "John");
  });

  test("candidate creation requires valid department", async (t) => {
    const { agent } = await setupTest(t, IDS.users.hrStaff);

    const newCandidate = {
      firstName: "John",
      lastName: "Doe",
      email: "john.doe@example.com",
      departmentId: "00000000-0000-0000-0000-000000000000", // Invalid department
      candidateTypeId: IDS.candidateTypes.faculty,
      currentStatus: "pending_documents"
    };

    await agent
      .post("/api/candidates")
      .send(newCandidate)
      .expect(400);
  });

  test("candidate creation requires all required fields", async (t) => {
    const { agent } = await setupTest(t, IDS.users.hrStaff);

    const incompleteCandidate = {
      firstName: "John"
      // Missing required fields
    };

    await agent
      .post("/api/candidates")
      .send(incompleteCandidate)
      .expect(400);
  });

  test("candidate creation with duplicate email should fail", async (t) => {
    const { agent } = await setupTest(t, IDS.users.hrStaff);

    const newCandidate = {
      firstName: "Alpha",
      lastName: "Primary",
      email: "alpha.primary@example.com", // Duplicate email from fixtures
      departmentId: IDS.departments.alpha,
      candidateTypeId: IDS.candidateTypes.faculty,
      currentStatus: "pending_documents"
    };

    await agent
      .post("/api/candidates")
      .send(newCandidate)
      .expect(400);
  });

  test("manager cannot create candidates", async (t) => {
    const { agent } = await setupTest(t, IDS.users.manager);

    const newCandidate = {
      firstName: "John",
      lastName: "Doe",
      email: "john.doe@example.com",
      departmentId: IDS.departments.alpha,
      candidateTypeId: IDS.candidateTypes.faculty,
      currentStatus: "pending_documents"
    };

    await agent
      .post("/api/candidates")
      .send(newCandidate)
      .expect(403);
  });
});

describe("Candidate API - Read Operations", () => {
  test("hr staff can list all candidates", async (t) => {
    const { agent, fixtures } = await setupTest(t, IDS.users.hrStaff);

    const response = await agent.get("/api/candidates").expect(200);

    assert.ok(Array.isArray(response.body), "Response should be an array");
    assert.ok(response.body.length >= 3, "Should have at least 3 candidates from fixtures");

    const ids = response.body.map((c: any) => c.id);
    assert.ok(ids.includes(fixtures.candidates.alphaPrimary), "Should include alphaPrimary");
    assert.ok(ids.includes(fixtures.candidates.betaCandidate), "Should include betaCandidate");
  });

  test("hr staff can get candidate by id", async (t) => {
    const { agent, fixtures } = await setupTest(t, IDS.users.hrStaff);

    const response = await agent
      .get(`/api/candidates/${fixtures.candidates.alphaPrimary}`)
      .expect(200);

    assert.equal(response.body.id, fixtures.candidates.alphaPrimary);
    assert.ok(response.body.firstName, "Should have firstName");
    assert.ok(response.body.lastName, "Should have lastName");
    assert.ok(response.body.email, "Should have email");
  });

  test("get candidate with invalid id returns 404", async (t) => {
    const { agent } = await setupTest(t, IDS.users.hrStaff);

    await agent
      .get("/api/candidates/00000000-0000-0000-0000-000000000000")
      .expect(404);
  });

  test("candidates list supports filtering by department", async (t) => {
    const { agent, fixtures } = await setupTest(t, IDS.users.hrStaff);

    const response = await agent
      .get("/api/candidates")
      .query({ departmentId: IDS.departments.alpha })
      .expect(200);

    assert.ok(Array.isArray(response.body));

    // All candidates should belong to alpha department
    for (const candidate of response.body) {
      assert.equal(candidate.departmentId, IDS.departments.alpha);
    }
  });

  test("candidates list supports search by name", async (t) => {
    const { agent } = await setupTest(t, IDS.users.hrStaff);

    const response = await agent
      .get("/api/candidates")
      .query({ search: "Alpha" })
      .expect(200);

    assert.ok(Array.isArray(response.body));
    assert.ok(response.body.length >= 1, "Should find at least one match");

    // Verify search results contain the search term
    const hasMatch = response.body.some((c: any) =>
      c.firstName?.includes("Alpha") ||
      c.lastName?.includes("Alpha") ||
      c.email?.includes("alpha")
    );
    assert.ok(hasMatch, "Search results should contain matching candidates");
  });

  test("department admin only sees candidates in their department", async (t) => {
    const { agent, fixtures } = await setupTest(t, IDS.users.departmentAdmin);

    const response = await agent.get("/api/candidates").expect(200);

    // Department admin should only see alpha department candidates
    for (const candidate of response.body) {
      assert.equal(candidate.departmentId, IDS.departments.alpha);
    }

    // Should not include beta candidate
    const ids = response.body.map((c: any) => c.id);
    assert.ok(!ids.includes(fixtures.candidates.betaCandidate));
  });

  test("unauthenticated request returns 401", async (t) => {
    const env = await createAuthTestEnvironment();
    const resetStorage = env.useAsGlobalStorage();
    const { agent } = await createAuthedAgent({
      storage: env.storage,
      userId: null // No user
    });

    t.after(async () => {
      resetStorage();
      await env.dispose();
    });

    await agent.get("/api/candidates").expect(401);
  });
});

describe("Candidate API - Update Operations", () => {
  test("hr staff can update candidate details", async (t) => {
    const { agent, fixtures } = await setupTest(t, IDS.users.hrStaff);

    const updates = {
      firstName: "UpdatedFirst",
      lastName: "UpdatedLast",
      phoneNumber: "+1-555-0123"
    };

    const response = await agent
      .put(`/api/candidates/${fixtures.candidates.alphaPrimary}`)
      .send(updates)
      .expect(200);

    assert.equal(response.body.firstName, "UpdatedFirst");
    assert.equal(response.body.lastName, "UpdatedLast");
    assert.equal(response.body.phoneNumber, "+1-555-0123");
    assert.equal(response.body.id, fixtures.candidates.alphaPrimary);
  });

  test("update preserves fields not included in request", async (t) => {
    const { agent, fixtures, storage } = await setupTest(t, IDS.users.hrStaff);

    // Get original candidate
    const original = await storage.getCandidate(fixtures.candidates.alphaPrimary);
    assert.ok(original);

    const updates = {
      phoneNumber: "+1-555-9999"
    };

    const response = await agent
      .put(`/api/candidates/${fixtures.candidates.alphaPrimary}`)
      .send(updates)
      .expect(200);

    // Original fields should be preserved
    assert.equal(response.body.firstName, original.firstName);
    assert.equal(response.body.lastName, original.lastName);
    assert.equal(response.body.email, original.email);

    // Updated field should change
    assert.equal(response.body.phoneNumber, "+1-555-9999");
  });

  test("cannot update candidate email to duplicate", async (t) => {
    const { agent, fixtures, storage } = await setupTest(t, IDS.users.hrStaff);

    const betaCandidate = await storage.getCandidate(fixtures.candidates.betaCandidate);
    assert.ok(betaCandidate);

    const updates = {
      email: betaCandidate.email // Try to use beta's email
    };

    await agent
      .put(`/api/candidates/${fixtures.candidates.alphaPrimary}`)
      .send(updates)
      .expect(400);
  });

  test("manager cannot update candidates", async (t) => {
    const { agent, fixtures } = await setupTest(t, IDS.users.manager);

    const updates = {
      firstName: "Unauthorized"
    };

    await agent
      .put(`/api/candidates/${fixtures.candidates.alphaPrimary}`)
      .send(updates)
      .expect(403);
  });

  test("department admin cannot update candidates outside their scope", async (t) => {
    const { agent, fixtures } = await setupTest(t, IDS.users.departmentAdmin);

    const updates = {
      firstName: "Unauthorized"
    };

    await agent
      .put(`/api/candidates/${fixtures.candidates.betaCandidate}`)
      .send(updates)
      .expect(404);
  });

  test("update with invalid id returns 404", async (t) => {
    const { agent } = await setupTest(t, IDS.users.hrStaff);

    await agent
      .put("/api/candidates/00000000-0000-0000-0000-000000000000")
      .send({ firstName: "Test" })
      .expect(404);
  });
});

describe("Candidate API - Delete Operations", () => {
  test("hr staff can delete a candidate", async (t) => {
    const { agent, storage } = await setupTest(t, IDS.users.hrStaff);

    // Create a candidate to delete
    const newCandidate = {
      firstName: "ToDelete",
      lastName: "Candidate",
      email: "todelete@example.com",
      departmentId: IDS.departments.alpha,
      candidateTypeId: IDS.candidateTypes.faculty,
      currentStatus: "pending_documents"
    };

    const createResponse = await agent
      .post("/api/candidates")
      .send(newCandidate)
      .expect(200);

    const candidateId = createResponse.body.id;

    // Delete the candidate
    await agent
      .delete(`/api/candidates/${candidateId}`)
      .expect(200);

    // Verify deletion
    const deleted = await storage.getCandidate(candidateId);
    assert.equal(deleted, null, "Candidate should be deleted");
  });

  test("delete with invalid id returns 404", async (t) => {
    const { agent } = await setupTest(t, IDS.users.hrStaff);

    await agent
      .delete("/api/candidates/00000000-0000-0000-0000-000000000000")
      .expect(404);
  });

  test("manager cannot delete candidates", async (t) => {
    const { agent, fixtures } = await setupTest(t, IDS.users.manager);

    await agent
      .delete(`/api/candidates/${fixtures.candidates.alphaPrimary}`)
      .expect(403);
  });

  test("department admin cannot delete candidates outside their scope", async (t) => {
    const { agent, fixtures } = await setupTest(t, IDS.users.departmentAdmin);

    await agent
      .delete(`/api/candidates/${fixtures.candidates.betaCandidate}`)
      .expect(404);
  });
});

describe("Candidate API - Status Operations", () => {
  test("hr staff can update candidate status", async (t) => {
    const { agent, fixtures } = await setupTest(t, IDS.users.hrStaff);

    const response = await agent
      .put(`/api/candidates/${fixtures.candidates.alphaPrimary}`)
      .send({ currentStatus: "active" })
      .expect(200);

    assert.equal(response.body.currentStatus, "active");
  });

  test("status update validates against allowed statuses", async (t) => {
    const { agent, fixtures } = await setupTest(t, IDS.users.hrStaff);

    await agent
      .put(`/api/candidates/${fixtures.candidates.alphaPrimary}`)
      .send({ currentStatus: "invalid_status" })
      .expect(400);
  });
});

describe("Candidate API - Pagination and Sorting", () => {
  test("candidates list supports pagination", async (t) => {
    const { agent } = await setupTest(t, IDS.users.hrStaff);

    const response = await agent
      .get("/api/candidates")
      .query({ limit: 2, offset: 0 })
      .expect(200);

    assert.ok(Array.isArray(response.body));
    assert.ok(response.body.length <= 2, "Should respect limit");
  });

  test("candidates list supports sorting by name", async (t) => {
    const { agent } = await setupTest(t, IDS.users.hrStaff);

    const response = await agent
      .get("/api/candidates")
      .query({ sortBy: "lastName", sortOrder: "asc" })
      .expect(200);

    assert.ok(Array.isArray(response.body));

    // Verify ascending order
    for (let i = 1; i < response.body.length; i++) {
      const prev = response.body[i - 1].lastName;
      const curr = response.body[i].lastName;
      assert.ok(prev <= curr, `Candidates should be sorted: ${prev} <= ${curr}`);
    }
  });
});
