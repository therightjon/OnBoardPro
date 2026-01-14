/**
 * Mock Service Factory for Testing
 *
 * Provides in-memory mock implementations of services for unit testing.
 * This replaces the InMemoryStorage pattern now that routes use services.
 * 
 * The MockServiceFactory extends ServiceFactory and can be injected via
 * setServiceFactoryForTesting() to replace the singleton during tests.
 * 
 * Usage:
 *   import { MockServiceFactory, setServiceFactoryForTesting, resetServiceFactory } from './mockServiceFactory';
 *   
 *   beforeEach(() => {
 *     const mockFactory = new MockServiceFactory();
 *     mockFactory.upsertUser({ id: '1', username: 'admin', ... });
 *     setServiceFactoryForTesting(mockFactory);
 *   });
 *   
 *   afterEach(() => {
 *     resetServiceFactory();
 *   });
 */

import type {
  Candidate,
  CandidateTask,
  Department,
  Division,
  TaskCategory,
  TaskPriority,
  TaskDefinition,
  Template,
  TemplateStage,
  TemplateTask,
  User,
  UserPreferences,
  UserRole,
  AuthProvider,
  CandidateFollower,
} from "@shared/schemas";
import type { AuthorizationContext } from "../../repositories/base/types";
import { randomUUID } from "node:crypto";
import { 
  ServiceFactory,
  setServiceFactoryForTesting as _setServiceFactoryForTesting,
  resetServiceFactory as _resetServiceFactory,
  getActiveServiceFactory
} from "../../services/service-factory";

// Re-export the testing utilities from service-factory
export const setServiceFactoryForTesting = _setServiceFactoryForTesting;
export const resetServiceFactory = _resetServiceFactory;
export { getActiveServiceFactory };

// ============================================================================
// Data Store Types
// ============================================================================

export type MockDataStores = {
  users: Map<string, User>;
  userRoles: Map<string, Set<string>>;
  userDepartmentScopes: Map<string, Set<string>>;
  userDivisionScopes: Map<string, Set<string>>;
  managerCandidateScopes: Map<string, Set<string>>;
  departments: Map<string, Department>;
  divisions: Map<string, Division>;
  candidates: Map<string, Candidate>;
  candidateTasks: Map<string, CandidateTask>;
  templates: Map<string, Template>;
  templateStages: Map<string, TemplateStage>;
  templateTasks: Map<string, TemplateTask>;
  taskDefinitions: Map<string, TaskDefinition>;
  taskCategories: Map<string, TaskCategory>;
  taskPriorities: Map<string, TaskPriority>;
  systemSettings: Map<string, any>;
  authProviders: Map<string, AuthProvider>;
  candidateFollowers: Set<string>;
  userPreferences: Map<string, UserPreferences>;
};

const createEmptyDataStores = (): MockDataStores => ({
  users: new Map(),
  userRoles: new Map(),
  userDepartmentScopes: new Map(),
  userDivisionScopes: new Map(),
  managerCandidateScopes: new Map(),
  departments: new Map(),
  divisions: new Map(),
  candidates: new Map(),
  candidateTasks: new Map(),
  templates: new Map(),
  templateStages: new Map(),
  templateTasks: new Map(),
  taskDefinitions: new Map(),
  taskCategories: new Map(),
  taskPriorities: new Map(),
  systemSettings: new Map(),
  authProviders: new Map(),
  candidateFollowers: new Set(),
  userPreferences: new Map(),
});

// ============================================================================
// Mock Service Factory
// ============================================================================

export class MockServiceFactory {
  public readonly data: MockDataStores;

  constructor() {
    this.data = createEmptyDataStores();
  }

  // ==========================================================================
  // Seeding Helpers
  // ==========================================================================

  reset(): void {
    const fresh = createEmptyDataStores();
    (Object.keys(this.data) as Array<keyof MockDataStores>).forEach((key) => {
      const target = this.data[key];
      if (target instanceof Map) {
        target.clear();
      } else if (target instanceof Set) {
        target.clear();
      }
    });
  }

  upsertDepartment(record: Department): void {
    this.data.departments.set(record.id, { ...record });
  }

  upsertDivision(record: Division): void {
    this.data.divisions.set(record.id, { ...record });
  }

