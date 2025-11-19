import session from "express-session";
import { randomUUID } from "node:crypto";
import type { Express } from "express";
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
  CandidateFollower
} from "@shared/schemas";
import type { AuthorizationContext, DatabaseStorageOptions, IStorage } from "../../db/storage";

type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

export type StorageDataset = {
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

const createEmptyDataset = (): StorageDataset => ({
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
  userPreferences: new Map()
});

export class InMemoryStorage implements IStorage {
  public readonly sessionStore: session.Store;
  protected readonly data: StorageDataset;

  constructor(_options?: DatabaseStorageOptions) {
    this.sessionStore = new session.MemoryStore();
    this.data = createEmptyDataset();
  }

  reset(): void {
    const fresh = createEmptyDataset();
    (Object.keys(this.data) as Array<keyof StorageDataset>).forEach((key) => {
      const target = this.data[key];
      const source = fresh[key];
      if (target instanceof Map) {
        target.clear();
      } else if (target instanceof Set) {
        target.clear();
      }
      if (source instanceof Map) {
        source.forEach((value, entryKey) => {
          (target as Map<any, any>).set(entryKey, value);
        });
      }
    });
  }

  // Helpers for seeding
  upsertDepartment(record: Department): void {
    this.data.departments.set(record.id, { ...record });
  }

  upsertDivision(record: Division): void {
    this.data.divisions.set(record.id, { ...record });
  }

  upsertUser(record: User, extra?: { roles?: string[]; departmentScopes?: string[]; divisionScopes?: string[]; managedCandidateIds?: string[] }): void {
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

  addFollower(record: CandidateFollower): void {
    this.data.candidateFollowers.add(`${record.candidateId}:${record.userId}`);
  }

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
      isCandidate: roles.has("candidate")
    };
  }

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
      role,
      createdAt: now,
      updatedAt: now
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

  async createCandidate(candidate: Candidate): Promise<Candidate> {
    const copy = { ...candidate };
    this.data.candidates.set(copy.id, copy);
    return { ...copy };
  }

  private isCandidateVisible(candidate: Candidate, auth: AuthorizationContext): boolean {
    if (auth.privileged) {
      return true;
    }

    if (candidate.departmentId && auth.departmentIds.has(candidate.departmentId)) {
      return true;
    }

    if (candidate.divisionId && auth.divisionIds.has(candidate.divisionId)) {
      return true;
    }

    if (candidate.id && auth.managedCandidateIds.has(candidate.id)) {
      return true;
    }

    if (auth.roles.has("manager") && auth.userId && candidate.managerId === auth.userId) {
      return true;
    }

    if (auth.isCandidate && auth.userId && candidate.linkedUserId === auth.userId) {
      return true;
    }

    return false;
  }

  async getCandidate(id: string, auth?: AuthorizationContext): Promise<Candidate | undefined> {
    const candidate = this.data.candidates.get(id);
    if (!candidate) return undefined;
    if (auth && !this.isCandidateVisible(candidate, auth)) {
      return undefined;
    }
    return { ...candidate };
  }

  async createCandidateTask(task: CandidateTask): Promise<CandidateTask> {
    const copy = { ...task };
    this.data.candidateTasks.set(copy.id, copy);
    return { ...copy };
  }

  async getCandidateTask(id: string): Promise<CandidateTask | undefined> {
    const task = this.data.candidateTasks.get(id);
    return task ? { ...task } : undefined;
  }

  async getCandidateTasks(filters?: any, auth?: AuthorizationContext): Promise<CandidateTask[]> {
    let tasks = Array.from(this.data.candidateTasks.values());

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

  // Stub implementations for interface methods not yet required
  async getAllUsers(): Promise<User[]> { throw new Error("Not implemented"); }
  async createUser(): Promise<User> { throw new Error("Not implemented"); }
  async updateUser(): Promise<User | undefined> { throw new Error("Not implemented"); }
  async setUserRoles(): Promise<UserRole[]> { throw new Error("Not implemented"); }
  async addUserRoles(): Promise<UserRole[]> { throw new Error("Not implemented"); }
  async createInvitation(): Promise<any> { throw new Error("Not implemented"); }
  async getInvitationByToken(): Promise<any> { throw new Error("Not implemented"); }
  async consumeInvitation(): Promise<any> { throw new Error("Not implemented"); }
  async findValidPendingInviteForIdentifier(): Promise<any> { throw new Error("Not implemented"); }
  async getPendingInvitationsForUsersList(): Promise<any[]> { throw new Error("Not implemented"); }
  async disableUser(): Promise<{ success: boolean; tasksReassigned?: number | undefined; }> { throw new Error("Not implemented"); }
  async enableUser(): Promise<User | undefined> { throw new Error("Not implemented"); }
  async updateLastLogin(): Promise<void> { /* noop */ }
  async getUserOpenTaskCount(): Promise<{ total: number; required: number; }> { throw new Error("Not implemented"); }
  async getUserPreferences(userId: string): Promise<UserPreferences | undefined> {
    const prefs = this.data.userPreferences.get(userId);
    return prefs ? { ...prefs } : undefined;
  }
  async upsertUserPreferences(userId: string, updates: Partial<UserPreferences>): Promise<UserPreferences> {
    const base: Mutable<UserPreferences> = this.data.userPreferences.get(userId) ? { ...this.data.userPreferences.get(userId)! } : {
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
      updatedAt: new Date()
    } as UserPreferences;
    Object.assign(base, updates);
    base.updatedAt = new Date();
    this.data.userPreferences.set(userId, base);
    return { ...base };
  }
  async updateCandidate(): Promise<Candidate | undefined> { throw new Error("Not implemented"); }
  async deleteCandidateTask(): Promise<void> { throw new Error("Not implemented"); }
  async archiveCandidateTask(): Promise<void> { throw new Error("Not implemented"); }
  async resolveCandidateSelfAssignments(): Promise<any> { throw new Error("Not implemented"); }
  async getCandidateStageHistory(): Promise<any[]> { throw new Error("Not implemented"); }
  async getDashboardTasks(): Promise<any[]> { throw new Error("Not implemented"); }
  async getDivisionActiveCandidateCounts(limit: number = 4): Promise<any[]> {
    const counts = new Map<string, {
      divisionId: string;
      divisionName: string;
      departmentId: string;
      departmentName: string;
      activeCandidateCount: number;
    }>();

    for (const candidate of this.data.candidates.values()) {
      if (candidate.archived) continue;
      if (candidate.status !== "active") continue;
      if (!candidate.divisionId) continue;
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
          activeCandidateCount: 1
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
  async getTemplates(): Promise<Template[]> { throw new Error("Not implemented"); }
  async getTemplate(): Promise<Template | undefined> { throw new Error("Not implemented"); }
  async createTemplate(): Promise<Template> { throw new Error("Not implemented"); }
  async updateTemplate(): Promise<Template | undefined> { throw new Error("Not implemented"); }
  async archiveTemplate(): Promise<void> { throw new Error("Not implemented"); }
  async getTemplateReadiness(): Promise<{ active_stage_count: number; }> { throw new Error("Not implemented"); }
  async getTemplateTasks(): Promise<TemplateTask[]> { throw new Error("Not implemented"); }
  async createTemplateTask(): Promise<TemplateTask> { throw new Error("Not implemented"); }
  async updateTemplateTask(): Promise<TemplateTask | undefined> { throw new Error("Not implemented"); }
  async deleteTemplateTask(): Promise<void> { throw new Error("Not implemented"); }
  async getTemplateStages(): Promise<TemplateStage[]> { throw new Error("Not implemented"); }
  async createTemplateStage(): Promise<TemplateStage> { throw new Error("Not implemented"); }
  async updateTemplateStage(): Promise<TemplateStage | undefined> { throw new Error("Not implemented"); }
  async deleteTemplateStage(): Promise<void> { throw new Error("Not implemented"); }
  async reorderTemplateStages(): Promise<void> { throw new Error("Not implemented"); }
  async createTemplateStageWithTask(): Promise<any> { throw new Error("Not implemented"); }
  async getTaskDefinitions(): Promise<TaskDefinition[]> { throw new Error("Not implemented"); }
  async createTaskDefinition(): Promise<TaskDefinition> { throw new Error("Not implemented"); }
  async updateTaskDefinition(): Promise<TaskDefinition | undefined> { throw new Error("Not implemented"); }
  async getDepartments(): Promise<Department[]> { throw new Error("Not implemented"); }
  async createDepartment(): Promise<Department> { throw new Error("Not implemented"); }
  async updateDepartment(): Promise<Department | undefined> { throw new Error("Not implemented"); }
  async archiveDepartment(): Promise<void> { throw new Error("Not implemented"); }
  async restoreDepartment(): Promise<void> { throw new Error("Not implemented"); }
  async createDivision(): Promise<Division> { throw new Error("Not implemented"); }
  async updateDivision(): Promise<Division | undefined> { throw new Error("Not implemented"); }
  async archiveDivision(): Promise<void> { throw new Error("Not implemented"); }
  async restoreDivision(): Promise<void> { throw new Error("Not implemented"); }
  async getHiringStages(): Promise<any[]> { throw new Error("Not implemented"); }
  async createHiringStage(): Promise<any> { throw new Error("Not implemented"); }
  async updateHiringStage(): Promise<any> { throw new Error("Not implemented"); }
  async archiveHiringStage(): Promise<void> { throw new Error("Not implemented"); }
  async getTaskCategories(): Promise<TaskCategory[]> { throw new Error("Not implemented"); }
  async getCandidateTypes(): Promise<any[]> { throw new Error("Not implemented"); }
  async getFacultyRanks(): Promise<any[]> { throw new Error("Not implemented"); }
  async getAllAuthProviders(): Promise<AuthProvider[]> { return Array.from(this.data.authProviders.values()).map((item) => ({ ...item })); }
  async getAuthProvider(id: string): Promise<AuthProvider | undefined> {
    const provider = this.data.authProviders.get(id);
    return provider ? { ...provider } : undefined;
  }
  async updateAuthProvider(): Promise<AuthProvider | undefined> { throw new Error("Not implemented"); }
  async getSystemSettings(): Promise<any[]> {
    return Array.from(this.data.systemSettings.entries()).map(([key, value]) => ({
      key,
      value,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
  }
  async setSystemSettings(): Promise<any> { throw new Error("Not implemented"); }
  async getCandidateFollowers(): Promise<any[]> { throw new Error("Not implemented"); }
  async getCandidateComments(): Promise<any[]> { throw new Error("Not implemented"); }
  async createComment(): Promise<any> { throw new Error("Not implemented"); }
  async getNotifications(): Promise<any> { throw new Error("Not implemented"); }
  async createNotifications(): Promise<any> { throw new Error("Not implemented"); }
  async setNotificationRead(): Promise<any> { throw new Error("Not implemented"); }
  async setAllNotificationsRead(): Promise<any> { throw new Error("Not implemented"); }
  async getNotificationPreferences(): Promise<any> { throw new Error("Not implemented"); }
  async setNotificationPreferences(): Promise<any> { throw new Error("Not implemented"); }
}
