import express from "express";
import type { Express } from "express";
import supertest from "supertest";
import type { SuperTest, Test } from "supertest";
import type { RegisterRoutesOptions } from "../../routes";
import { registerRoutes } from "../../routes";
import type { MockServiceFactory } from "./mockServiceFactory";

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
  mockFactory: MockServiceFactory;
  registerOptions?: RegisterRoutesOptions;
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
  registerOptions
}: CreateAgentOptions): Promise<{ agent: SuperTest<Test>; app: Express }>
{
  const app = express();
  app.use(express.json());

  const sessionUser = userId ? await buildUserSessionPayload(mockFactory, userId) : null;

  app.use((req, _res, next) => {
    if (sessionUser) {
      req.user = { ...sessionUser } as Express.User;
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
}

/**
 * @deprecated Use createAuthedAgent with mockFactory instead of storage
 */
export async function createAuthedAgentLegacy(options: LegacyCreateAgentOptions) {
  return createAuthedAgent({
    userId: options.userId,
    mockFactory: options.storage,
    registerOptions: options.registerOptions
  });
}