  upsertUser(
    record: User,
    extra?: {
      roles?: string[];
      departmentScopes?: string[];
      divisionScopes?: string[];
      managedCandidateIds?: string[];
    }
  ): void {
    this.data.users.set(record.id, { ...record });
    if (extra?.roles) {
      this.data.userRoles.set(record.id, new Set(extra.roles));
    }
    if (extra?.departmentScopes) {
      this.data.userDepartmentScopes.set(record.id, new Set(extra.departmentScopes));
    }
    if (extra?.divisionScopes) {
      this.data.userDivisionScopes.set(record.id, new Set(extra.divisionScopes));
    }
    if (extra?.managedCandidateIds) {
      this.data.managerCandidateScopes.set(record.id, new Set(extra.managedCandidateIds));
    }
  }

  upsertCandidate(record: Candidate): void {
    this.data.candidates.set(record.id, { ...record });
  }

  upsertCandidateTask(record: CandidateTask): void {
    this.data.candidateTasks.set(record.id, { ...record });
  }

  upsertTaskDefinition(record: TaskDefinition): void {
    this.data.taskDefinitions.set(record.id, { ...record });
  }

  upsertTaskCategory(record: TaskCategory): void {
    this.data.taskCategories.set(record.id, { ...record });
  }

  upsertTaskPriority(record: TaskPriority): void {
    this.data.taskPriorities.set(record.id, { ...record });
  }

  upsertTemplate(record: Template): void {
    this.data.templates.set(record.id, { ...record });
  }

  upsertTemplateStage(record: TemplateStage): void {
    this.data.templateStages.set(record.id, { ...record });
  }

  upsertTemplateTask(record: TemplateTask): void {
    this.data.templateTasks.set(record.id, { ...record });
  }

  upsertAuthProvider(record: AuthProvider): void {
    this.data.authProviders.set(record.id, { ...record });
  }

  setSystemSetting(key: string, value: any): void {
    this.data.systemSettings.set(key, value);
  }

  addFollower(candidateId: string, userId: string): void {
    this.data.candidateFollowers.add(`${candidateId}:${userId}`);
  }

  // ==========================================================================
  // Legacy Async Methods (for backward compatibility with old tests)
  // These wrap the synchronous upsert methods so tests can use await
  // ==========================================================================

  async createUser(record: User): Promise<User> {
    this.upsertUser(record);
    return { ...record };
  }

  async createDepartment(record: Department): Promise<Department> {
    this.upsertDepartment(record);
    return { ...record };
  }

  async createDivision(record: Division): Promise<Division> {
    this.upsertDivision(record);
    return { ...record };
  }

  async addUserRole(userId: string, role: string): Promise<void> {
    const existing = this.data.userRoles.get(userId) ?? new Set();
    existing.add(role);
    this.data.userRoles.set(userId, existing);
  }

  async addUserDepartmentScope(userId: string, departmentId: string): Promise<void> {
    const existing = this.data.userDepartmentScopes.get(userId) ?? new Set();
    existing.add(departmentId);
    this.data.userDepartmentScopes.set(userId, existing);
  }

  async addUserDivisionScope(userId: string, divisionId: string): Promise<void> {
    const existing = this.data.userDivisionScopes.get(userId) ?? new Set();
    existing.add(divisionId);
    this.data.userDivisionScopes.set(userId, existing);
  }

  // ==========================================================================
  // Authorization Context Builder
  // ==========================================================================

  buildAuthorizationContext(user: Express.User | null | undefined): AuthorizationContext {
    const roles = new Set<string>();
    const departmentIds = new Set<string>();
    const divisionIds = new Set<string>();
    const managedCandidateIds = new Set<string>();

    if (user?.id) {
      const persisted = this.data.users.get(user.id);
      if (persisted?.role) {
        roles.add(persisted.role);
      }
      const extraRoles = this.data.userRoles.get(user.id);
      if (extraRoles) {
        for (const role of extraRoles) {
          roles.add(role);
        }
      }
      const deptScopes = this.data.userDepartmentScopes.get(user.id);
      if (deptScopes) {
        for (const dept of deptScopes) {
          departmentIds.add(dept);
        }
      }
      const divScopes = this.data.userDivisionScopes.get(user.id);
      if (divScopes) {
        for (const div of divScopes) {
          divisionIds.add(div);
        }
      }
      const managed = this.data.managerCandidateScopes.get(user.id);
      if (managed) {
        for (const candidate of managed) {
          managedCandidateIds.add(candidate);
        }
      }
    }

    if (user?.role) {
      roles.add(user.role);
    }
    if (Array.isArray((user as any)?.roles)) {
      for (const role of (user as any).roles as string[]) {
        if (role) roles.add(role);
      }
    }
    if (Array.isArray((user as any)?.departmentScopes)) {
      for (const dept of (user as any).departmentScopes as string[]) {
        if (dept) departmentIds.add(dept);
      }
    }
    if (Array.isArray((user as any)?.divisionScopes)) {
      for (const div of (user as any).divisionScopes as string[]) {
        if (div) divisionIds.add(div);
      }
    }
    if (Array.isArray((user as any)?.managedCandidateIds)) {
      for (const candidate of (user as any).managedCandidateIds as string[]) {
        if (candidate) managedCandidateIds.add(candidate);
      }
    }

    const privileged = roles.has("system_admin") || roles.has("hr_staff");

    return {
      userId: user?.id ?? null,
      roles,
      departmentIds,
      divisionIds,
      managedCandidateIds,
      privileged,
      isCandidate: roles.has("candidate"),
    };
  }

