import express from "express";
import type { Express } from "express";
import session from "express-session";
import supertest from "supertest";
import type { SuperTest, Test } from "supertest";
import type { RegisterRoutesOptions } from "../../routes";
import { registerRoutes } from "../../routes";
import type { MockServiceFactory } from "./mockServiceFactory";

declare module "express-session" {
  interface SessionData {
    user?: Express.User;
  }
}

/**
 * Build user session payload from mock factory data
 */
export async function buildUserSessionPayload(factory: MockServiceFactory, userId: string) {
  const baseUser = await factory.getUser(userId);
  if (!baseUser) return null;

  const [roles, departmentScopes, divisionScopes, managedCandidateIds] = await Promise.all([
    factory.getUserRoles(userId),
    factory.getUserDepartmentScopeIds(userId),
    factory.getUserDivisionScopeIds(userId),
    factory.getManagerCandidateScopeIds(userId)
  ]);

  const mergedRoles = new Set<string>([baseUser.role, ...roles.map((entry) => entry.role)]);

  return {
    ...baseUser,
    roles: Array.from(mergedRoles),
    departmentScopes: departmentScopes.filter(Boolean),
    divisionScopes: divisionScopes.filter(Boolean),
    managedCandidateIds: managedCandidateIds.filter(Boolean)
  } satisfies Express.User;
}

export interface CreateAgentOptions {
  userId?: string | null;
  /** The mock service factory with test data */
  mockFactory?: MockServiceFactory;
  /** @deprecated Use mockFactory instead */
  storage?: MockServiceFactory;
  registerOptions?: RegisterRoutesOptions;
  /**
   * Enable lightweight in-memory sessions for tests that need cookies.
   * Defaults to false to preserve existing mock-only behavior.
   */
  enableSessions?: boolean;
}

/**
 * Create an authenticated test agent
 * 
 * Usage:
 *   const env = await createTestEnvironment();
 *   env.activate();
 *   env.mockFactory.upsertUser({ id: 'user-1', username: 'admin', role: 'admin', ... });
 *   
 *   const { agent } = await createAuthedAgent({
 *     userId: 'user-1',
 *     mockFactory: env.mockFactory
 *   });
 *   
 *   const response = await agent.get('/api/candidates');
 */
export async function createAuthedAgent({
  userId,
  mockFactory,
  storage,
  registerOptions,
  enableSessions
}: CreateAgentOptions): Promise<{ agent: SuperTest<Test>; app: Express }>
{
  const app = express();
  app.use(express.json());

  const factory = mockFactory ?? storage;
  if (!factory) {
    throw new Error("createAuthedAgent requires a mockFactory or storage instance");
  }

  const sessionUser = userId ? await buildUserSessionPayload(factory, userId) : null;

  if (enableSessions) {
    const memoryStore = new session.MemoryStore();
    app.use(
      session({
        name: "obp.sid",
        secret: process.env.TEST_SESSION_SECRET || "test-session-secret",
        resave: false,
        saveUninitialized: false,
        store: memoryStore,
        cookie: {
          httpOnly: true,
          sameSite: "strict",
          secure: process.env.NODE_ENV === "production",
          maxAge: 60 * 60 * 1000 // 1 hour
        }
      })
    );
  }

  app.use((req, _res, next) => {
    const activeSessionUser = enableSessions ? (req.session?.user as Express.User | undefined) : undefined;

    if (enableSessions && !activeSessionUser && sessionUser && req.session) {
      // Seed the session with a user when userId is provided
      req.session.user = { ...sessionUser } as Express.User;
    }

    const effectiveUser = enableSessions
      ? (req.session?.user as Express.User | undefined) ?? null
      : sessionUser;

    if (effectiveUser) {
      req.user = { ...effectiveUser } as Express.User;
      req.isAuthenticated = (() => true) as any;
    } else {
      req.user = undefined;
      req.isAuthenticated = (() => false) as any;
    }
    next();
  });

  await registerRoutes(app, { skipAuthSetup: true, ...(registerOptions ?? {}) });

  return {
    agent: supertest(app),
    app
  };
}

// Legacy support - allow passing 'storage' as an alias for 'mockFactory'
export interface LegacyCreateAgentOptions {
  userId?: string | null;
  /** @deprecated Use mockFactory instead */
  storage: MockServiceFactory;
  registerOptions?: RegisterRoutesOptions;
  enableSessions?: boolean;
}

/**
 * @deprecated Use createAuthedAgent with mockFactory instead of storage
 */
export async function createAuthedAgentLegacy(options: LegacyCreateAgentOptions) {
  return createAuthedAgent({
    userId: options.userId,
    mockFactory: options.storage,
    registerOptions: options.registerOptions,
    enableSessions: options.enableSessions
  });
}
