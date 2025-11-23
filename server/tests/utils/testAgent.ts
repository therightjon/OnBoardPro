import express from "express";
import type { Express } from "express";
import supertest from "supertest";
import type { SuperTest, Test } from "supertest";
import type { RegisterRoutesOptions } from "../../routes";
import { registerRoutes } from "../../routes";
import type { IStorage } from "../../db/storage";

export async function buildUserSessionPayload(storage: IStorage, userId: string) {
  const baseUser = await storage.getUser(userId);
  if (!baseUser) return null;

  const [roles, departmentScopes, divisionScopes, managedCandidateIds] = await Promise.all([
    storage.getUserRoles(userId),
    storage.getUserDepartmentScopeIds(userId),
    storage.getUserDivisionScopeIds(userId),
    storage.getManagerCandidateScopeIds(userId)
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
  storage: IStorage;
  registerOptions?: RegisterRoutesOptions;
}

export async function createAuthedAgent({
  userId,
  storage,
  registerOptions
}: CreateAgentOptions): Promise<{ agent: SuperTest<Test>; app: Express }>
{
  const app = express();
  app.use(express.json());

  const sessionUser = userId ? await buildUserSessionPayload(storage, userId) : null;

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