  // ==========================================================================
  // Visibility Helpers
  // ==========================================================================

  private isCandidateVisible(candidate: Candidate, auth: AuthorizationContext): boolean {
    if (auth.privileged) return true;
    if (candidate.departmentId && auth.departmentIds.has(candidate.departmentId)) return true;
    if (candidate.divisionId && auth.divisionIds.has(candidate.divisionId)) return true;
    if (candidate.id && auth.managedCandidateIds.has(candidate.id)) return true;
    if (auth.roles.has("manager") && auth.userId && candidate.managerId === auth.userId) return true;
    if (auth.isCandidate && auth.userId && candidate.linkedUserId === auth.userId) return true;
    return false;
  }

  // ==========================================================================
  // Mock User Service Methods
  // ==========================================================================

  async getUser(id: string): Promise<User | undefined> {
    const user = this.data.users.get(id);
    return user ? { ...user } : undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    for (const user of this.data.users.values()) {
      if (user.email.toLowerCase() === email.toLowerCase()) {
        return { ...user };
      }
    }
    return undefined;
  }

  async getUserRoles(userId: string): Promise<UserRole[]> {
    const set = this.data.userRoles.get(userId);
    if (!set) return [];
    const now = new Date();
    return Array.from(set).map((role) => ({
      id: randomUUID(),
      userId,
      role: role as any,
      createdAt: now,
      updatedAt: now,
    }));
  }

  async getUserDepartmentScopeIds(userId: string): Promise<string[]> {
    return Array.from(this.data.userDepartmentScopes.get(userId) ?? []);
  }

  async getUserDivisionScopeIds(userId: string): Promise<string[]> {
    return Array.from(this.data.userDivisionScopes.get(userId) ?? []);
  }

  async getManagerCandidateScopeIds(managerId: string): Promise<string[]> {
    return Array.from(this.data.managerCandidateScopes.get(managerId) ?? []);
  }

  // ==========================================================================
  // Mock Candidate Service Methods
  // ==========================================================================

  async getCandidate(id: string, auth?: AuthorizationContext): Promise<Candidate | null | undefined> {
    const candidate = this.data.candidates.get(id);
    if (!candidate || candidate.archived) return null;
    if (auth && !this.isCandidateVisible(candidate, auth)) {
      return null;
    }
    return { ...candidate };
  }

  async getCandidates(filters?: any, auth?: AuthorizationContext): Promise<Candidate[]> {
    let candidates = Array.from(this.data.candidates.values());

    if (!filters?.includeArchived) {
      candidates = candidates.filter((candidate) => !candidate.archived);
    }

    if (filters?.departmentId) {
      candidates = candidates.filter((candidate) => candidate.departmentId === filters.departmentId);
    }

    if (filters?.divisionId) {
      candidates = candidates.filter((candidate) => candidate.divisionId === filters.divisionId);
    }

    if (auth) {
      candidates = candidates.filter((candidate) => this.isCandidateVisible(candidate, auth));
    }

    return candidates.map((candidate) => ({ ...candidate }));
  }

  async createCandidate(candidate: Candidate): Promise<Candidate> {
    const copy = { ...candidate };
    this.data.candidates.set(copy.id, copy);
    return { ...copy };
  }

  // ==========================================================================
  // Mock Task Service Methods
  // ==========================================================================

