import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createAuthTestEnvironment } from "../utils/testEnvironment";
import type { User } from "@shared/schemas";

/**
 * Integration tests for UserRepository
 *
 * These tests use InMemoryStorage to test actual repository behavior
 * without requiring a real database connection.
 */

test("UserRepository: creates and retrieves user by ID", async (t) => {
  const env = await createAuthTestEnvironment();
  const resetStorage = env.useAsGlobalStorage();

  const userId = randomUUID();
  const user: User = {
    id: userId,
    email: "test@example.com",
    firstName: "John",
    lastName: "Doe",
    password: "hashed_password",
    role: "hr_staff",
    phone: null,
    departmentId: null,
    divisionId: null,
    managerId: null,
    enabled: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  // Use InMemoryStorage to insert user
  env.storage.upsertUser(user, { roles: ["hr_staff"] });

  // Retrieve user
  const retrieved = await env.storage.getUser(userId);

  assert.ok(retrieved, "User should be retrieved");
  assert.equal(retrieved.email, "test@example.com");
  assert.equal(retrieved.firstName, "John");
  assert.equal(retrieved.lastName, "Doe");
  assert.equal(retrieved.role, "hr_staff");

  t.after(async () => {
    resetStorage();
    await env.dispose();
  });
});

test("UserRepository: retrieves user by email (case-insensitive)", async (t) => {
  const env = await createAuthTestEnvironment();
  const resetStorage = env.useAsGlobalStorage();

  const user: User = {
    id: randomUUID(),
    email: "Jane.Doe@Example.COM",
    firstName: "Jane",
    lastName: "Doe",
    password: "hashed_password",
    role: "manager",
    phone: null,
    departmentId: null,
    divisionId: null,
    managerId: null,
    enabled: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  env.storage.upsertUser(user);

  // Search with different case
  const retrieved = await env.storage.getUserByEmail("jane.doe@example.com");

  assert.ok(retrieved, "User should be found with case-insensitive email");
  assert.equal(retrieved.email, "Jane.Doe@Example.COM");
  assert.equal(retrieved.firstName, "Jane");

  t.after(async () => {
    resetStorage();
    await env.dispose();
  });
});

test("UserRepository: retrieves user roles correctly", async (t) => {
  const env = await createAuthTestEnvironment();
  const resetStorage = env.useAsGlobalStorage();

  const userId = randomUUID();
  const user: User = {
    id: userId,
    email: "admin@example.com",
    firstName: "Admin",
    lastName: "User",
    password: "hashed_password",
    role: "system_admin",
    phone: null,
    departmentId: null,
    divisionId: null,
    managerId: null,
    enabled: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  // Add user with multiple roles
  env.storage.upsertUser(user, { roles: ["system_admin", "hr_staff"] });

  // Get roles
  const roles = await env.storage.getUserRoles(userId);

  assert.ok(roles.length >= 2, "Should have at least 2 roles");
  const roleNames = new Set(roles.map(r => r.role));
  assert.ok(roleNames.has("system_admin"), "Should have system_admin role");
  assert.ok(roleNames.has("hr_staff"), "Should have hr_staff role");

  t.after(async () => {
    resetStorage();
    await env.dispose();
  });
});

test("UserRepository: manages department scopes", async (t) => {
  const env = await createAuthTestEnvironment();
  const resetStorage = env.useAsGlobalStorage();

  const userId = randomUUID();
  const dept1 = randomUUID();
  const dept2 = randomUUID();

  const user: User = {
    id: userId,
    email: "dept.admin@example.com",
    firstName: "Dept",
    lastName: "Admin",
    password: "hashed_password",
    role: "department_admin",
    phone: null,
    departmentId: dept1,
    divisionId: null,
    managerId: null,
    enabled: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  env.storage.upsertUser(user, {
    roles: ["department_admin"],
    departmentScopes: [dept1, dept2]
  });

  const scopes = await env.storage.getUserDepartmentScopeIds(userId);

  assert.equal(scopes.length, 2, "Should have 2 department scopes");
  assert.ok(scopes.includes(dept1), "Should include first department");
  assert.ok(scopes.includes(dept2), "Should include second department");

  t.after(async () => {
    resetStorage();
    await env.dispose();
  });
});

test("UserRepository: manages division scopes", async (t) => {
  const env = await createAuthTestEnvironment();
  const resetStorage = env.useAsGlobalStorage();

  const userId = randomUUID();
  const div1 = randomUUID();
  const div2 = randomUUID();

  const user: User = {
    id: userId,
    email: "div.leader@example.com",
    firstName: "Division",
    lastName: "Leader",
    password: "hashed_password",
    role: "division_leader",
    phone: null,
    departmentId: null,
    divisionId: div1,
    managerId: null,
    enabled: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  env.storage.upsertUser(user, {
    roles: ["division_leader"],
    divisionScopes: [div1, div2]
  });

  const scopes = await env.storage.getUserDivisionScopeIds(userId);

  assert.equal(scopes.length, 2, "Should have 2 division scopes");
  assert.ok(scopes.includes(div1), "Should include first division");
  assert.ok(scopes.includes(div2), "Should include second division");

  t.after(async () => {
    resetStorage();
    await env.dispose();
  });
});

test("UserRepository: manages manager candidate scopes", async (t) => {
  const env = await createAuthTestEnvironment();
  const resetStorage = env.useAsGlobalStorage();

  const userId = randomUUID();
  const candidate1 = randomUUID();
  const candidate2 = randomUUID();
  const candidate3 = randomUUID();

  const user: User = {
    id: userId,
    email: "manager@example.com",
    firstName: "Test",
    lastName: "Manager",
    password: "hashed_password",
    role: "manager",
    phone: null,
    departmentId: null,
    divisionId: null,
    managerId: null,
    enabled: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  env.storage.upsertUser(user, {
    roles: ["manager"],
    managedCandidateIds: [candidate1, candidate2, candidate3]
  });

  const managedCandidates = await env.storage.getManagerCandidateScopeIds(userId);

  assert.equal(managedCandidates.length, 3, "Should manage 3 candidates");
  assert.ok(managedCandidates.includes(candidate1), "Should manage candidate 1");
  assert.ok(managedCandidates.includes(candidate2), "Should manage candidate 2");
  assert.ok(managedCandidates.includes(candidate3), "Should manage candidate 3");

  t.after(async () => {
    resetStorage();
    await env.dispose();
  });
});

test("UserRepository: returns undefined for non-existent user", async (t) => {
  const env = await createAuthTestEnvironment();
  const resetStorage = env.useAsGlobalStorage();

  const nonExistentId = randomUUID();
  const user = await env.storage.getUser(nonExistentId);

  assert.equal(user, undefined, "Should return undefined for non-existent user");

  t.after(async () => {
    resetStorage();
    await env.dispose();
  });
});

test("UserRepository: returns undefined for non-existent email", async (t) => {
  const env = await createAuthTestEnvironment();
  const resetStorage = env.useAsGlobalStorage();

  const user = await env.storage.getUserByEmail("nonexistent@example.com");

  assert.equal(user, undefined, "Should return undefined for non-existent email");

  t.after(async () => {
    resetStorage();
    await env.dispose();
  });
});

test("UserRepository: handles user preferences", async (t) => {
  const env = await createAuthTestEnvironment();
  const resetStorage = env.useAsGlobalStorage();

  const userId = randomUUID();

  // Get preferences (should return undefined initially)
  let prefs = await env.storage.getUserPreferences(userId);
  assert.equal(prefs, undefined, "Should have no preferences initially");

  // Upsert preferences
  const updatedPrefs = await env.storage.upsertUserPreferences(userId, {
    notifyInApp: true,
    notifyEmail: true,
    digestFrequency: "daily",
    mytasksShowArchived: true
  });

  assert.ok(updatedPrefs, "Should return updated preferences");
  assert.equal(updatedPrefs.notifyInApp, true);
  assert.equal(updatedPrefs.notifyEmail, true);
  assert.equal(updatedPrefs.digestFrequency, "daily");
  assert.equal(updatedPrefs.mytasksShowArchived, true);

  // Retrieve preferences
  prefs = await env.storage.getUserPreferences(userId);
  assert.ok(prefs, "Should retrieve stored preferences");
  assert.equal(prefs.digestFrequency, "daily");

  t.after(async () => {
    resetStorage();
    await env.dispose();
  });
});
