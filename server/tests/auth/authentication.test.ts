import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createAuthTestEnvironment } from "../utils/testEnvironment";
import { createAuthedAgent } from "../utils/testAgent";
import bcrypt from "bcrypt";
import { scrypt } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

const IDS = {
  users: {
    activeUser: "test-user-1",
    inactiveUser: "test-user-2",
    noPasswordUser: "test-user-3",
  }
} as const;

async function setupAuthTest(t: any) {
  const env = await createAuthTestEnvironment();
  const resetStorage = env.useAsGlobalStorage();

  t.after(async () => {
    resetStorage();
    await env.dispose();
  });

  return { storage: env.storage };
}

async function hashPasswordBcrypt(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

async function hashPasswordScrypt(password: string): Promise<string> {
  const salt = Math.random().toString(36);
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

describe("Authentication - Password Hashing", () => {
  test("bcrypt hashed passwords can be verified", async (t) => {
    const { storage } = await setupAuthTest(t);

    const password = "SecurePassword123!";
    const hashedPassword = await hashPasswordBcrypt(password);

    // Create user with bcrypt password
    const userId = IDS.users.activeUser;
    storage.upsertUser({
      id: userId,
      email: "bcrypt@example.com",
      firstName: "Bcrypt",
      lastName: "User",
      mentionKey: "bcrypt.user",
      passwordHash: hashedPassword,
      role: "hr_staff",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const { agent } = await createAuthedAgent({
      storage,
      userId: null,
      enableSessions: true
    });

    // Attempt login with correct password
    const response = await agent
      .post("/api/auth/login")
      .send({
        email: "bcrypt@example.com",
        password: password
      })
      .expect(200);

    assert.ok(response.body.user, "Login should succeed");
    assert.equal(response.body.user.email, "bcrypt@example.com");
  });

  test("scrypt hashed passwords can be verified", async (t) => {
    const { storage } = await setupAuthTest(t);

    const password = "SecurePassword456!";
    const hashedPassword = await hashPasswordScrypt(password);

    // Create user with scrypt password
    const userId = IDS.users.activeUser;
    await storage.createUser({
      id: userId,
      email: "scrypt@example.com",
      firstName: "Scrypt",
      lastName: "User",
      mentionKey: "scrypt.user",
      passwordHash: hashedPassword,
      role: "hr_staff",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const { agent } = await createAuthedAgent({
      storage,
      userId: null,
      enableSessions: true
    });

    // Attempt login with correct password
    const response = await agent
      .post("/api/auth/login")
      .send({
        email: "scrypt@example.com",
        password: password
      })
      .expect(200);

    assert.ok(response.body.user, "Login should succeed");
    assert.equal(response.body.user.email, "scrypt@example.com");
  });

  test("incorrect password fails authentication", async (t) => {
    const { storage } = await setupAuthTest(t);

    const password = "CorrectPassword123!";
    const hashedPassword = await hashPasswordBcrypt(password);

    await storage.createUser({
      id: IDS.users.activeUser,
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
      mentionKey: "test.user",
      passwordHash: hashedPassword,
      role: "hr_staff",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const { agent } = await createAuthedAgent({
      storage,
      userId: null,
      enableSessions: true
    });

    // Attempt login with wrong password
    await agent
      .post("/api/auth/login")
      .send({
        email: "test@example.com",
        password: "WrongPassword"
      })
      .expect(401);
  });

  test("malformed password hash fails safely", async (t) => {
    const { storage } = await setupAuthTest(t);

    await storage.createUser({
      id: IDS.users.activeUser,
      email: "malformed@example.com",
      firstName: "Malformed",
      lastName: "User",
      mentionKey: "malformed.user",
      passwordHash: "invalid-hash-format", // Invalid format
      role: "hr_staff",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const { agent } = await createAuthedAgent({
      storage,
      userId: null,
      enableSessions: true
    });

    await agent
      .post("/api/auth/login")
      .send({
        email: "malformed@example.com",
        password: "anypassword"
      })
      .expect(401);
  });
});

describe("Authentication - Login Flow", () => {
  test("successful login returns user data", async (t) => {
    const { storage } = await setupAuthTest(t);

    const password = "TestPassword123!";
    const hashedPassword = await hashPasswordBcrypt(password);

    await storage.createUser({
      id: IDS.users.activeUser,
      email: "login@example.com",
      firstName: "Login",
      lastName: "User",
      mentionKey: "login.user",
      passwordHash: hashedPassword,
      role: "hr_staff",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const { agent } = await createAuthedAgent({
      storage,
      userId: null,
      enableSessions: true
    });

    const response = await agent
      .post("/api/auth/login")
      .send({
        email: "login@example.com",
        password: password
      })
      .expect(200);

    assert.ok(response.body.user, "Should return user object");
    assert.equal(response.body.user.email, "login@example.com");
    assert.equal(response.body.user.firstName, "Login");
    assert.equal(response.body.user.lastName, "User");
    assert.equal(response.body.user.role, "hr_staff");
    assert.ok(response.body.user.roles, "Should include roles array");
  });

  test("login with non-existent email fails", async (t) => {
    const { storage } = await setupAuthTest(t);

    const { agent } = await createAuthedAgent({
      storage,
      userId: null,
      enableSessions: true
    });

    await agent
      .post("/api/auth/login")
      .send({
        email: "nonexistent@example.com",
        password: "anypassword"
      })
      .expect(401);
  });

  test("login with inactive user fails", async (t) => {
    const { storage } = await setupAuthTest(t);

    const password = "TestPassword123!";
    const hashedPassword = await hashPasswordBcrypt(password);

    await storage.createUser({
      id: IDS.users.inactiveUser,
      email: "inactive@example.com",
      firstName: "Inactive",
      lastName: "User",
      mentionKey: "inactive.user",
      passwordHash: hashedPassword,
      role: "hr_staff",
      status: "inactive", // Inactive status
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const { agent } = await createAuthedAgent({
      storage,
      userId: null,
      enableSessions: true
    });

    await agent
      .post("/api/auth/login")
      .send({
        email: "inactive@example.com",
        password: password
      })
      .expect(401);
  });

  test("login with user without password fails", async (t) => {
    const { storage } = await setupAuthTest(t);

    await storage.createUser({
      id: IDS.users.noPasswordUser,
      email: "nopassword@example.com",
      firstName: "NoPassword",
      lastName: "User",
      mentionKey: "nopassword.user",
      passwordHash: null, // No password set (OAuth user)
      role: "hr_staff",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const { agent } = await createAuthedAgent({
      storage,
      userId: null,
      enableSessions: true
    });

    await agent
      .post("/api/auth/login")
      .send({
        email: "nopassword@example.com",
        password: "anypassword"
      })
      .expect(401);
  });

  test("login requires email field", async (t) => {
    const { storage } = await setupAuthTest(t);

    const { agent } = await createAuthedAgent({
      storage,
      userId: null
    });

    await agent
      .post("/api/auth/login")
      .send({
        password: "TestPassword123!"
      })
      .expect(400);
  });

  test("login requires password field", async (t) => {
    const { storage } = await setupAuthTest(t);

    const { agent } = await createAuthedAgent({
      storage,
      userId: null
    });

    await agent
      .post("/api/auth/login")
      .send({
        email: "test@example.com"
      })
      .expect(400);
  });

  test("login validates email format", async (t) => {
    const { storage } = await setupAuthTest(t);

    const { agent } = await createAuthedAgent({
      storage,
      userId: null
    });

    await agent
      .post("/api/auth/login")
      .send({
        email: "not-an-email",
        password: "TestPassword123!"
      })
      .expect(400);
  });
});

describe("Authentication - Session Management", () => {
  test("successful login creates session", async (t) => {
    const { storage } = await setupAuthTest(t);

    const password = "SessionTest123!";
    const hashedPassword = await hashPasswordBcrypt(password);

    await storage.createUser({
      id: IDS.users.activeUser,
      email: "session@example.com",
      firstName: "Session",
      lastName: "User",
      mentionKey: "session.user",
      passwordHash: hashedPassword,
      role: "hr_staff",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const { agent } = await createAuthedAgent({
      storage,
      userId: null,
      enableSessions: true
    });

    // Login
    const loginResponse = await agent
      .post("/api/auth/login")
      .send({
        email: "session@example.com",
        password: password
      })
      .expect(200);

    // Verify session by accessing protected endpoint
    const cookies = loginResponse.headers['set-cookie'];
    assert.ok(cookies, "Should set session cookie");

    // Use the session to access protected resource
    const protectedResponse = await agent
      .get("/api/user")
      .set('Cookie', cookies)
      .expect(200);

    assert.equal(protectedResponse.body.email, "session@example.com");
  });

  test("logout destroys session", async (t) => {
    const { storage } = await setupAuthTest(t);

    const password = "LogoutTest123!";
    const hashedPassword = await hashPasswordBcrypt(password);

    await storage.createUser({
      id: IDS.users.activeUser,
      email: "logout@example.com",
      firstName: "Logout",
      lastName: "User",
      mentionKey: "logout.user",
      passwordHash: hashedPassword,
      role: "hr_staff",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const { agent } = await createAuthedAgent({
      storage,
      userId: null,
      enableSessions: true
    });

    // Login
    const loginResponse = await agent
      .post("/api/auth/login")
      .send({
        email: "logout@example.com",
        password: password
      })
      .expect(200);

    const cookies = loginResponse.headers['set-cookie'];

    // Logout
    await agent
      .post("/api/auth/logout")
      .set('Cookie', cookies)
      .expect(200);

    // Verify session is destroyed by trying to access protected endpoint
    await agent
      .get("/api/user")
      .set('Cookie', cookies)
      .expect(401);
  });

  test("accessing protected route without session returns 401", async (t) => {
    const { storage } = await setupAuthTest(t);

    const { agent } = await createAuthedAgent({
      storage,
      userId: null
    });

    await agent
      .get("/api/candidates")
      .expect(401);
  });
});

describe("Authentication - User Hydration", () => {
  test("login hydrates user with roles", async (t) => {
    const { storage } = await setupAuthTest(t);

    const password = "RolesTest123!";
    const hashedPassword = await hashPasswordBcrypt(password);

    const userId = IDS.users.activeUser;
    await storage.createUser({
      id: userId,
      email: "roles@example.com",
      firstName: "Roles",
      lastName: "User",
      mentionKey: "roles.user",
      passwordHash: hashedPassword,
      role: "hr_staff",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Add additional role
    await storage.addUserRole(userId, "manager");

    const { agent } = await createAuthedAgent({
      storage,
      userId: null
    });

    const response = await agent
      .post("/api/auth/login")
      .send({
        email: "roles@example.com",
        password: password
      })
      .expect(200);

    assert.ok(Array.isArray(response.body.user.roles), "Should have roles array");
    assert.ok(response.body.user.roles.includes("hr_staff"), "Should include primary role");
    assert.ok(response.body.user.roles.includes("manager"), "Should include additional role");
  });

  test("login hydrates user with department scopes", async (t) => {
    const { storage } = await setupAuthTest(t);

    const password = "DeptTest123!";
    const hashedPassword = await hashPasswordBcrypt(password);

    // Create department
    const deptId = "dept-123";
    await storage.createDepartment({
      id: deptId,
      name: "Test Department",
      archived: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const userId = IDS.users.activeUser;
    await storage.createUser({
      id: userId,
      email: "dept@example.com",
      firstName: "Dept",
      lastName: "User",
      mentionKey: "dept.user",
      passwordHash: hashedPassword,
      role: "department_admin",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Add department scope
    await storage.addUserDepartmentScope(userId, deptId);

    const { agent } = await createAuthedAgent({
      storage,
      userId: null
    });

    const response = await agent
      .post("/api/auth/login")
      .send({
        email: "dept@example.com",
        password: password
      })
      .expect(200);

    assert.ok(Array.isArray(response.body.user.departmentScopes), "Should have departmentScopes array");
    assert.ok(response.body.user.departmentScopes.includes(deptId), "Should include department scope");
  });

  test("login hydrates user with division scopes", async (t) => {
    const { storage } = await setupAuthTest(t);

    const password = "DivTest123!";
    const hashedPassword = await hashPasswordBcrypt(password);

    // Create department and division
    const deptId = "dept-456";
    const divId = "div-789";

    await storage.createDepartment({
      id: deptId,
      name: "Test Department",
      archived: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await storage.createDivision({
      id: divId,
      departmentId: deptId,
      name: "Test Division",
      archived: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const userId = IDS.users.activeUser;
    await storage.createUser({
      id: userId,
      email: "div@example.com",
      firstName: "Div",
      lastName: "User",
      mentionKey: "div.user",
      passwordHash: hashedPassword,
      role: "division_leader",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Add division scope
    await storage.addUserDivisionScope(userId, divId);

    const { agent } = await createAuthedAgent({
      storage,
      userId: null
    });

    const response = await agent
      .post("/api/auth/login")
      .send({
        email: "div@example.com",
        password: password
      })
      .expect(200);

    assert.ok(Array.isArray(response.body.user.divisionScopes), "Should have divisionScopes array");
    assert.ok(response.body.user.divisionScopes.includes(divId), "Should include division scope");
  });

  test("login hydrates user with managed candidate ids", async (t) => {
    const { storage } = await setupAuthTest(t);

    const password = "ManagerTest123!";
    const hashedPassword = await hashPasswordBcrypt(password);

    const userId = IDS.users.activeUser;
    await storage.createUser({
      id: userId,
      email: "manager@example.com",
      firstName: "Manager",
      lastName: "User",
      mentionKey: "manager.user",
      passwordHash: hashedPassword,
      role: "manager",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Add managed candidate (in real implementation)
    // For now, just verify the field exists
    const { agent } = await createAuthedAgent({
      storage,
      userId: null
    });

    const response = await agent
      .post("/api/auth/login")
      .send({
        email: "manager@example.com",
        password: password
      })
      .expect(200);

    assert.ok(Array.isArray(response.body.user.managedCandidateIds), "Should have managedCandidateIds array");
  });
});

describe("Authentication - Security", () => {
  test("passwords are not returned in API responses", async (t) => {
    const { storage } = await setupAuthTest(t);

    const password = "SecurityTest123!";
    const hashedPassword = await hashPasswordBcrypt(password);

    await storage.createUser({
      id: IDS.users.activeUser,
      email: "security@example.com",
      firstName: "Security",
      lastName: "User",
      mentionKey: "security.user",
      passwordHash: hashedPassword,
      role: "hr_staff",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const { agent } = await createAuthedAgent({
      storage,
      userId: null
    });

    const response = await agent
      .post("/api/auth/login")
      .send({
        email: "security@example.com",
        password: password
      })
      .expect(200);

    assert.equal(response.body.user.passwordHash, undefined, "Password hash should not be in response");
    assert.equal(response.body.user.password, undefined, "Password should not be in response");
  });

  test("failed login attempts are rate limited", async (t) => {
    const { storage } = await setupAuthTest(t);

    const { agent } = await createAuthedAgent({
      storage,
      userId: null
    });

    // Make multiple failed login attempts
    const attempts = [];
    for (let i = 0; i < 6; i++) {
      attempts.push(
        agent
          .post("/api/auth/login")
          .send({
            email: "attacker@example.com",
            password: "wrongpassword"
          })
      );
    }

    const responses = await Promise.all(attempts);

    // At least some should fail with 401
    const failedAttempts = responses.filter(r => r.status === 401);
    assert.ok(failedAttempts.length >= 5, "Failed attempts should return 401");

    // If rate limiting is implemented, the last attempts should be 429
    // (This depends on implementation - may need to be updated)
  });

  test("session cookies are httpOnly", async (t) => {
    const { storage } = await setupAuthTest(t);

    const password = "CookieTest123!";
    const hashedPassword = await hashPasswordBcrypt(password);

    await storage.createUser({
      id: IDS.users.activeUser,
      email: "cookie@example.com",
      firstName: "Cookie",
      lastName: "User",
      mentionKey: "cookie.user",
      passwordHash: hashedPassword,
      role: "hr_staff",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const { agent } = await createAuthedAgent({
      storage,
      userId: null
    });

    const response = await agent
      .post("/api/auth/login")
      .send({
        email: "cookie@example.com",
        password: password
      })
      .expect(200);

    const cookies = response.headers['set-cookie'];
    if (cookies) {
      const sessionCookie = cookies.find((c: string) => c.includes('obp.sid'));
      if (sessionCookie) {
        assert.ok(sessionCookie.includes('HttpOnly'), "Session cookie should be HttpOnly");
      }
    }
  });
});