  async getCandidateTask(id: string): Promise<CandidateTask | undefined> {
    const task = this.data.candidateTasks.get(id);
    if (!task || task.archived) return null as any;
    return { ...task };
  }

  // Alias for legacy test compatibility
  async getTask(id: string): Promise<CandidateTask | undefined> {
    return this.getCandidateTask(id);
  }

  async getCandidateTasks(filters?: any, auth?: AuthorizationContext): Promise<CandidateTask[]> {
    let tasks = Array.from(this.data.candidateTasks.values());

    tasks = tasks.filter((task) => !task.archived);

    if (filters?.candidateId) {
      tasks = tasks.filter((task) => task.candidateId === filters.candidateId);
    }

    if (filters?.assigneeId) {
      tasks = tasks.filter((task) => task.assigneeUserId === filters.assigneeId);
    }

    if (auth && !auth.privileged) {
      tasks = tasks.filter((task) => {
        const candidate = this.data.candidates.get(task.candidateId);
        return candidate ? this.isCandidateVisible(candidate, auth) : false;
      });
    }

    return tasks.map((task) => ({ ...task }));
  }

  async createCandidateTask(task: CandidateTask): Promise<CandidateTask> {
    const copy = { ...task };
    this.data.candidateTasks.set(copy.id, copy);
    return { ...copy };
  }

  // ==========================================================================
  // Mock Dashboard Service Methods
  // ==========================================================================

  async getDivisionActiveCandidateCounts(limit: number = 4, auth?: AuthorizationContext): Promise<any[]> {
    const counts = new Map<
      string,
      {
        divisionId: string;
        divisionName: string;
        departmentId: string;
        departmentName: string;
        activeCandidateCount: number;
      }
    >();

    for (const candidate of this.data.candidates.values()) {
      if (candidate.archived) continue;
      if (candidate.status !== "active") continue;
      if (!candidate.divisionId) continue;

      if (auth && !this.isCandidateVisible(candidate, auth)) continue;

      const division = this.data.divisions.get(candidate.divisionId);
      if (!division) continue;
      const department = this.data.departments.get(division.departmentId);

      const existing = counts.get(division.id);
      if (existing) {
        existing.activeCandidateCount += 1;
      } else {
        counts.set(division.id, {
          divisionId: division.id,
          divisionName: division.name,
          departmentId: division.departmentId,
          departmentName: department?.name ?? "",
          activeCandidateCount: 1,
        });
      }
    }

    return Array.from(counts.values())
      .sort((a, b) => {
        if (b.activeCandidateCount !== a.activeCandidateCount) {
          return b.activeCandidateCount - a.activeCandidateCount;
        }
        return a.divisionName.localeCompare(b.divisionName);
      })
      .slice(0, Math.max(1, Math.min(limit, 25)));
  }

  // ==========================================================================
  // Mock Settings Methods
  // ==========================================================================

  async getSystemSettings(): Promise<{ auto_regress_on_prior_open: boolean }> {
    return { auto_regress_on_prior_open: false };
  }

  async getAllAuthProviders(): Promise<AuthProvider[]> {
    return Array.from(this.data.authProviders.values()).map((item) => ({ ...item }));
  }

  async getAuthProvider(id: string): Promise<AuthProvider | undefined> {
    const provider = this.data.authProviders.get(id);
    return provider ? { ...provider } : undefined;
  }

  // ==========================================================================
  // Mock User Preferences Methods
  // ==========================================================================

  async getUserPreferences(userId: string): Promise<UserPreferences | undefined> {
    const prefs = this.data.userPreferences.get(userId);
    return prefs ? { ...prefs } : undefined;
  }

  async upsertUserPreferences(
    userId: string,
    updates: Partial<UserPreferences>
  ): Promise<UserPreferences> {
    const base: UserPreferences = this.data.userPreferences.get(userId) ?? {
      userId,
      mytasksShowArchived: false,
      mytasksShowCanceled: false,
      mytasksShowCompleted: false,
      notifyInApp: true,
      notifyEmail: false,
      digestFrequency: "immediate",
      quietHoursStart: null,
      quietHoursEnd: null,
      allowSelfNotifications: false,
      eventSubscriptions: {},
      updatedAt: new Date(),
    };
    const updated = { ...base, ...updates, updatedAt: new Date() };
    this.data.userPreferences.set(userId, updated);
    return { ...updated };
  }

  // ==========================================================================
  // IServiceFactory Implementation
  // These methods return mock service objects that the routes call
  // ==========================================================================

  getCandidateService(): any {
    return {
      getCandidates: (filters: any, auth?: AuthorizationContext) => this.getCandidates(filters, auth),
      getCandidate: (id: string, auth?: AuthorizationContext) => this.getCandidate(id, auth),
      createCandidate: async (input: { data: any; actorId?: string; authContext?: AuthorizationContext }) => {
        const { data, authContext } = input;
        // Check for duplicate email in the same department (matching real service behavior)
        if (data.email && data.departmentId) {
          const existingCandidates = await this.getCandidates({ departmentId: data.departmentId }, authContext);
          const duplicateEmail = existingCandidates.find(
            (c: any) => c.email?.toLowerCase() === data.email.toLowerCase() &&
                        c.departmentId === data.departmentId
          );
          if (duplicateEmail) {
            throw new Error("Email already exists in this department");
          }
        }
        const candidate = { ...data, id: data.id || randomUUID() } as Candidate;
        return this.createCandidate(candidate);
      },
      updateCandidate: (idOrInput: any, maybeData?: any) => {
        const id = typeof idOrInput === "string" ? idOrInput : idOrInput?.id;
        const data = typeof idOrInput === "string" ? maybeData : idOrInput?.data;
        if (!id) return Promise.resolve(undefined);
        const existing = this.data.candidates.get(id);
        if (!existing) return Promise.resolve(undefined);
        const updated = { ...existing, ...data, updatedAt: new Date() };
        this.data.candidates.set(id, updated);
        return Promise.resolve({ ...updated });
      },
      deleteCandidate: (id: string) => {
        const existed = this.data.candidates.has(id);
        this.data.candidates.delete(id);
        return Promise.resolve(existed);
      },
      updateCandidateStatus: async (input: { id: string; newStatus: string; actorId?: string }) => {
        const existing = this.data.candidates.get(input.id);
        if (!existing) {
          return { success: false, error: "Candidate not found", code: "CANDIDATE_NOT_FOUND" };
        }
        const updated = { ...existing, status: input.newStatus, updatedAt: new Date() } as Candidate;
        this.data.candidates.set(input.id, updated);
        return { success: true, candidate: { ...updated } };
      },
      getCandidateTemplateStages: (candidateId: string) => Promise.resolve([]),
      getCandidateStageHistory: (candidateId: string) => Promise.resolve([]),
      getFollowers: (candidateId: string) => Promise.resolve([])
    };
  }

  getTaskService(): any {
    const self = this;
    return {
      getTask: (id: string) => this.getCandidateTask(id),
      getTasks: async (filters: any, authContext?: any) => {
        let tasks = Array.from(self.data.candidateTasks.values());
        
        // Apply filters
        if (filters?.assigneeId) {
          tasks = tasks.filter(t => t.assigneeUserId === filters.assigneeId);
        }
        if (filters?.candidateId) {
          tasks = tasks.filter(t => t.candidateId === filters.candidateId);
        }
        if (filters?.status) {
          const internal = filters.status;
          const aliasMatch = (status: string) => {
            if (internal === "todo" && status === "todo") return true;
            return status === internal;
          };
          tasks = tasks.filter(t => aliasMatch(t.status as any));
        }
        
        // Apply authorization context filtering
        if (authContext && !authContext.privileged) {
          tasks = tasks.filter((task) => {
            const candidate = self.data.candidates.get(task.candidateId);
            return candidate ? self.isCandidateVisible(candidate, authContext) : false;
          });
        }
        
        return tasks.map(t => ({ ...t }));
      },
      getTasksForCandidate: (candidateId: string) => 
        Promise.resolve(Array.from(this.data.candidateTasks.values()).filter(t => t.candidateId === candidateId)),
      createTask: async (input: { data: any; actorId?: string }) => {
        const { data } = input;
        const task = { ...data, id: data.id || randomUUID(), updatedAt: new Date(), createdAt: new Date() } as CandidateTask;
        return this.createCandidateTask(task);
      },
      updateTask: async (input: { id: string; data: any; actorId?: string }) => {
        const { id, data } = input;
        const existing = this.data.candidateTasks.get(id);
        if (!existing) return undefined;
        const updated = { ...existing, ...data, updatedAt: new Date() };
        this.data.candidateTasks.set(id, updated);
        return { ...updated };
      },
      deleteTask: (id: string) => {
        const existed = this.data.candidateTasks.has(id);
        this.data.candidateTasks.delete(id);
        return Promise.resolve(existed);
      },
      archiveTask: (id: string) => {
        const task = this.data.candidateTasks.get(id);
        if (task) {
          this.data.candidateTasks.set(id, { ...task, archived: true, deletedAt: new Date() });
          return Promise.resolve(true);
        }
        return Promise.resolve(false);
      },
      completeTask: (id: string, userId: string) => {
        const task = this.data.candidateTasks.get(id);
        if (!task) return Promise.resolve(undefined);
        const updated = { ...task, status: 'done' as const, completedAt: new Date() };
        this.data.candidateTasks.set(id, updated);
        return Promise.resolve({ ...updated });
      }
    };
  }

  getTaskDueDateService(): any {
    return {
      computeDueDates: () => Promise.resolve([]),
      getOverdueTasks: () => Promise.resolve([])
    };
  }

  getTemplateService(): any {
    return {
      getTemplate: (id: string) => {
        const template = this.data.templates.get(id);
        return Promise.resolve(template ? { ...template } : undefined);
      },
      getTemplates: (filters?: any) => 
        Promise.resolve(Array.from(this.data.templates.values()).map(t => ({ ...t }))),
      createTemplate: (data: any) => {
        const id = data.id || randomUUID();
        const template = { ...data, id, createdAt: new Date(), updatedAt: new Date() };
        this.data.templates.set(id, template);
        return Promise.resolve({ ...template });
      },
      updateTemplate: (id: string, data: any) => {
        const existing = this.data.templates.get(id);
        if (!existing) return Promise.resolve(undefined);
        const updated = { ...existing, ...data, updatedAt: new Date() };
        this.data.templates.set(id, updated);
        return Promise.resolve({ ...updated });
      },
      getTemplateStages: (templateId: string) =>
        Promise.resolve(Array.from(this.data.templateStages.values()).filter(s => s.templateId === templateId)),
      getTemplateTasks: (templateId: string) =>
        Promise.resolve(Array.from(this.data.templateTasks.values()).filter(t => t.templateId === templateId))
    };
  }

  getTemplateExpansionService(): any {
    return {
      expandTemplate: () => Promise.resolve({ tasks: [], stages: [] }),
      expandTemplateForCandidate: () => Promise.resolve({ tasks: [], stages: [] }),
      expandPrerequisites: () => Promise.resolve({ tasksCreated: 0, tasks: [] })
    };
  }

  getTemplateEstimationService(): any {
    return {
      estimateCompletion: () => Promise.resolve(null)
    };
  }

  getUserService(): any {
    const self = this;
    return {
      getUser: (id: string) => this.getUser(id),
      getUserByUsername: (username: string) => {
        for (const user of this.data.users.values()) {
          if (user.username === username) return Promise.resolve({ ...user });
        }
        return Promise.resolve(undefined);
      },
      getUserByEmail: (email: string) => this.getUserByEmail(email),
      getUsers: (filters?: any) => Promise.resolve(Array.from(this.data.users.values()).map(u => ({ ...u }))),
      createUser: (data: any) => {
        const id = data.id || randomUUID();
        const user = { ...data, id, createdAt: new Date(), updatedAt: new Date() };
        this.data.users.set(id, user);
        return Promise.resolve({ ...user });
      },
      updateUser: (id: string, data: any) => {
        const existing = this.data.users.get(id);
        if (!existing) return Promise.resolve(undefined);
        const updated = { ...existing, ...data, updatedAt: new Date() };
        this.data.users.set(id, updated);
        return Promise.resolve({ ...updated });
      },
      getUserPreferences: (userId: string) => this.getUserPreferences(userId),
      updateUserPreferences: (userId: string, data: any) => this.upsertUserPreferences(userId, data),
      validatePassword: () => Promise.resolve(false),
      verifyPassword: () => Promise.resolve(false),
      // Add hydration methods
      getUserRoles: (userId: string) => self.getUserRoles(userId),
      getUserDepartmentScopeIds: (userId: string) => self.getUserDepartmentScopeIds(userId),
      getUserDivisionScopeIds: (userId: string) => self.getUserDivisionScopeIds(userId),
      getManagerCandidateScopeIds: (managerId: string) => self.getManagerCandidateScopeIds(managerId)
    };
  }

  getInvitationService(): any {
    return {
      getInvitations: () => Promise.resolve([]),
      createInvitation: () => Promise.resolve(null),
      acceptInvitation: () => Promise.resolve(null)
    };
  }

  getOrganizationService(): any {
    return {
      getDepartment: (id: string) => {
        const dept = this.data.departments.get(id);
        return Promise.resolve(dept ? { ...dept } : undefined);
      },
      getDepartments: () => Promise.resolve(Array.from(this.data.departments.values()).map(d => ({ ...d }))),
      getDivision: (id: string) => {
        const div = this.data.divisions.get(id);
        return Promise.resolve(div ? { ...div } : undefined);
      },
      getDivisions: (departmentId?: string) => {
        let divisions = Array.from(this.data.divisions.values());
        if (departmentId) divisions = divisions.filter(d => d.departmentId === departmentId);
        return Promise.resolve(divisions.map(d => ({ ...d })));
      }
    };
  }

  getReferenceDataService(): any {
    return {
      getHiringStages: () => Promise.resolve([]),
      getCandidateTypes: () => Promise.resolve([]),
      getTaskCategories: () => Promise.resolve(Array.from(this.data.taskCategories.values())),
      getTaskPriorities: () => Promise.resolve(Array.from(this.data.taskPriorities.values())),
      getFacultyRanks: () => Promise.resolve([]),
      getTaskDefinitions: () => Promise.resolve(Array.from(this.data.taskDefinitions.values()))
    };
  }

  getNotificationService(): any {
    return {
      getNotificationsForUser: () => Promise.resolve([]),
      createNotification: () => Promise.resolve(null),
      markAsRead: () => Promise.resolve(null),
      markAllAsRead: () => Promise.resolve(0)
    };
  }

  getCommentService(): any {
    return {
      getComments: () => Promise.resolve([]),
      getCandidateComments: () => Promise.resolve({ comments: [], nextCursor: null }),
      createComment: () => Promise.resolve(null)
    };
  }

  getSearchService(): any {
    return {
      search: () => Promise.resolve({ candidates: [], tasks: [], users: [] }),
      searchCandidates: () => Promise.resolve([]),
      searchTasks: () => Promise.resolve([])
    };
  }

  getSystemSettingsService(): any {
    return {
      getSetting: (key: string) => Promise.resolve(this.data.systemSettings.get(key)),
      getSettings: () => Promise.resolve(Object.fromEntries(this.data.systemSettings)),
      setSetting: (key: string, value: any) => {
        this.data.systemSettings.set(key, value);
        return Promise.resolve();
      }
    };
  }

  getAuthProviderService(): any {
    return {
      getProvider: (id: string) => this.getAuthProvider(id),
      getAllProviders: () => this.getAllAuthProviders(),
      getEnabledProviders: () => Promise.resolve(
        Array.from(this.data.authProviders.values()).filter(p => p.enabled)
      )
    };
  }

  getDashboardService(): any {
    return {
      getDivisionActiveCandidateCounts: (limit: number, auth?: AuthorizationContext) => 
        this.getDivisionActiveCandidateCounts(limit, auth),
      getOverdueTasks: () => Promise.resolve([]),
      getUpcomingTasks: () => Promise.resolve([]),
      getRecentActivity: () => Promise.resolve([])
    };
  }

  getAuthorizationService(): any {
    return {
      buildContext: (user: any) => this.buildAuthorizationContext(user),
      canAccessCandidate: () => true,
      canModifyCandidate: () => true,
      canAccessTask: () => true,
      filterCandidates: (candidates: any[]) => candidates
    };
  }

  getAuditService(): any {
    return {
      createAuditLog: () => Promise.resolve(),
      getAuditLogs: () => Promise.resolve([]),
      getAuditLog: () => Promise.resolve(null)
    };
  }
}

// Export singleton for tests
let mockServiceFactoryInstance: MockServiceFactory | null = null;

export function getMockServiceFactory(): MockServiceFactory {
  if (!mockServiceFactoryInstance) {
    mockServiceFactoryInstance = new MockServiceFactory();
  }
  return mockServiceFactoryInstance;
}

export function resetMockServiceFactory(): void {
  if (mockServiceFactoryInstance) {
    mockServiceFactoryInstance.reset();
  }
  mockServiceFactoryInstance = null;
}
