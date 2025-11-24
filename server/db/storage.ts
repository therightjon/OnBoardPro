import { 
  users, 
  userRoles,
  userIdentities,
  invitations,
  authProviders,
  departments, 
  divisions, 
  candidates, 
  candidateTasks,
  candidateTemplateStages,
  templates,
  taskDefinitions,
  hiringStages,
  taskCategories,
  candidateTypes,
  taskPriorities,
  facultyRanks,
  candidateStageHistory,
  templateTasks,
  templateStages,
  candidateFollowers,
  notifications,
  userPreferences,
  systemSettings,
  userDepartmentScopes,
  userDivisionScopes,
  managerCandidateScopes,
  type User, 
  type InsertUser,
  type UserIdentity,
  type InsertUserIdentity,
  type AuthProvider,
  type InsertAuthProvider,
  type Candidate,
  type InsertCandidate,
  type CandidateTask,
  type InsertCandidateTask,
  type Template,
  type InsertTemplate,
  type TemplateTask,
  type InsertTemplateTask,
  type TemplateStage,
  type InsertTemplateStage,
  type CandidateTemplateStage,
  type InsertCandidateTemplateStage,
  type CandidateFollower,
  type InsertCandidateFollower,
  type TaskDefinition,
  type InsertTaskDefinition,
  type Department,
  type InsertDepartment,
  type Division,
  type InsertDivision,
  type HiringStage,
  type InsertHiringStage,
  type TaskCategory,
  type TaskPriority,
  type CandidateType,
  type FacultyRank,
  type UserPreferences,
  type UserRole,
  type InsertUserRole,
  type Invitation,
  type Notification,
  type InsertNotification,
  USER_PREFERENCES_DEFAULTS
} from "@shared/schemas";
import type { Pool } from "pg";
import { db as defaultDb, pool as defaultPool } from "./connection";
import { eq, and, isNull, isNotNull, sql, desc, asc, ilike, inArray, or, ne, lte, gt, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { decryptSecret, encryptSecret } from "../utils/secret";
import { addDays, ensureDate, resolveLooAnchor, resolveStartAnchor, computeDueFromRule, normalizeToUtcDate, MS_PER_DAY, type AnchorKey, type AnchorDates, type DueComputationResult } from "../utils/date.utils";
import { addBusinessDays, countBusinessDays } from "../utils/business-day.utils";
import type { Express } from "express";

const MENTION_KEY_REPLACE = /[^a-z0-9]+/g;
const MENTION_KEY_DOTS = /\.\.+/g;

function sanitizeMentionKey(value?: string | null): string | null {
  if (!value) return null;
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(MENTION_KEY_REPLACE, ".")
    .replace(MENTION_KEY_DOTS, ".")
    .replace(/^\.+|\.+$/g, "");
  return cleaned || null;
}

// LDAP settings stored under system_settings key 'auth.ldap'
export type LdapSettings = {
  url?: string;
  startTls?: boolean;
  bindDn?: string;
  bindPassword?: string; // encrypted at rest
  baseDn?: string;
  userFilter?: string;
  usernameAttr?: string;
  firstNameAttr?: string;
  lastNameAttr?: string;
  emailAttr?: string;
  disabledFilter?: string;
};
import session from "express-session";
import connectPg from "connect-pg-simple";

const PostgresSessionStore = connectPg(session);

type UserPreferencesUpdateInput = Partial<Omit<UserPreferences, "userId" | "updatedAt">>;

export interface TemplateExpansionTask {
  id: string;
  candidateId: string;
  assigneeUserId: string | null;
  assigneeKind: 'user' | 'role';
  assigneeRole: string | null;
  title: string;
  status: string;
  dueAt: Date | null;
  pendingAnchor: boolean;
}

export interface TemplateExpansionResult {
  createdCount: number;
  createdTasks: TemplateExpansionTask[];
}

export interface AuthorizationContext {
  userId: string | null;
  roles: Set<string>;
  departmentIds: Set<string>;
  divisionIds: Set<string>;
  managedCandidateIds: Set<string>;
  privileged: boolean;
  isCandidate: boolean;
}

export interface CandidateScopeFilters {
  departmentIds?: Iterable<string>;
  divisionIds?: Iterable<string>;
  managerIds?: Iterable<string>;
  candidateIds?: Iterable<string>;
  linkedUserIds?: Iterable<string>;
}

export type DivisionActiveCandidateSummary = {
  divisionId: string;
  divisionName: string;
  departmentId: string;
  departmentName: string;
  activeCandidateCount: number;
};

export type RecentActivityEventType =
  | "candidate_created"
  | "task_completed"
  | "candidate_stage_changed"
  | "template_applied";

export type RecentActivityEvent = {
  id: string;
  type: RecentActivityEventType;
  occurredAt: Date;
  candidateId: string | null;
  candidateFirstName: string | null;
  candidateLastName: string | null;
  candidateTypeName: string | null;
  taskTitle?: string | null;
  stageName?: string | null;
  templateName?: string | null;
};

function applyScopeFilters(whereConditions: any[], filters: CandidateScopeFilters, requireScope = false) {
  const scopeConditions: any[] = [];
  const departmentIds = filters.departmentIds ? Array.from(new Set(filters.departmentIds)) : [];
  const divisionIds = filters.divisionIds ? Array.from(new Set(filters.divisionIds)) : [];
  const managerIds = filters.managerIds ? Array.from(new Set(filters.managerIds)) : [];
  const candidateIds = filters.candidateIds ? Array.from(new Set(filters.candidateIds)) : [];
  const linkedUserIds = filters.linkedUserIds ? Array.from(new Set(filters.linkedUserIds)) : [];

  if (departmentIds.length > 0) {
    scopeConditions.push(inArray(candidates.departmentId, departmentIds));
  }
  if (divisionIds.length > 0) {
    scopeConditions.push(inArray(candidates.divisionId, divisionIds));
  }
  if (managerIds.length > 0) {
    scopeConditions.push(inArray(candidates.managerId, managerIds));
  }
  if (candidateIds.length > 0) {
    scopeConditions.push(inArray(candidates.id, candidateIds));
  }
  if (linkedUserIds.length > 0) {
    scopeConditions.push(inArray(candidates.linkedUserId, linkedUserIds));
  }

  if (scopeConditions.length > 0) {
    if (scopeConditions.length === 1) {
      whereConditions.push(scopeConditions[0]);
    } else {
      whereConditions.push(or(...scopeConditions));
    }
  } else if (requireScope) {
    whereConditions.push(sql`false`);
  }
}

export interface IStorage {
  buildAuthorizationContext(user: Express.User | null | undefined): AuthorizationContext;
  // Basic user operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  getAllUsers(filters?: { status?: string; role?: string; departmentId?: string; divisionId?: string; search?: string }): Promise<User[]>;
  getUserIdentities(userId: string): Promise<UserIdentity[]>;
  getUserIdentityByProvider(provider: string, externalId: string): Promise<UserIdentity | undefined>;
  createUserIdentity(identity: InsertUserIdentity): Promise<UserIdentity>;
  updateUserIdentity(id: string, data: Partial<UserIdentity>): Promise<UserIdentity | undefined>;
  deleteUserIdentity(id: string): Promise<void>;
  
  // User role management
  getUserRoles(userId: string): Promise<UserRole[]>;
  setUserRoles(userId: string, roles: string[]): Promise<UserRole[]>;
  addUserRoles(userId: string, roles: string[]): Promise<UserRole[]>;
  getUserDepartmentScopeIds(userId: string): Promise<string[]>;
  getUserDivisionScopeIds(userId: string): Promise<string[]>;
  getManagerCandidateScopeIds(managerId: string): Promise<string[]>;

  // Invitations
  createInvitation(params: { email: string; roles: string[]; invitedBy?: string | null; token: string; expiresAt: Date; departmentId?: string | null; divisionId?: string | null; firstName?: string | null; lastName?: string | null }): Promise<Invitation>;
  getInvitationByToken(token: string): Promise<Invitation | null>;
  consumeInvitation(id: string): Promise<Invitation | null>;
  findValidPendingInviteForIdentifier(identifier: string): Promise<Invitation | null>;
  getPendingInvitationsForUsersList(filters?: { role?: string; departmentId?: string; divisionId?: string; search?: string }): Promise<Array<Invitation & { department?: { id: string; name: string } | null; division?: { id: string; name: string } | null }>>;
  
  // User status management
  disableUser(userId: string, reassignOpenTasksTo?: string): Promise<{ success: boolean; tasksReassigned?: number }>;
  enableUser(userId: string): Promise<User | undefined>;
  updateLastLogin(userId: string): Promise<void>;
  
  // User task counts (for disable dialog)
  getUserOpenTaskCount(userId: string): Promise<{ total: number; required: number }>;
  
  // User Preferences
  getUserPreferences(userId: string): Promise<UserPreferences | undefined>;
  upsertUserPreferences(userId: string, updates: UserPreferencesUpdateInput): Promise<UserPreferences>;
  
  // Candidates
  getCandidates(filters?: any, auth?: AuthorizationContext): Promise<Candidate[]>;
  getCandidate(id: string, auth?: AuthorizationContext): Promise<Candidate | undefined>;
  createCandidate(candidate: InsertCandidate): Promise<Candidate>;
  updateCandidate(id: string, data: Partial<Candidate>): Promise<Candidate | undefined>;
  
  // Tasks
  getCandidateTasks(filters?: any, auth?: AuthorizationContext): Promise<CandidateTask[]>;
  getCandidateTask(id: string): Promise<CandidateTask | undefined>;
  createCandidateTask(task: InsertCandidateTask): Promise<CandidateTask>;
  updateCandidateTask(id: string, data: Partial<CandidateTask>): Promise<CandidateTask | undefined>;
  deleteCandidateTask(id: string): Promise<void>;
  archiveCandidateTask(id: string): Promise<void>;
  resolveCandidateSelfAssignments(candidateId: string, userId: string): Promise<TemplateExpansionTask[]>;
  getCandidateStageHistory(candidateId: string): Promise<any[]>;
  getDashboardTasks(): Promise<any[]>;
  getDivisionActiveCandidateCounts(limit?: number, auth?: AuthorizationContext): Promise<DivisionActiveCandidateSummary[]>;
  getRecentActivityEvents(limit?: number, auth?: AuthorizationContext): Promise<RecentActivityEvent[]>;
  
  // Templates
  getTemplates(): Promise<Template[]>;
  getTemplate(id: string): Promise<Template | undefined>;
  createTemplate(template: InsertTemplate, cloneFromTemplateId?: string): Promise<Template>;
  updateTemplate(id: string, data: Partial<Template>): Promise<Template | undefined>;
  archiveTemplate(id: string): Promise<void>;
  getTemplateReadiness(id: string): Promise<{ active_stage_count: number }>;
  
  // Template Tasks
  getTemplateTasks(templateId: string): Promise<TemplateTask[]>;
  getTemplateTask(id: string): Promise<TemplateTask | undefined>;
  createTemplateTask(task: InsertTemplateTask): Promise<TemplateTask>;
  updateTemplateTask(id: string, data: Partial<TemplateTask>): Promise<TemplateTask | undefined>;
  archiveTemplateTask(id: string): Promise<void>;
  
  // Template Stages
  getTemplateStages(templateId: string): Promise<TemplateStage[]>;
  getTemplateStage(id: string): Promise<TemplateStage | undefined>;
  createTemplateStage(stage: InsertTemplateStage): Promise<TemplateStage>;
  updateTemplateStage(id: string, data: Partial<TemplateStage>): Promise<TemplateStage | undefined>;
  deleteTemplateStage(id: string): Promise<void>;
  reorderTemplateStages(templateId: string, stageIdsInOrder: string[]): Promise<void>;
  
  // Candidate Template Stages (snapshots)
  getCandidateTemplateStages(candidateId: string): Promise<CandidateTemplateStage[]>;
  createCandidateTemplateStage(stage: InsertCandidateTemplateStage): Promise<CandidateTemplateStage>;
  upsertCandidateTemplateStages(candidateId: string, stages: InsertCandidateTemplateStage[]): Promise<void>;

  // Candidate followers
  getCandidateFollowers(candidateId: string): Promise<CandidateFollower[]>;
  addCandidateFollower(candidateId: string, userId: string): Promise<void>;
  removeCandidateFollower(candidateId: string, userId: string): Promise<void>;

  // Notifications
  getNotifications(params: { userId: string; limit?: number; cursor?: string; unreadOnly?: boolean; types?: string[] }): Promise<{ items: Notification[]; nextCursor?: string; unreadCount: number; totalCount: number }>;
  setNotificationRead(userId: string, notificationId: string, isRead: boolean): Promise<boolean>;
  markAllNotificationsRead(userId: string): Promise<number>;
  deleteReadNotificationsBefore(cutoff: Date, batchSize: number): Promise<number>;
  
  // Task Definitions
  getTaskDefinitions(): Promise<TaskDefinition[]>;
  getTaskDefinition(id: string): Promise<TaskDefinition | undefined>;
  createTaskDefinition(taskDef: InsertTaskDefinition): Promise<TaskDefinition>;
  updateTaskDefinition(id: string, data: Partial<TaskDefinition>): Promise<TaskDefinition | undefined>;
  
  // Departments and Divisions
  getDepartments(includeArchived?: boolean): Promise<Department[]>;
  getDivisions(departmentId?: string, includeArchived?: boolean): Promise<Division[]>;
  getDivisionsByDepartment(departmentId: string, searchQuery?: string, limit?: number, offset?: number): Promise<Division[]>;
  getManagersByDepartment(departmentId: string, divisionId?: string, searchQuery?: string, limit?: number, offset?: number): Promise<Array<{ id: string; name: string; email: string; role: string }>>;
  createDepartment(dept: InsertDepartment): Promise<Department>;
  createDivision(div: InsertDivision): Promise<Division>;
  updateDepartment(id: string, data: Partial<Department>): Promise<Department | undefined>;
  updateDivision(id: string, data: Partial<Division>): Promise<Division | undefined>;
  searchDepartments(query: string): Promise<Array<{ id: string; name: string; score?: number }>>;
  searchDivisions(query: string, departmentId?: string): Promise<Array<{ id: string; name: string; departmentId?: string; score?: number }>>;
  searchUsers(query: string, options?: { departmentId?: string; divisionId?: string; role?: string }): Promise<Array<{ id: string; name: string; email: string; role: string }>>;
  
  // Reference data
  getHiringStages(): Promise<HiringStage[]>;
  createHiringStage(stage: InsertHiringStage): Promise<HiringStage>;
  updateHiringStage(id: string, stage: Partial<HiringStage>): Promise<HiringStage | undefined>;
  deleteHiringStage(id: string): Promise<void>;
  getTaskCategories(): Promise<TaskCategory[]>;
  getTaskPriorities(): Promise<TaskPriority[]>;
  getCandidateTypes(): Promise<CandidateType[]>;
  getFacultyRanks(): Promise<FacultyRank[]>;
  getUsers(): Promise<User[]>; // Legacy method - use getAllUsers for new code
  
  // System settings
  getSystemSettings(): Promise<{ auto_regress_on_prior_open: boolean }>;
  setSystemSettings(patch: { auto_regress_on_prior_open?: boolean }): Promise<{ auto_regress_on_prior_open: boolean } | undefined>;
  
  // Auth Providers
  getAllAuthProviders(): Promise<AuthProvider[]>;
  getAuthProvider(id: string): Promise<AuthProvider | undefined>;
  updateAuthProvider(id: string, data: Partial<AuthProvider>): Promise<AuthProvider | undefined>;
  getLdapSettings(): Promise<LdapSettings>;
  getLdapConfigured(): Promise<boolean>;
  setLdapSettings(patch: Partial<LdapSettings>): Promise<LdapSettings>;
  
  // Session store
  sessionStore: session.Store;
  
  // Template expansion
  expandTemplate(templateId: string, candidateId: string, currentUserId: string): Promise<TemplateExpansionResult>;
  recomputeCandidateDueDates(candidateId: string): Promise<{ updated: number }>;
  
  // Template estimation
  estimateTemplate(templateId: string, options?: { looDate?: string | null; startDate?: string | null; candidateId?: string | null; businessDays?: boolean }): Promise<any>;

  // Comments
  getCandidateComments(params: { candidateId: string; visibility?: 'all'|'internal'|'external'; role: string; cursor?: string; limit?: number }): Promise<{ items: any[]; nextCursor?: string; totalVisibleCount: number }>;
  getTaskComments(params: { taskId: string; visibility?: 'all'|'internal'|'external'; role: string; cursor?: string; limit?: number }): Promise<{ items: any[]; nextCursor?: string; totalVisibleCount: number }>;
  createComment(params: { entityType: 'candidate'|'task'; entityId: string; authorUserId: string; role: string; body: string; visibility: 'internal'|'external'; parentId?: string | null }): Promise<any>;
  editComment(params: { id: string; userId: string; userRole: string; body: string }): Promise<any>;
  deleteComment(params: { id: string; userId: string; userRole: string }): Promise<void>;
  getCommentStats(params: { candidateId: string; role: string }): Promise<{ profile: { internalCount: number; externalCount: number; totalVisible: number }; byTask: Record<string, { internalCount: number; externalCount: number; totalVisible: number }> }>;
}

export interface DatabaseStorageOptions {
  db?: typeof defaultDb;
  pool?: Pool;
  sessionStore?: session.Store;
}

export class DatabaseStorage implements IStorage {
  private readonly db: typeof defaultDb;
  private readonly pool: Pool;
  public readonly sessionStore: session.Store;

  constructor(options: DatabaseStorageOptions = {}) {
    this.db = options.db ?? defaultDb;
    this.pool = options.pool ?? defaultPool;
    this.sessionStore = options.sessionStore ?? new PostgresSessionStore({
      pool: this.pool,
      createTableIfMissing: true
    });
  }

  private buildCandidateVisibilityChecker(auth: AuthorizationContext) {
    if (auth.privileged) {
      return () => true;
    }

    return (candidate: { departmentId?: string | null; divisionId?: string | null; managerId?: string | null; id?: string; linkedUserId?: string | null; }): boolean => {
      if (!candidate) return false;

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
    };
  }

  buildAuthorizationContext(user: Express.User | null | undefined): AuthorizationContext {
    const roles = new Set<string>();
    if (user?.role) {
      roles.add(user.role);
    }
    if (Array.isArray((user as any)?.roles)) {
      for (const role of (user as any).roles) {
        if (typeof role === "string" && role) {
          roles.add(role);
        }
      }
    }

    const departmentIds = new Set<string>();
    if (Array.isArray((user as any)?.departmentScopes)) {
      for (const dept of (user as any).departmentScopes) {
        if (typeof dept === "string" && dept) {
          departmentIds.add(dept);
        }
      }
    }

    const divisionIds = new Set<string>();
    if (Array.isArray((user as any)?.divisionScopes)) {
      for (const div of (user as any).divisionScopes) {
        if (typeof div === "string" && div) {
          divisionIds.add(div);
        }
      }
    }

    const managedCandidateIds = new Set<string>();
    if (Array.isArray((user as any)?.managedCandidateIds)) {
      for (const candidate of (user as any).managedCandidateIds) {
        if (typeof candidate === "string" && candidate) {
          managedCandidateIds.add(candidate);
        }
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

  private decodeCursor(cursor?: string): { createdAt: Date; id: string } | undefined {
    if (!cursor) return undefined;
    try {
      const raw = Buffer.from(cursor, 'base64').toString('utf8');
      const obj = JSON.parse(raw);
      return { createdAt: new Date(obj.createdAt), id: obj.id };
    } catch {
      return undefined;
    }
  }

  private encodeCursor(row: { createdAt: Date; id: string }): string {
    return Buffer.from(JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id })).toString('base64');
  }

  private buildMentionKeyBase(source: { mentionKey?: string | null; username?: string | null; firstName?: string | null; lastName?: string | null; email?: string | null }): string {
    return (
      sanitizeMentionKey(source.mentionKey)
      ?? sanitizeMentionKey(source.username)
      ?? sanitizeMentionKey(`${source.firstName ?? ''}.${source.lastName ?? ''}`)
      ?? sanitizeMentionKey(source.email?.split('@')[0])
      ?? 'user'
    );
  }

  private async ensureUniqueMentionKey(base: string, excludeUserId?: string): Promise<string> {
    let attempt = 1;
    while (true) {
      const candidate = attempt === 1 ? base : `${base}.${attempt}`;
      const existing = await this.db
        .select({ id: users.id })
        .from(users)
        .where(
          excludeUserId
            ? and(eq(users.mentionKey, candidate), ne(users.id, excludeUserId))
            : eq(users.mentionKey, candidate)
        )
        .limit(1);
      if (existing.length === 0) {
        return candidate;
      }
      attempt += 1;
    }
  }

  private async generateMentionKey(source: { mentionKey?: string | null; username?: string | null; firstName?: string | null; lastName?: string | null; email?: string | null }, excludeUserId?: string): Promise<string> {
    const base = this.buildMentionKeyBase(source);
    return this.ensureUniqueMentionKey(base, excludeUserId);
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const mentionKey = await this.generateMentionKey(insertUser);
    const [user] = await this.db
      .insert(users)
      .values({ ...insertUser, mentionKey })
      .returning();
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const existing = await this.getUser(id);
    if (!existing) return undefined;

    const updates: Partial<User> = { ...data };

    if (Object.prototype.hasOwnProperty.call(updates, 'mentionKey')) {
      updates.mentionKey = await this.generateMentionKey(
        {
          mentionKey: updates.mentionKey,
          username: updates.username ?? existing.username,
          firstName: updates.firstName ?? existing.firstName,
          lastName: updates.lastName ?? existing.lastName,
          email: updates.email ?? existing.email
        },
        id
      );
    }

    const [user] = await this.db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async getAllUsers(filters?: { status?: string; role?: string; departmentId?: string; divisionId?: string; search?: string }): Promise<User[]> {
    const whereConditions = [];
    
    if (filters?.status) {
      whereConditions.push(eq(users.status, filters.status as any));
    }
    
    if (filters?.role) {
      whereConditions.push(eq(users.role, filters.role as any));
    }
    
    if (filters?.departmentId) {
      whereConditions.push(eq(users.departmentId, filters.departmentId));
    }
    
    if (filters?.divisionId) {
      whereConditions.push(eq(users.divisionId, filters.divisionId));
    }
    
    if (filters?.search) {
      whereConditions.push(
        or(
          ilike(users.firstName, `%${filters.search}%`),
          ilike(users.lastName, `%${filters.search}%`),
          ilike(users.email, `%${filters.search}%`)
        )
      );
    }
    
    return await this.db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        mentionKey: users.mentionKey,
        passwordHash: users.passwordHash,
        role: users.role,
        status: users.status,
        departmentId: users.departmentId,
        divisionId: users.divisionId,
        active: users.active,
        lastLoginAt: users.lastLoginAt,
        // Multi-provider auth fields
        authProvider: users.authProvider,
        externalId: users.externalId,
        username: users.username,
        emailVerified: users.emailVerified,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        department: {
          id: departments.id,
          name: departments.name
        },
        division: {
          id: divisions.id,
          name: divisions.name
        }
      })
      .from(users)
      .leftJoin(departments, eq(users.departmentId, departments.id))
      .leftJoin(divisions, eq(users.divisionId, divisions.id))
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .orderBy(users.firstName, users.lastName);
  }

  async getUserRoles(userId: string): Promise<UserRole[]> {
    return await this.db
      .select()
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
  }

  async getUserDepartmentScopeIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ departmentId: userDepartmentScopes.departmentId })
      .from(userDepartmentScopes)
      .where(eq(userDepartmentScopes.userId, userId));
    return rows.map((row) => row.departmentId);
  }

  async getUserDivisionScopeIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ divisionId: userDivisionScopes.divisionId })
      .from(userDivisionScopes)
      .where(eq(userDivisionScopes.userId, userId));
    return rows.map((row) => row.divisionId);
  }

  async getManagerCandidateScopeIds(managerId: string): Promise<string[]> {
    const rows = await this.db
      .select({ candidateId: managerCandidateScopes.candidateId })
      .from(managerCandidateScopes)
      .where(eq(managerCandidateScopes.managerId, managerId));
    return rows.map((row) => row.candidateId);
  }

  async setUserRoles(userId: string, roles: string[]): Promise<UserRole[]> {
    // Remove existing roles
    await this.db.delete(userRoles).where(eq(userRoles.userId, userId));
    
    // Add new roles
    if (roles.length > 0) {
      const newRoles = roles.map(role => ({
        userId,
        role: role as any
      }));
      
      return await this.db
        .insert(userRoles)
        .values(newRoles)
        .returning();
    }
    
    return [];
  }

  async addUserRoles(userId: string, roles: string[]): Promise<UserRole[]> {
    if (!roles.length) {
      return await this.getUserRoles(userId);
    }

    const roleValues = roles.map(role => ({
      userId,
      role: role as any,
      updatedAt: new Date(),
      createdAt: new Date()
    }));

    await this.db
      .insert(userRoles)
      .values(roleValues)
      .onConflictDoNothing({
        target: [userRoles.userId, userRoles.role]
      });

    return await this.getUserRoles(userId);
  }

  async disableUser(userId: string, reassignOpenTasksTo?: string): Promise<{ success: boolean; tasksReassigned?: number }> {
    return await this.db.transaction(async (tx) => {
      // Disable the user
      await tx
        .update(users)
        .set({ status: 'disabled', updatedAt: new Date() })
        .where(eq(users.id, userId));
      
      let tasksReassigned = 0;
      
      // Reassign open tasks if requested
      if (reassignOpenTasksTo) {
        const result = await tx
          .update(candidateTasks)
          .set({ assigneeKind: 'user', assigneeUserId: reassignOpenTasksTo, assigneeRole: null, assigneeResolvedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(candidateTasks.assigneeUserId, userId),
              ne(candidateTasks.status, 'done'),
              ne(candidateTasks.status, 'canceled'),
              eq(candidateTasks.archived, false)
            )
          )
          .returning();
        
        tasksReassigned = result.length;
      }
      
      return { success: true, tasksReassigned };
    });
  }

  async enableUser(userId: string): Promise<User | undefined> {
    const [user] = await this.db
      .update(users)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user || undefined;
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, userId));
  }

  async getUserOpenTaskCount(userId: string): Promise<{ total: number; required: number }> {
    const result = await this.db.execute(sql`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN required = true THEN 1 ELSE 0 END) as required
      FROM candidate_tasks 
      WHERE assignee_user_id = ${userId}
        AND status NOT IN ('done', 'canceled')
        AND archived = false
    `);
    
    const row = result.rows[0] as any;
    return {
      total: parseInt(row.total) || 0,
      required: parseInt(row.required) || 0
    };
  }

  async getCandidates(filters?: any, auth?: AuthorizationContext): Promise<any[]> {
    const whereConditions = [];

    const toArray = (value: any): string[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value.filter((entry) => typeof entry === 'string' && entry.length > 0);
      return typeof value === 'string' && value.length > 0 ? [value] : [];
    };

    // By default, exclude archived candidates unless explicitly requested
    if (!filters?.includeArchived) {
      whereConditions.push(eq(candidates.archived, false));
    }

    const departmentIds = toArray(filters?.departmentIds ?? filters?.departmentId);
    const divisionIds = toArray(filters?.divisionIds ?? filters?.divisionId);
    const managerIds = toArray(filters?.managerIds ?? filters?.managerId);
    const candidateIds = toArray(filters?.candidateIds ?? filters?.candidateId);
    const linkedUserIds = toArray(filters?.linkedUserIds ?? filters?.linkedUserId);

    applyScopeFilters(whereConditions, {
      departmentIds,
      divisionIds,
      managerIds,
      candidateIds,
      linkedUserIds
    }, filters?.requireScope === true);

    if (auth && !auth.privileged) {
      const authFilters: CandidateScopeFilters = {};
      if (auth.departmentIds.size > 0) {
        authFilters.departmentIds = auth.departmentIds;
      }
      if (auth.divisionIds.size > 0) {
        authFilters.divisionIds = auth.divisionIds;
      }
      const managerScope = new Set<string>();
      if (auth.managedCandidateIds.size > 0) {
        authFilters.candidateIds = auth.managedCandidateIds;
      }
      if (auth.roles.has("manager") && auth.userId) {
        managerScope.add(auth.userId);
        authFilters.managerIds = managerScope;
      }
      if (auth.roles.has("candidate") && auth.userId) {
        authFilters.linkedUserIds = [auth.userId];
      }
      applyScopeFilters(whereConditions, authFilters, true);
    }

    const currentTemplateStage = alias(templateStages, "current_template_stage");

    return await this.db
      .select({
        id: candidates.id,
        salutation: candidates.salutation,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
        offerLetterIssuedAt: candidates.offerLetterIssuedAt,
        offerLetterAcceptedAt: candidates.offerLetterAcceptedAt,
        anticipatedStartDate: candidates.anticipatedStartDate,
        status: candidates.status,
        candidateTypeId: candidates.candidateTypeId,
        departmentId: candidates.departmentId,
        divisionId: candidates.divisionId,
        managerId: candidates.managerId,
        facultyRankId: candidates.facultyRankId,
        currentStageId: candidates.currentStageId,
        templateAppliedFromId: candidates.templateAppliedFromId,
        templateAppliedAt: candidates.templateAppliedAt,
        templateLocked: candidates.templateLocked,
        templateNameSnapshot: candidates.templateNameSnapshot,
        templateVersion: candidates.templateVersion,
        archived: candidates.archived,
        archivedAt: candidates.archivedAt,
        archivedBy: candidates.archivedBy,
        createdAt: candidates.createdAt,
        updatedAt: candidates.updatedAt,
        pendingAnchorCount: sql<number>`(
          SELECT count(*)::int
          FROM candidate_tasks ct
          WHERE ct.candidate_id = ${candidates.id}
            AND ct.pending_anchor = true
            AND ct.archived = false
        )`,
        openPrehireTasks: sql<number>`(
          SELECT count(*)::int
          FROM candidate_tasks ct
          WHERE ct.candidate_id = ${candidates.id}
            AND ct.archived = false
            AND ct.status NOT IN ('done', 'canceled')
            AND (ct.phase_snapshot IS NULL OR ct.phase_snapshot = 'pre_hire')
        )`,
        openOnboardingTasks: sql<number>`(
          SELECT count(*)::int
          FROM candidate_tasks ct
          WHERE ct.candidate_id = ${candidates.id}
            AND ct.archived = false
            AND ct.status NOT IN ('done', 'canceled')
            AND ct.phase_snapshot = 'onboarding'
        )`,
        currentStage: {
          id: hiringStages.id,
          name: hiringStages.name,
          phase: currentTemplateStage.phase,
          // DISPLAY ONLY: global orderIndex for UI sorting, not business logic
          orderIndex: hiringStages.orderIndex
        }
      })
      .from(candidates)
      .leftJoin(hiringStages, eq(candidates.currentStageId, hiringStages.id))
      .leftJoin(currentTemplateStage, and(
        eq(currentTemplateStage.templateId, candidates.templateAppliedFromId),
        eq(currentTemplateStage.stageId, candidates.currentStageId),
        eq(currentTemplateStage.isActive, true)
      ))
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .orderBy(desc(candidates.createdAt));
  }

  async getCandidate(id: string, auth?: AuthorizationContext): Promise<any> {
    const primaryOwner = alias(users, "primary_owner");
    const currentTemplateStage = alias(templateStages, "current_template_stage");
    const [candidate] = await this.db
      .select({
        id: candidates.id,
        salutation: candidates.salutation,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
        candidateTypeId: candidates.candidateTypeId,
        departmentId: candidates.departmentId,
        divisionId: candidates.divisionId,
        managerId: candidates.managerId,
        facultyRankId: candidates.facultyRankId,
        offerLetterIssuedAt: candidates.offerLetterIssuedAt,
        offerLetterAcceptedAt: candidates.offerLetterAcceptedAt,
        anticipatedStartDate: candidates.anticipatedStartDate,
        status: candidates.status,
        primaryOwnerId: candidates.primaryOwnerId,
        linkedUserId: candidates.linkedUserId,
        currentStageId: candidates.currentStageId,
        templateAppliedFromId: candidates.templateAppliedFromId,
        templateAppliedAt: candidates.templateAppliedAt,
        templateLocked: candidates.templateLocked,
        archived: candidates.archived,
        archivedAt: candidates.archivedAt,
        archivedBy: candidates.archivedBy,
        isBlockedByPriorStage: candidates.isBlockedByPriorStage,
        blockerSummary: candidates.blockerSummary,
        createdAt: candidates.createdAt,
        updatedAt: candidates.updatedAt,
        pendingAnchorCount: sql<number>`(
          SELECT count(*)::int
          FROM candidate_tasks ct
          WHERE ct.candidate_id = ${candidates.id}
            AND ct.pending_anchor = true
            AND ct.archived = false
        )`,
        candidateType: {
          id: candidateTypes.id,
          name: candidateTypes.name
        },
        department: {
          id: departments.id,
          name: departments.name
        },
        division: {
          id: divisions.id,
          name: divisions.name
        },
        manager: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email
        },
        primaryOwner: {
          id: primaryOwner.id,
          firstName: primaryOwner.firstName,
          lastName: primaryOwner.lastName,
          email: primaryOwner.email
        },
        facultyRank: {
          id: facultyRanks.id,
          name: facultyRanks.name
        },
        templateNameSnapshot: candidates.templateNameSnapshot,
        templateVersion: candidates.templateVersion,
        currentStage: {
          id: hiringStages.id,
          name: hiringStages.name,
          phase: currentTemplateStage.phase,
          // DISPLAY ONLY: global orderIndex for UI sorting, not business logic
          orderIndex: hiringStages.orderIndex
        }
      })
      .from(candidates)
      .leftJoin(candidateTypes, eq(candidates.candidateTypeId, candidateTypes.id))
      .leftJoin(departments, eq(candidates.departmentId, departments.id))
      .leftJoin(divisions, eq(candidates.divisionId, divisions.id))
      .leftJoin(users, eq(candidates.managerId, users.id))
      .leftJoin(primaryOwner, eq(candidates.primaryOwnerId, primaryOwner.id))
      .leftJoin(facultyRanks, eq(candidates.facultyRankId, facultyRanks.id))
      .leftJoin(hiringStages, eq(candidates.currentStageId, hiringStages.id))
      .leftJoin(currentTemplateStage, and(
        eq(currentTemplateStage.templateId, candidates.templateAppliedFromId),
        eq(currentTemplateStage.stageId, candidates.currentStageId),
        eq(currentTemplateStage.isActive, true)
      ))
      .where(eq(candidates.id, id));
    if (!candidate) return undefined;
    if (auth && !auth.privileged) {
      const accessible = this.buildCandidateVisibilityChecker(auth);
      if (!accessible(candidate)) {
        return undefined;
      }
    }
    return candidate;
  }

  // System settings helpers
  async getSystemSettings(): Promise<{ auto_regress_on_prior_open: boolean }> {
    const rows = await this.db.select().from(systemSettings);
    const map = new Map(rows.map((r: any) => [r.key, r.value]));
    const autoRegress = Boolean(map.get('auto_regress_on_prior_open')?.enabled ?? false);
    return { auto_regress_on_prior_open: autoRegress };
  }

  async setSystemSettings(patch: { auto_regress_on_prior_open?: boolean }): Promise<{ auto_regress_on_prior_open: boolean } | undefined> {
    if (patch.auto_regress_on_prior_open !== undefined) {
      const now = new Date();
      const value = { enabled: !!patch.auto_regress_on_prior_open } as any;
      await this.db
        .insert(systemSettings)
        .values({ key: 'auto_regress_on_prior_open', value, updatedAt: now, createdAt: now } as any)
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value, updatedAt: now }
        });
    }
    return await this.getSystemSettings();
  }

  // LDAP settings helpers (global/single-tenant)
  async getLdapSettings(): Promise<LdapSettings> {
    const rows = await this.db.select().from(systemSettings);
    const map = new Map(rows.map((r: any) => [r.key, r.value]));
    const stored = (map.get('auth.ldap') ?? {}) as LdapSettings;

    // Fallback seed from env if nothing in DB
    const seeded: LdapSettings = Object.keys(stored).length === 0 ? {
      url: process.env.LDAP_URL,
      startTls: process.env.LDAP_STARTTLS === 'true',
      bindDn: process.env.LDAP_BIND_DN,
      bindPassword: process.env.LDAP_BIND_PASSWORD ? encryptSecret(process.env.LDAP_BIND_PASSWORD) : undefined,
      baseDn: process.env.LDAP_BASE_DN,
      userFilter: process.env.LDAP_USER_FILTER || '(uid={{username}})',
      usernameAttr: process.env.LDAP_ATTR_USERNAME || 'uid',
      firstNameAttr: process.env.LDAP_ATTR_FIRST_NAME || 'givenName',
      lastNameAttr: process.env.LDAP_ATTR_LAST_NAME || 'sn',
      emailAttr: process.env.LDAP_ATTR_EMAIL || 'mail',
      disabledFilter: process.env.LDAP_DISABLED_FILTER,
    } : stored;

    // Decrypt for server-side use
    const decrypted = { ...seeded } as LdapSettings & { bindPassword?: string };
    if (decrypted.bindPassword) {
      const plain = decryptSecret(decrypted.bindPassword);
      if (plain) decrypted.bindPassword = plain;
    }
    return decrypted;
  }

  async setLdapSettings(partial: Partial<LdapSettings>): Promise<LdapSettings> {
    // Load existing to support partial updates and to avoid clearing password
    const existing = await this.getLdapSettings();
    const next: LdapSettings = {
      url: partial.url ?? existing.url,
      startTls: partial.startTls ?? existing.startTls,
      bindDn: partial.bindDn ?? existing.bindDn,
      bindPassword: existing.bindPassword, // temporary plain for now
      baseDn: partial.baseDn ?? existing.baseDn,
      userFilter: partial.userFilter ?? existing.userFilter,
      usernameAttr: partial.usernameAttr ?? existing.usernameAttr,
      firstNameAttr: partial.firstNameAttr ?? existing.firstNameAttr,
      lastNameAttr: partial.lastNameAttr ?? existing.lastNameAttr,
      emailAttr: partial.emailAttr ?? existing.emailAttr,
      disabledFilter: partial.disabledFilter ?? existing.disabledFilter,
    };

    // If an explicit bindPassword provided: set it
    if (partial.bindPassword !== undefined) {
      next.bindPassword = partial.bindPassword || existing.bindPassword;
    }

    // Prepare to store encrypted
    const toStore: LdapSettings = { ...next };
    if (toStore.bindPassword) {
      toStore.bindPassword = encryptSecret(toStore.bindPassword);
    }

    const now = new Date();
    await this.db
      .insert(systemSettings)
      .values({ key: 'auth.ldap', value: toStore as any, updatedAt: now, createdAt: now } as any)
      .onConflictDoUpdate({ target: systemSettings.key, set: { value: toStore as any, updatedAt: now } });

    // Return decrypted/current
    return await this.getLdapSettings();
  }

  async getLdapConfigured(): Promise<boolean> {
    const cfg = await this.getLdapSettings();
    if (!cfg.url || !cfg.bindDn || !cfg.bindPassword || !cfg.baseDn) return false;
    if (!cfg.url.startsWith('ldaps://') && !cfg.startTls) return false;
    return true;
  }

  async createCandidate(insertCandidate: InsertCandidate): Promise<Candidate> {
    const payload = {
      ...insertCandidate,
      primaryOwnerId: insertCandidate.primaryOwnerId ?? null
    };
    const [candidate] = await this.db
      .insert(candidates)
      .values(payload)
      .returning();
    return candidate;
  }

  async updateCandidate(id: string, data: Partial<Candidate>): Promise<Candidate | undefined> {
    const [candidate] = await this.db
      .update(candidates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(candidates.id, id))
      .returning();
    return candidate || undefined;
  }

  async getCandidateTasks(filters?: any, auth?: AuthorizationContext): Promise<any[]> {
    const whereConditions = [eq(candidateTasks.archived, false)];
    
    if (filters?.assigneeId) {
      whereConditions.push(eq(candidateTasks.assigneeUserId, filters.assigneeId));
    }
    
    if (filters?.candidateId) {
      whereConditions.push(eq(candidateTasks.candidateId, filters.candidateId));
    }
    
    if (filters?.status) {
      whereConditions.push(eq(candidateTasks.status, filters.status));
    }

    // Add candidate status filtering for My Tasks queries
    if (filters?.assigneeId) {
      // Handle new individual flags if provided
      if (filters?.showArchived !== undefined || filters?.showCanceled !== undefined || filters?.showCompleted !== undefined) {
        const allowedStatuses = ['active', 'on_hold'] as const;
        const statusArray: any[] = [...allowedStatuses];
        if (filters.showArchived) statusArray.push('archived');
        if (filters.showCanceled) statusArray.push('canceled');
        if (filters.showCompleted) statusArray.push('completed');
        whereConditions.push(inArray(candidates.status, statusArray));
      } 
      // Fallback to old includeClosed logic for backward compatibility
      else if (filters?.includeClosed !== true) {
        whereConditions.push(
          inArray(candidates.status, ['active', 'on_hold'] as any[])
        );
      }
    }
    
    const rawTasks = await this.db
      .select({
        id: candidateTasks.id,
        candidateId: candidateTasks.candidateId,
        title: candidateTasks.title,
        description: candidateTasks.description,
        notes: candidateTasks.notes,
        stage_id: candidateTasks.stageId,
        template_stage_id: candidateTasks.templateStageId,
        stage_name: hiringStages.name,
        stage_order_index: candidateTemplateStages.orderIndex,
        assignee_id: candidateTasks.assigneeUserId,
        assignee_kind: candidateTasks.assigneeKind,
        assignee_role: candidateTasks.assigneeRole,
        assignee_resolved_at: candidateTasks.assigneeResolvedAt,
        assignee_firstName: users.firstName,
        assignee_lastName: users.lastName,
        priority: candidateTasks.priority,
        priority_name: taskPriorities.name,
        category_id: candidateTasks.categoryId,
        category_name: taskCategories.name,
        dueAt: candidateTasks.dueAt,
        due_rule_type: candidateTasks.dueRuleType,
        due_rule_value: candidateTasks.dueRuleValue,
        fixed_date: candidateTasks.fixedDate,
        pending_anchor: candidateTasks.pendingAnchor,
        phase_snapshot: candidateTasks.phaseSnapshot,
        status: candidateTasks.status,
        required: candidateTasks.required,
        cancel_reason: candidateTasks.cancelReason,
        due_soon_notified_at: candidateTasks.dueSoonNotifiedAt,
        updated_at: candidateTasks.updatedAt,
        // Add candidate fields to prevent "Unknown Candidate"
        candidate_id: candidates.id,
        candidate_first_name: candidates.firstName,
        candidate_last_name: candidates.lastName,
        candidate_status: candidates.status,
        candidate_department_id: candidates.departmentId,
        candidate_division_id: candidates.divisionId,
        candidate_manager_id: candidates.managerId,
        candidate_linked_user_id: candidates.linkedUserId
      })
      .from(candidateTasks)
      .innerJoin(candidates, eq(candidateTasks.candidateId, candidates.id)) // INNER JOIN to guarantee candidate data
      .leftJoin(candidateTemplateStages, and(
        eq(candidateTemplateStages.candidateId, candidateTasks.candidateId),
        eq(candidateTemplateStages.stageId, candidateTasks.stageId)
      ))
      .leftJoin(hiringStages, eq(hiringStages.id, candidateTasks.stageId))
      .leftJoin(users, eq(users.id, candidateTasks.assigneeUserId))
      .leftJoin(taskPriorities, eq(taskPriorities.name, candidateTasks.priority))
      .leftJoin(taskCategories, eq(taskCategories.id, candidateTasks.categoryId))
      .where(and(...whereConditions))
      .orderBy(desc(candidateTasks.dueAt), desc(candidateTasks.updatedAt));

    // Transform the flat structure to match frontend expectations
    let tasks = rawTasks.map(task => ({
      ...task,
      dueRuleType: task.due_rule_type,
      dueRuleValue: task.due_rule_value,
      fixedDate: task.fixed_date,
      pendingAnchor: task.pending_anchor,
      templateStageId: task.template_stage_id,
      phaseSnapshot: task.phase_snapshot,
      assignee: task.assignee_firstName || task.assignee_lastName ? {
        id: task.assignee_id,
        firstName: task.assignee_firstName,
        lastName: task.assignee_lastName
      } : null,
      assigneeUserId: task.assignee_id,
      assigneeKind: task.assignee_kind,
      assigneeRole: task.assignee_role,
      assigneeResolvedAt: task.assignee_resolved_at,
      dueSoonNotifiedAt: task.due_soon_notified_at,
      candidate: {
        id: task.candidate_id,
        firstName: task.candidate_first_name,
        lastName: task.candidate_last_name,
        status: task.candidate_status
      },
      candidateDepartmentId: task.candidate_department_id,
      candidateDivisionId: task.candidate_division_id,
      candidateManagerId: task.candidate_manager_id,
      candidateLinkedUserId: task.candidate_linked_user_id
    }));

    if (auth && !auth.privileged) {
      const canSeeCandidate = this.buildCandidateVisibilityChecker(auth);
      tasks = tasks.filter((task) => canSeeCandidate({
        id: task.candidate?.id,
        departmentId: task.candidateDepartmentId,
        divisionId: task.candidateDivisionId,
        managerId: task.candidateManagerId,
        linkedUserId: task.candidateLinkedUserId
      }));

      if (auth.isCandidate && auth.userId) {
        tasks = tasks.filter((task) => task.assigneeUserId === auth.userId);
      }
    }

    return tasks.map(({ candidateDepartmentId, candidateDivisionId, candidateManagerId, candidateLinkedUserId, ...rest }) => rest);
  }

  async getDashboardTasks(): Promise<any[]> {
    // Get all tasks from candidates with active or on_hold status for KPI calculations
    const rawTasks = await this.db
      .select({
        id: candidateTasks.id,
        candidateId: candidateTasks.candidateId,
        candidateFirstName: candidates.firstName,
        candidateLastName: candidates.lastName,
        candidateTypeId: candidates.candidateTypeId,
        title: candidateTasks.title,
        description: candidateTasks.description,
        assignee_id: candidateTasks.assigneeUserId,
        assignee_kind: candidateTasks.assigneeKind,
        assignee_role: candidateTasks.assigneeRole,
        assignee_resolved_at: candidateTasks.assigneeResolvedAt,
        assignee_firstName: users.firstName,
        assignee_lastName: users.lastName,
        priority: candidateTasks.priority,
        dueAt: candidateTasks.dueAt,
        status: candidateTasks.status,
        required: candidateTasks.required,
        cancel_reason: candidateTasks.cancelReason,
        due_soon_notified_at: candidateTasks.dueSoonNotifiedAt,
        updated_at: candidateTasks.updatedAt,
        candidate_status: candidates.status
      })
      .from(candidateTasks)
      .innerJoin(candidates, eq(candidateTasks.candidateId, candidates.id))
      .leftJoin(users, eq(users.id, candidateTasks.assigneeUserId))
      .where(and(
        eq(candidateTasks.archived, false),
        inArray(candidates.status, ['active', 'on_hold'])
      ))
      .orderBy(desc(candidateTasks.dueAt), desc(candidateTasks.updatedAt));

    return rawTasks.map(task => ({
      ...task,
      assignee: task.assignee_firstName || task.assignee_lastName ? {
        id: task.assignee_id,
        firstName: task.assignee_firstName,
        lastName: task.assignee_lastName
      } : null,
      assigneeUserId: task.assignee_id,
      assigneeKind: task.assignee_kind,
      assigneeRole: task.assignee_role,
      assigneeResolvedAt: task.assignee_resolved_at,
      dueSoonNotifiedAt: task.due_soon_notified_at,
      candidate: {
        id: task.candidateId,
        firstName: task.candidateFirstName,
        lastName: task.candidateLastName,
        candidateTypeId: task.candidateTypeId,
        status: task.candidate_status
      }
    }));
  }

  async getDivisionActiveCandidateCounts(limit: number = 4, auth?: AuthorizationContext): Promise<DivisionActiveCandidateSummary[]> {
    const whereConditions: any[] = [
      eq(candidates.archived, false),
      eq(candidates.status, "active")
    ];

    if (auth && !auth.privileged) {
      const scopeFilters: CandidateScopeFilters = {};
      if (auth.departmentIds.size > 0) {
        scopeFilters.departmentIds = auth.departmentIds;
      }
      if (auth.divisionIds.size > 0) {
        scopeFilters.divisionIds = auth.divisionIds;
      }
      if (auth.managedCandidateIds.size > 0) {
        scopeFilters.candidateIds = auth.managedCandidateIds;
      }
      if (auth.roles.has("manager") && auth.userId) {
        scopeFilters.managerIds = [auth.userId];
      }
      if (auth.isCandidate && auth.userId) {
        scopeFilters.linkedUserIds = [auth.userId];
      }
      applyScopeFilters(whereConditions, scopeFilters, true);
    }

    const countExpression = sql<number>`count(*)::int`;

    const results = await this.db
      .select({
        divisionId: divisions.id,
        divisionName: divisions.name,
        departmentId: departments.id,
        departmentName: departments.name,
        activeCandidateCount: countExpression
      })
      .from(candidates)
      .innerJoin(divisions, eq(candidates.divisionId, divisions.id))
      .innerJoin(departments, eq(divisions.departmentId, departments.id))
      .where(and(...whereConditions))
      .groupBy(divisions.id, divisions.name, departments.id, departments.name)
      .orderBy(desc(countExpression), asc(divisions.name))
      .limit(Math.max(1, Math.min(limit, 25)));

    return results;
  }

  async getRecentActivityEvents(limit: number = 5, auth?: AuthorizationContext): Promise<RecentActivityEvent[]> {
    const effectiveLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 10) : 5;
    const perTypeLimit = Math.max(effectiveLimit * 2, 8);

    const buildCandidateScopeConditions = (): any[] => {
      const scopeConditions: any[] = [eq(candidates.archived, false)];
      if (auth && !auth.privileged) {
        const scopeFilters: CandidateScopeFilters = {};
        if (auth.departmentIds.size > 0) {
          scopeFilters.departmentIds = auth.departmentIds;
        }
        if (auth.divisionIds.size > 0) {
          scopeFilters.divisionIds = auth.divisionIds;
        }
        if (auth.managedCandidateIds.size > 0) {
          scopeFilters.candidateIds = auth.managedCandidateIds;
        }
        if (auth.roles.has("manager") && auth.userId) {
          scopeFilters.managerIds = [auth.userId];
        }
        if (auth.isCandidate && auth.userId) {
          scopeFilters.linkedUserIds = [auth.userId];
        }
        applyScopeFilters(scopeConditions, scopeFilters, true);
      }
      return scopeConditions;
    };

    const candidateCreatedConditions = buildCandidateScopeConditions();
    const taskConditions = buildCandidateScopeConditions();
    taskConditions.push(eq(candidateTasks.archived, false));
    taskConditions.push(eq(candidateTasks.status, "done"));
    taskConditions.push(isNotNull(candidateTasks.completedAt));

    const stageConditions = buildCandidateScopeConditions();
    const templateConditions = buildCandidateScopeConditions();
    templateConditions.push(isNotNull(candidates.templateAppliedAt));

    const [candidateCreatedRows, taskCompletedRows, stageRows, templateRows] = await Promise.all([
      this.db
        .select({
          candidateId: candidates.id,
          firstName: candidates.firstName,
          lastName: candidates.lastName,
          occurredAt: candidates.createdAt,
          candidateTypeName: candidateTypes.name
        })
        .from(candidates)
        .leftJoin(candidateTypes, eq(candidateTypes.id, candidates.candidateTypeId))
        .where(and(...candidateCreatedConditions))
        .orderBy(desc(candidates.createdAt))
        .limit(perTypeLimit),
      this.db
        .select({
          candidateId: candidates.id,
          firstName: candidates.firstName,
          lastName: candidates.lastName,
          candidateTypeName: candidateTypes.name,
          occurredAt: candidateTasks.completedAt,
          taskTitle: candidateTasks.title
        })
        .from(candidateTasks)
        .innerJoin(candidates, eq(candidateTasks.candidateId, candidates.id))
        .leftJoin(candidateTypes, eq(candidateTypes.id, candidates.candidateTypeId))
        .where(and(...taskConditions))
        .orderBy(desc(candidateTasks.completedAt))
        .limit(perTypeLimit),
      this.db
        .select({
          candidateId: candidates.id,
          firstName: candidates.firstName,
          lastName: candidates.lastName,
          candidateTypeName: candidateTypes.name,
          occurredAt: candidateStageHistory.changedAt,
          stageName: hiringStages.name
        })
        .from(candidateStageHistory)
        .innerJoin(candidates, eq(candidateStageHistory.candidateId, candidates.id))
        .leftJoin(hiringStages, eq(candidateStageHistory.toStageId, hiringStages.id))
        .leftJoin(candidateTypes, eq(candidateTypes.id, candidates.candidateTypeId))
        .where(and(...stageConditions))
        .orderBy(desc(candidateStageHistory.changedAt))
        .limit(perTypeLimit),
      this.db
        .select({
          candidateId: candidates.id,
          firstName: candidates.firstName,
          lastName: candidates.lastName,
          candidateTypeName: candidateTypes.name,
          occurredAt: candidates.templateAppliedAt,
          templateName: sql<string>`COALESCE(${candidates.templateNameSnapshot}, ${templates.name})`
        })
        .from(candidates)
        .leftJoin(candidateTypes, eq(candidateTypes.id, candidates.candidateTypeId))
        .leftJoin(templates, eq(templates.id, candidates.templateAppliedFromId))
        .where(and(...templateConditions))
        .orderBy(desc(candidates.templateAppliedAt))
        .limit(perTypeLimit)
    ]);

    const events: RecentActivityEvent[] = [
      ...candidateCreatedRows.map((row) => ({
        id: `candidate_created:${row.candidateId}:${row.occurredAt?.toISOString() ?? row.candidateId}`,
        type: "candidate_created" as const,
        occurredAt: row.occurredAt ?? new Date(0),
        candidateId: row.candidateId,
        candidateFirstName: row.firstName,
        candidateLastName: row.lastName,
        candidateTypeName: row.candidateTypeName
      })),
      ...taskCompletedRows.map((row) => ({
        id: `task_completed:${row.candidateId}:${row.occurredAt?.toISOString() ?? row.taskTitle}`,
        type: "task_completed" as const,
        occurredAt: row.occurredAt ?? new Date(0),
        candidateId: row.candidateId,
        candidateFirstName: row.firstName,
        candidateLastName: row.lastName,
        candidateTypeName: row.candidateTypeName,
        taskTitle: row.taskTitle
      })),
      ...stageRows.map((row) => ({
        id: `candidate_stage_changed:${row.candidateId}:${row.occurredAt?.toISOString() ?? row.stageName ?? "stage"}`,
        type: "candidate_stage_changed" as const,
        occurredAt: row.occurredAt ?? new Date(0),
        candidateId: row.candidateId,
        candidateFirstName: row.firstName,
        candidateLastName: row.lastName,
        candidateTypeName: row.candidateTypeName,
        stageName: row.stageName
      })),
      ...templateRows.map((row) => ({
        id: `template_applied:${row.candidateId}:${row.occurredAt?.toISOString() ?? row.templateName ?? "template"}`,
        type: "template_applied" as const,
        occurredAt: row.occurredAt ?? new Date(0),
        candidateId: row.candidateId,
        candidateFirstName: row.firstName,
        candidateLastName: row.lastName,
        candidateTypeName: row.candidateTypeName,
        templateName: row.templateName
      }))
    ];

    events.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    return events.slice(0, effectiveLimit);
  }

  async getCandidateTask(id: string): Promise<CandidateTask | undefined> {
    const [task] = await this.db
      .select()
      .from(candidateTasks)
      .where(and(eq(candidateTasks.id, id), eq(candidateTasks.archived, false)));
    return task || undefined;
  }

  async createCandidateTask(insertTask: InsertCandidateTask): Promise<CandidateTask> {
    const payload: InsertCandidateTask = {
      ...insertTask,
      dueAt: insertTask.dueAt ? ensureDate(insertTask.dueAt) : null,
    };

    const [task] = await this.db
      .insert(candidateTasks)
      .values(payload)
      .returning();
    return task;
  }

  async updateCandidateTask(id: string, data: Partial<CandidateTask>): Promise<CandidateTask | undefined> {
    const update: Partial<CandidateTask> = { ...data };
    if (Object.prototype.hasOwnProperty.call(update, 'dueAt')) {
      update.dueAt = update.dueAt ? ensureDate(update.dueAt) : null;
    }

    const [task] = await this.db
      .update(candidateTasks)
      .set({ ...update, updatedAt: new Date() })
      .where(and(eq(candidateTasks.id, id), eq(candidateTasks.archived, false)))
      .returning();
    return task || undefined;
  }

  async deleteCandidateTask(id: string): Promise<void> {
    await this.db
      .update(candidateTasks)
      .set({ deletedAt: new Date() })
      .where(eq(candidateTasks.id, id));
  }

  async archiveCandidateTask(id: string): Promise<void> {
    await this.db
      .update(candidateTasks)
      .set({ archived: true, updatedAt: new Date() })
      .where(eq(candidateTasks.id, id));
  }

  async resolveCandidateSelfAssignments(candidateId: string, userId: string): Promise<TemplateExpansionTask[]> {
    const now = new Date();
    const rows = await this.db
      .update(candidateTasks)
      .set({
        assigneeKind: 'user',
        assigneeUserId: userId,
        assigneeRole: null,
        assigneeResolvedAt: now,
        updatedAt: now,
      })
      .where(and(
        eq(candidateTasks.candidateId, candidateId),
        eq(candidateTasks.assigneeKind, 'role'),
        eq(candidateTasks.assigneeRole, 'candidate.self'),
        eq(candidateTasks.archived, false)
      ))
      .returning({
        id: candidateTasks.id,
        candidateId: candidateTasks.candidateId,
        assigneeUserId: candidateTasks.assigneeUserId,
        assigneeKind: candidateTasks.assigneeKind,
        assigneeRole: candidateTasks.assigneeRole,
        title: candidateTasks.title,
        status: candidateTasks.status,
        dueAt: candidateTasks.dueAt,
        pendingAnchor: candidateTasks.pendingAnchor,
      });

    return rows;
  }

  async getCandidateStageHistory(candidateId: string): Promise<any[]> {
    const fromStages = alias(hiringStages, 'from_hs');
    const rows = await this.db
      .select({
        id: candidateStageHistory.id,
        changedAt: candidateStageHistory.changedAt,
        createdAt: candidateStageHistory.createdAt,
        stage: {
          id: hiringStages.id,
          name: hiringStages.name,
          orderIndex: hiringStages.orderIndex
        },
        fromStage: {
          id: fromStages.id,
          name: fromStages.name,
          orderIndex: fromStages.orderIndex
        },
        changedBy: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName
        }
      })
      .from(candidateStageHistory)
      .leftJoin(hiringStages, eq(candidateStageHistory.toStageId, hiringStages.id))
      .leftJoin(fromStages, eq(candidateStageHistory.fromStageId, fromStages.id))
      .leftJoin(users, eq(candidateStageHistory.changedBy, users.id))
      .where(eq(candidateStageHistory.candidateId, candidateId))
      .orderBy(asc(candidateStageHistory.changedAt), asc(hiringStages.orderIndex), asc(candidateStageHistory.createdAt));

    return rows;
  }

  async getTemplates(): Promise<Template[]> {
    return await this.db.select().from(templates).where(eq(templates.archived, false));
  }

  async getTemplate(id: string): Promise<Template | undefined> {
    const [template] = await this.db.select().from(templates).where(eq(templates.id, id));
    return template || undefined;
  }

  async createTemplate(insertTemplate: InsertTemplate, cloneFromTemplateId?: string): Promise<Template> {
    const [template] = await this.db
      .insert(templates)
      .values(insertTemplate)
      .returning();
    
    // If cloning from another template, copy its template stages and tasks
    if (cloneFromTemplateId) {
      // First, copy template stages
      const sourceStages = await this.db
        .select()
        .from(templateStages)
        .where(and(
          eq(templateStages.templateId, cloneFromTemplateId),
          eq(templateStages.isActive, true)
        ))
        .orderBy(asc(templateStages.orderIndex));

      const stageIdMap = new Map<string, string>();
      if (sourceStages.length > 0) {
        const stagesToClone = sourceStages.map(stage => ({
          templateId: template.id,
          stageId: stage.stageId,
          orderIndex: stage.orderIndex,
          isActive: true,
          phase: stage.phase ?? 'pre_hire'
        }));

        const clonedStages = await this.db
          .insert(templateStages)
          .values(stagesToClone)
          .returning({ id: templateStages.id });

        clonedStages.forEach((clonedStage, index) => {
          const sourceStage = sourceStages[index];
          if (sourceStage?.id && clonedStage?.id) {
            stageIdMap.set(sourceStage.id, clonedStage.id);
          }
        });
      }

      // Then copy template tasks (now stage IDs will be valid)
      const sourceTasks = await this.db
        .select()
        .from(templateTasks)
        .where(and(
          eq(templateTasks.templateId, cloneFromTemplateId),
          eq(templateTasks.archived, false)
        ));

      if (sourceTasks.length > 0) {
        const tasksToClone = sourceTasks.map(task => {
          const mappedTemplateStageId = stageIdMap.get(task.templateStageId ?? "");
          if (!mappedTemplateStageId) {
            throw new Error("Failed to map template stage while cloning template tasks");
          }
          return {
            templateId: template.id,
            taskDefId: task.taskDefId,
            stageId: task.stageId,
            templateStageId: mappedTemplateStageId,
            dueRuleType: task.dueRuleType,
            dueRuleValue: task.dueRuleValue,
            fixedDate: task.fixedDate,
            defaultAssigneeKind: task.defaultAssigneeKind ?? 'user',
            defaultAssigneeUserId: task.defaultAssigneeUserId,
            defaultAssigneeRole: task.defaultAssigneeRole,
            defaultPriorityId: task.defaultPriorityId,
            defaultCategoryId: task.defaultCategoryId,
            archived: false
          };
        });

        await this.db.insert(templateTasks).values(tasksToClone);
      }
    }
    
    return template;
  }

  async updateTemplate(id: string, data: Partial<Template>): Promise<Template | undefined> {
    const [template] = await this.db
      .update(templates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(templates.id, id))
      .returning();
    return template || undefined;
  }

  async getTaskDefinitions(): Promise<TaskDefinition[]> {
    return await this.db.select().from(taskDefinitions).orderBy(asc(taskDefinitions.name));
  }

  async getTaskDefinition(id: string): Promise<TaskDefinition | undefined> {
    const [taskDef] = await this.db.select().from(taskDefinitions).where(eq(taskDefinitions.id, id));
    return taskDef || undefined;
  }

  async createTaskDefinition(insertTaskDef: InsertTaskDefinition): Promise<TaskDefinition> {
    const [taskDef] = await this.db
      .insert(taskDefinitions)
      .values(insertTaskDef)
      .returning();
    return taskDef;
  }

  async updateTaskDefinition(id: string, data: Partial<TaskDefinition>): Promise<TaskDefinition | undefined> {
    const [taskDef] = await this.db
      .update(taskDefinitions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(taskDefinitions.id, id))
      .returning();
    return taskDef || undefined;
  }

  async getDepartments(includeArchived: boolean = false): Promise<Department[]> {
    if (includeArchived) {
      return await this.db.select().from(departments);
    }
    return await this.db.select().from(departments).where(eq(departments.archived, false));
  }

  async getDivisions(departmentId?: string, includeArchived: boolean = false): Promise<Division[]> {
    const whereConditions = [];
    
    if (departmentId) {
      whereConditions.push(eq(divisions.departmentId, departmentId));
    }
    
    if (!includeArchived) {
      whereConditions.push(eq(divisions.archived, false));
    }
    
    if (whereConditions.length > 0) {
      return await this.db.select().from(divisions).where(and(...whereConditions));
    }
    
    return await this.db.select().from(divisions);
  }

  async getDivisionsByDepartment(
    departmentId: string, 
    searchQuery?: string, 
    limit: number = 20, 
    offset: number = 0
  ): Promise<Division[]> {
    let whereConditions = [
      eq(divisions.archived, false),
      eq(divisions.departmentId, departmentId)
    ];

    if (searchQuery) {
      whereConditions.push(ilike(divisions.name, `%${searchQuery}%`));
    }

    return await this.db
      .select()
      .from(divisions)
      .where(and(...whereConditions))
      .orderBy(divisions.name)
      .limit(limit)
      .offset(offset);
  }

  async getManagersByDepartment(
    departmentId: string,
    divisionId?: string,
    searchQuery?: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<Array<{ id: string; name: string; email: string; role: string }>> {
    // Only return users with the manager role
    const allowedRoles = ['manager'];
    
    let whereConditions = [
      eq(users.active, true),
      inArray(users.role, allowedRoles as any[])
    ];
    
    // Add department/division filtering
    if (divisionId) {
      whereConditions.push(eq(users.divisionId, divisionId));
    } else {
      whereConditions.push(eq(users.departmentId, departmentId));
    }
    
    // Add search filtering
    if (searchQuery) {
      whereConditions.push(
        or(
          ilike(users.firstName, `%${searchQuery}%`),
          ilike(users.lastName, `%${searchQuery}%`),
          ilike(users.email, `%${searchQuery}%`)
        )!
      );
    }
    
    return await this.db
      .select({
        id: users.id,
        name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
        email: users.email,
        role: users.role,
        mentionKey: users.mentionKey
      })
      .from(users)
      .where(and(...whereConditions))
      .orderBy(users.role, users.firstName, users.lastName)
      .limit(limit)
      .offset(offset);
  }

  async createDepartment(insertDept: InsertDepartment): Promise<Department> {
    const [dept] = await this.db
      .insert(departments)
      .values(insertDept)
      .returning();
    return dept;
  }

  async createDivision(insertDiv: InsertDivision): Promise<Division> {
    const [div] = await this.db
      .insert(divisions)
      .values(insertDiv)
      .returning();
    return div;
  }

  async updateDepartment(id: string, data: Partial<Department>): Promise<Department | undefined> {
    const [dept] = await this.db
      .update(departments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(departments.id, id))
      .returning();
    return dept || undefined;
  }

  async updateDivision(id: string, data: Partial<Division>): Promise<Division | undefined> {
    const [div] = await this.db
      .update(divisions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(divisions.id, id))
      .returning();
    return div || undefined;
  }

  async getHiringStages(): Promise<HiringStage[]> {
    // DISPLAY ONLY: This ordering is for admin UI and selectors only, 
    // NOT for template or candidate business logic
    return await this.db.select().from(hiringStages).orderBy(asc(hiringStages.orderIndex));
  }

  async createHiringStage(insertStage: InsertHiringStage): Promise<HiringStage> {
    // If no orderIndex provided, set it to the next available value
    if (!insertStage.orderIndex) {
      const maxOrderQuery = await this.db
        .select({ maxOrder: sql<number>`max(${hiringStages.orderIndex})` })
        .from(hiringStages);
      const maxOrder = maxOrderQuery[0]?.maxOrder || 0;
      insertStage.orderIndex = maxOrder + 1;
    }

    const [stage] = await this.db
      .insert(hiringStages)
      .values(insertStage)
      .returning();
    return stage;
  }

  async updateHiringStage(id: string, data: Partial<HiringStage>): Promise<HiringStage | undefined> {
    const [stage] = await this.db
      .update(hiringStages)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(hiringStages.id, id))
      .returning();
    return stage || undefined;
  }

  async deleteHiringStage(id: string): Promise<void> {
    // Soft delete by setting isActive to false
    await this.db
      .update(hiringStages)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(hiringStages.id, id));
  }

  async getTaskCategories(): Promise<TaskCategory[]> {
    return await this.db.select().from(taskCategories).orderBy(asc(taskCategories.name));
  }

  async getCandidateTypes(): Promise<CandidateType[]> {
    return await this.db.select().from(candidateTypes).orderBy(asc(candidateTypes.name));
  }

  async getFacultyRanks(): Promise<FacultyRank[]> {
    return await this.db.select().from(facultyRanks).orderBy(asc(facultyRanks.name));
  }

  async getUsers(): Promise<User[]> {
    return await this.db.select().from(users).where(eq(users.active, true)).orderBy(asc(users.firstName), asc(users.lastName));
  }

  // Template Tasks methods
  async getTemplateTasks(templateId: string): Promise<TemplateTask[]> {
    return await this.db
      .select()
      .from(templateTasks)
      .where(and(
        eq(templateTasks.templateId, templateId),
        eq(templateTasks.archived, false)
      ))
      .orderBy(asc(templateTasks.createdAt));
  }

  async getTemplateTask(id: string): Promise<TemplateTask | undefined> {
    const [task] = await this.db.select().from(templateTasks).where(eq(templateTasks.id, id));
    return task || undefined;
  }

  async createTemplateTask(insertTask: InsertTemplateTask): Promise<TemplateTask> {
    let templateStageId = insertTask.templateStageId;
    if (!templateStageId) {
      const [stage] = await this.db
        .select({ id: templateStages.id })
        .from(templateStages)
        .where(and(
          eq(templateStages.templateId, insertTask.templateId),
          eq(templateStages.stageId, insertTask.stageId),
          eq(templateStages.isActive, true)
        ));
      if (!stage) {
        throw new Error("Template stage not found for task creation");
      }
      templateStageId = stage.id;
    }

    const [task] = await this.db
      .insert(templateTasks)
      .values({ ...insertTask, templateStageId })
      .returning();
    return task;
  }

  async updateTemplateTask(id: string, data: Partial<TemplateTask>): Promise<TemplateTask | undefined> {
    let updateData: Partial<TemplateTask> = { ...data };

    if (data.stageId && !data.templateStageId) {
      const existing = await this.getTemplateTask(id);
      const templateId = existing?.templateId ?? data.templateId;
      if (!templateId) {
        throw new Error("Template context required to update task stage");
      }

      const [stage] = await this.db
        .select({ id: templateStages.id })
        .from(templateStages)
        .where(and(
          eq(templateStages.templateId, templateId),
          eq(templateStages.stageId, data.stageId),
          eq(templateStages.isActive, true)
        ));
      if (!stage) {
        throw new Error("Template stage not found for task stage update");
      }
      updateData = { ...updateData, templateStageId: stage.id };
    }

    const [task] = await this.db
      .update(templateTasks)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(templateTasks.id, id))
      .returning();
    return task || undefined;
  }

  async archiveTemplateTask(id: string): Promise<void> {
    // For template tasks, we actually delete them rather than just archive
    // This allows the database trigger to auto-remove empty stages
    await this.db
      .delete(templateTasks)
      .where(eq(templateTasks.id, id));
  }

  // Template Stages methods
  async getTemplateStages(templateId: string): Promise<TemplateStage[]> {
    return await this.db
      .select()
      .from(templateStages)
      .where(and(
        eq(templateStages.templateId, templateId),
        eq(templateStages.isActive, true)
      ))
      .orderBy(asc(templateStages.orderIndex));
  }

  async getTemplateStage(id: string): Promise<TemplateStage | undefined> {
    const [stage] = await this.db.select().from(templateStages).where(eq(templateStages.id, id));
    return stage || undefined;
  }

  async createTemplateStage(insertStage: InsertTemplateStage): Promise<TemplateStage> {
    // (a) Upsert the stage using the exact SQL from requirements
    await this.db.execute(sql`
      INSERT INTO template_stages (template_id, stage_id, order_index, is_active, phase, created_at, updated_at)
      VALUES (${insertStage.templateId}, ${insertStage.stageId}, COALESCE(${insertStage.orderIndex || 0}, 0), TRUE, ${insertStage.phase ?? 'pre_hire'}, now(), now())
      ON CONFLICT (template_id, stage_id)
      DO UPDATE SET
        is_active   = TRUE,
        order_index = COALESCE(EXCLUDED.order_index, template_stages.order_index),
        phase       = EXCLUDED.phase,
        updated_at  = now()
    `);

    // (b) If this template now has exactly 1 active stage, auto-activate template
    const result = await this.db.execute(sql`
      WITH s AS (
        SELECT COUNT(*) AS cnt
        FROM template_stages
        WHERE template_id = ${insertStage.templateId} AND is_active = TRUE
      )
      UPDATE templates t
      SET is_active = TRUE, updated_at = now()
      FROM s
      WHERE t.id = ${insertStage.templateId}
        AND s.cnt = 1
        AND t.is_active = FALSE
      RETURNING t.id, t.is_active
    `);

    // Log for debugging
    if (result.rowCount && result.rowCount > 0) {
      console.log(`Auto-activated template ${insertStage.templateId}`);
    }

    // Return the created/updated stage
    const [stage] = await this.db
      .select()
      .from(templateStages)
      .where(and(
        eq(templateStages.templateId, insertStage.templateId),
        eq(templateStages.stageId, insertStage.stageId)
      ));
    
    return stage;
  }

  async updateTemplateStage(id: string, data: Partial<TemplateStage>): Promise<TemplateStage | undefined> {
    const [stage] = await this.db
      .update(templateStages)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(templateStages.id, id))
      .returning();
    return stage || undefined;
  }

  async deleteTemplateStage(id: string): Promise<void> {
    await this.db
      .update(templateStages)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(templateStages.id, id));
  }

  async reorderTemplateStages(templateId: string, stageIdsInOrder: string[]): Promise<void> {
    await this.db.transaction(async (trx) => {
      // First, validate that all stages belong to this template and are active
      const existingStages = await trx
        .select({ stageId: templateStages.stageId })
        .from(templateStages)
        .where(and(
          eq(templateStages.templateId, templateId),
          eq(templateStages.isActive, true)
        ));
      
      const existingStageIds = existingStages.map(s => s.stageId);
      
      // Check that the count matches
      if (stageIdsInOrder.length !== existingStageIds.length) {
        throw new Error(`stage count mismatch: expected ${existingStageIds.length}, got ${stageIdsInOrder.length}`);
      }
      
      // Check that all provided stages exist in the template
      for (const stageId of stageIdsInOrder) {
        if (!existingStageIds.includes(stageId)) {
          throw new Error(`Invalid stage ${stageId} for template ${templateId}`);
        }
      }
      
      // Update each stage with its new order index
      for (let i = 0; i < stageIdsInOrder.length; i++) {
        await trx
          .update(templateStages)
          .set({ 
            orderIndex: i + 1, 
            updatedAt: new Date() 
          })
          .where(and(
            eq(templateStages.templateId, templateId),
            eq(templateStages.stageId, stageIdsInOrder[i])
          ));
      }
    });
  }

  // Candidate Template Stages methods
  async getCandidateTemplateStages(candidateId: string): Promise<CandidateTemplateStage[]> {
    try {
      return await this.db
        .select()
        .from(candidateTemplateStages)
        .where(eq(candidateTemplateStages.candidateId, candidateId))
        .orderBy(asc(candidateTemplateStages.orderIndex));
    } catch (error) {
      console.warn(`Error fetching candidate template stages for ${candidateId}:`, error);
      // Return empty array instead of throwing to maintain API resilience
      return [];
    }
  }

  async createCandidateTemplateStage(stage: InsertCandidateTemplateStage): Promise<CandidateTemplateStage> {
    const [created] = await this.db
      .insert(candidateTemplateStages)
      .values(stage)
      .returning();
    return created;
  }

  async upsertCandidateTemplateStages(candidateId: string, stages: InsertCandidateTemplateStage[]): Promise<void> {
    // Use UPSERT to handle conflicts
    for (const stage of stages) {
      await this.db
        .insert(candidateTemplateStages)
        .values(stage)
        .onConflictDoUpdate({
          target: [candidateTemplateStages.candidateId, candidateTemplateStages.stageId],
          set: {
            stageNameSnapshot: stage.stageNameSnapshot,
            orderIndex: stage.orderIndex,
            updatedAt: new Date()
          }
        });
    }
  }

  async getCandidateFollowers(candidateId: string): Promise<CandidateFollower[]> {
    return await this.db
      .select()
      .from(candidateFollowers)
      .where(eq(candidateFollowers.candidateId, candidateId));
  }

  async addCandidateFollower(candidateId: string, userId: string): Promise<void> {
    await this.db
      .insert(candidateFollowers)
      .values({ candidateId, userId })
      .onConflictDoNothing();
  }

  async removeCandidateFollower(candidateId: string, userId: string): Promise<void> {
    await this.db
      .delete(candidateFollowers)
      .where(and(eq(candidateFollowers.candidateId, candidateId), eq(candidateFollowers.userId, userId)));
  }

  async getNotifications(params: { userId: string; limit?: number; cursor?: string; unreadOnly?: boolean; types?: string[] }): Promise<{ items: Notification[]; nextCursor?: string; unreadCount: number; totalCount: number }> {
    const { userId, limit = 20, cursor, unreadOnly = false, types } = params;
    const cursorObj = this.decodeCursor(cursor);

    const baseCondition = eq(notifications.userId, userId);
    const appliedConditions = [baseCondition];

    const unreadCondition = unreadOnly ? eq(notifications.isRead, false) : undefined;
    if (unreadCondition) {
      appliedConditions.push(unreadCondition);
    }

    const typesCondition = types && types.length > 0 ? inArray(notifications.type, types) : undefined;
    if (typesCondition) {
      appliedConditions.push(typesCondition);
    }

    const baseWhere = appliedConditions.reduce((acc, condition) => acc ? and(acc, condition)! : condition)!;
    const cursorCondition = cursorObj
      ? or(
          lt(notifications.createdAt, cursorObj.createdAt),
          and(
            eq(notifications.createdAt, cursorObj.createdAt),
            lt(notifications.id, cursorObj.id)
          )
        )
      : undefined;

    const whereClause = cursorCondition ? and(baseWhere, cursorCondition)! : baseWhere;

    const totalResult = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(baseWhere);

    const rows = await this.db
      .select()
      .from(notifications)
      .where(whereClause)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit + 1);

    const items = rows.slice(0, limit);
    const nextCursor = items.length === limit
      ? this.encodeCursor({ createdAt: items[items.length - 1].createdAt as Date, id: items[items.length - 1].id })
      : undefined;

    const unreadResult = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

    const unreadCount = unreadResult[0]?.count ?? 0;
    const totalCount = totalResult[0]?.count ?? 0;

    return { items: items as Notification[], nextCursor, unreadCount, totalCount };
  }

  async setNotificationRead(userId: string, notificationId: string, isRead: boolean): Promise<boolean> {
    const [updated] = await this.db
      .update(notifications)
      .set({
        isRead,
        readAt: isRead ? new Date() : null
      })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
      .returning({ id: notifications.id });

    return !!updated;
  }

  async markAllNotificationsRead(userId: string): Promise<number> {
    const now = new Date();
    const result = await this.db
      .update(notifications)
      .set({ isRead: true, readAt: now })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
      .returning({ id: notifications.id });

    return result.length;
  }

  async deleteReadNotificationsBefore(cutoff: Date, batchSize: number): Promise<number> {
    const candidates = await this.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(isNotNull(notifications.readAt), lte(notifications.readAt, cutoff)))
      .limit(batchSize);

    if (candidates.length === 0) return 0;

    const deleted = await this.db
      .delete(notifications)
      .where(inArray(notifications.id, candidates.map((row) => row.id)))
      .returning({ id: notifications.id });

    return deleted.length;
  }

  async archiveTemplate(id: string): Promise<void> {
    const result = await this.db
      .update(templates)
      .set({ archived: true, isActive: false, updatedAt: new Date() })
      .where(and(eq(templates.id, id), eq(templates.archived, false)))
      .returning({ id: templates.id });
    
    if (result.length === 0) {
      throw new Error("Template not found or already archived");
    }
  }

  async getTemplateReadiness(id: string): Promise<{ active_stage_count: number }> {
    const [result] = await this.db
      .select({
        active_stage_count: sql<number>`COUNT(${templateStages.id}) FILTER (WHERE ${templateStages.isActive} = true)`
      })
      .from(templates)
      .leftJoin(templateStages, eq(templateStages.templateId, templates.id))
      .where(eq(templates.id, id))
      .groupBy(templates.id);
    
    return result || { active_stage_count: 0 };
  }

  async getTaskPriorities(): Promise<TaskPriority[]> {
    return await this.db.select().from(taskPriorities).orderBy(asc(taskPriorities.name));
  }

  async expandTemplate(templateId: string, candidateId: string, currentUserId: string): Promise<TemplateExpansionResult> {
    // Get the candidate
    const candidate = await this.getCandidate(candidateId);
    if (!candidate) {
      throw new Error("Candidate not found");
    }

    if (candidate.templateLocked) {
      throw new Error("Candidate already has a template applied");
    }

    // Check if candidate has existing tasks
    const existingTasks = await this.getCandidateTasks({ candidateId });
    if (existingTasks.length > 0) {
      throw new Error("Candidate already has tasks. Cannot apply template.");
    }

    // Get the template
    const template = await this.getTemplate(templateId);
    if (!template) {
      throw new Error("Template not found");
    }
    if (!template.isActive) {
      throw new Error("Template is not active");
    }

    const templateStagesList = await this.getTemplateStages(templateId);
    const templateStageMap = new Map<string, TemplateStage>();
    for (const stage of templateStagesList) {
      templateStageMap.set(stage.id, stage);
    }

    // Get template tasks
    const templateTasksList = await this.getTemplateTasks(templateId);
    if (templateTasksList.length === 0) {
      throw new Error("Template has no tasks defined");
    }

    // Get task definitions for all template tasks
    const taskDefs = await Promise.all(
      templateTasksList.map(tt => this.getTaskDefinition(tt.taskDefId))
    );

    const anchors: AnchorDates = {
      loo: resolveLooAnchor(candidate),
      start: resolveStartAnchor(candidate),
    };

    // Calculate due dates and create candidate tasks
    const tasksToCreate: InsertCandidateTask[] = [];
    const taskCategoriesList = await this.getTaskCategories();
    const fallbackCategoryId = taskCategoriesList[0]?.id ?? null;

    if (!fallbackCategoryId && templateTasksList.some(task => !task.defaultCategoryId)) {
      throw new Error("No default task category configured");
    }

    for (let i = 0; i < templateTasksList.length; i++) {
      const templateTask = templateTasksList[i];
      const taskDef = taskDefs[i];
      const templateStage = templateStageMap.get(templateTask.templateStageId ?? "");
      if (!templateStage) {
        throw new Error(`Template stage missing for task ${templateTask.id}`);
      }
      
      if (!taskDef) continue;

      const dueComputation = computeDueFromRule(
        templateTask.dueRuleType,
        templateTask.dueRuleValue,
        templateTask.fixedDate,
        anchors
      );

      // Get default priority name
      let priority = "medium";
      if (templateTask.defaultPriorityId) {
        const priorityRecord = await this.db
          .select()
          .from(taskPriorities)
          .where(eq(taskPriorities.id, templateTask.defaultPriorityId));
        if (priorityRecord[0]) {
          priority = priorityRecord[0].name;
        }
      }

      let defaultAssigneeKind = templateTask.defaultAssigneeKind ?? 'user';
      let defaultAssigneeUserId = defaultAssigneeKind === 'user'
        ? templateTask.defaultAssigneeUserId ?? null
        : null;
      let defaultAssigneeRole = defaultAssigneeKind === 'role'
        ? templateTask.defaultAssigneeRole ?? null
        : null;

      // Special role resolution: candidate.self resolves to linked user at apply time
      // If the template assigns to candidate.self and the candidate already has a linked user,
      // resolve immediately to that user and mark as resolved.
      let resolvedAt: Date | null = null;
      if (defaultAssigneeKind === 'role' && defaultAssigneeRole === 'candidate.self') {
        if (candidate.linkedUserId) {
          defaultAssigneeUserId = candidate.linkedUserId;
          defaultAssigneeRole = null;
          defaultAssigneeKind = 'user';
          resolvedAt = new Date();
        }
      } else if (defaultAssigneeKind === 'user' && defaultAssigneeUserId) {
        resolvedAt = new Date();
      }

      tasksToCreate.push({
        candidateId,
        taskDefId: templateTask.taskDefId,
        title: taskDef.name,
        description: taskDef.description,
        stageId: templateTask.stageId,
        templateStageId: templateTask.templateStageId,
        phaseSnapshot: templateStage.phase ?? null,
        assigneeKind: defaultAssigneeKind,
        assigneeUserId: defaultAssigneeUserId,
        assigneeRole: defaultAssigneeRole,
        assigneeResolvedAt: resolvedAt,
        priority: priority as "low" | "medium" | "high" | "critical",
        categoryId: templateTask.defaultCategoryId || fallbackCategoryId,
        dueAt: dueComputation.dueAt,
        dueRuleType: templateTask.dueRuleType,
        dueRuleValue: templateTask.dueRuleValue ?? null,
        fixedDate: templateTask.fixedDate ?? null,
        pendingAnchor: dueComputation.pendingAnchor,
        status: "todo" as const,
        required: (templateTask as any).isRequired ?? true,
        archived: false,
        dueSoonNotifiedAt: null
      });
    }

    // Create all tasks first
    let createdTasks: TemplateExpansionTask[] = [];
    if (tasksToCreate.length > 0) {
      createdTasks = await this.db
        .insert(candidateTasks)
        .values(tasksToCreate)
        .returning({
          id: candidateTasks.id,
          candidateId: candidateTasks.candidateId,
          assigneeUserId: candidateTasks.assigneeUserId,
          assigneeKind: candidateTasks.assigneeKind,
          assigneeRole: candidateTasks.assigneeRole,
          title: candidateTasks.title,
          status: candidateTasks.status,
          dueAt: candidateTasks.dueAt,
          pendingAnchor: candidateTasks.pendingAnchor,
        });
    }

    // Snapshot the template's stage sequence using SQL for efficiency
    await this.db.execute(sql`
      WITH ts AS (
        SELECT ts.stage_id, hs.name AS stage_name, ts.order_index
        FROM template_stages ts
        JOIN hiring_stages hs ON hs.id = ts.stage_id
        WHERE ts.template_id = ${templateId} AND ts.is_active = TRUE
        ORDER BY ts.order_index
      )
      INSERT INTO candidate_template_stages (candidate_id, stage_id, stage_name_snapshot, order_index)
      SELECT ${candidateId}, stage_id, stage_name, order_index FROM ts
      ON CONFLICT (candidate_id, stage_id) DO UPDATE
      SET stage_name_snapshot = EXCLUDED.stage_name_snapshot,
          order_index         = EXCLUDED.order_index,
          updated_at          = now()
    `);

    // Update candidate_tasks with stage_order_index for fast sorting
    await this.db.execute(sql`
      UPDATE candidate_tasks ct
      SET stage_order_index = s.order_index
      FROM candidate_template_stages s
      WHERE s.candidate_id = ct.candidate_id AND s.stage_id = ct.stage_id AND ct.candidate_id = ${candidateId}
    `);

    // Get template stages to set initial stage
    const initialStage = templateStagesList.length > 0 ? templateStagesList[0] : null;

    // Update candidate to mark template as applied and set initial stage
    await this.updateCandidate(candidateId, {
      templateAppliedFromId: templateId,
      templateAppliedAt: new Date(),
      templateLocked: true,
      currentStageId: initialStage?.stageId || null,
      templateNameSnapshot: template.name, // Snapshot template name at expansion
      templateVersion: 1 // Version 1 for initial template application
    });

    // Record initial stage history if we have an initial stage
    if (initialStage) {
      await this.db
        .insert(candidateStageHistory)
        .values({
          candidateId: candidateId,
          fromStageId: null,
          toStageId: initialStage.stageId,
          changedAt: new Date(),
          changedBy: currentUserId,
          createdAt: new Date(),
          updatedAt: new Date()
        });
    }

    return { createdCount: tasksToCreate.length, createdTasks };
  }

  async recomputeCandidateDueDates(candidateId: string): Promise<{ updated: number }> {
    const candidate = await this.getCandidate(candidateId);
    if (!candidate) {
      throw new Error("Candidate not found");
    }

    const anchors: AnchorDates = {
      loo: resolveLooAnchor(candidate),
      start: resolveStartAnchor(candidate),
    };

    const tasks = await this.db
      .select({
        id: candidateTasks.id,
        dueRuleType: candidateTasks.dueRuleType,
        dueRuleValue: candidateTasks.dueRuleValue,
        fixedDate: candidateTasks.fixedDate,
        pendingAnchor: candidateTasks.pendingAnchor,
        dueAt: candidateTasks.dueAt,
        archived: candidateTasks.archived,
      })
      .from(candidateTasks)
      .where(eq(candidateTasks.candidateId, candidateId));

    const updates = [] as Array<{ id: string; dueAt: Date | null; pendingAnchor: boolean }>;
    for (const task of tasks) {
      if (task.archived) continue;
      const dueComputation = computeDueFromRule(task.dueRuleType, task.dueRuleValue, task.fixedDate, anchors);
      const currentDueAt = task.dueAt ? new Date(task.dueAt) : null;
      const newDueAt = dueComputation.dueAt;
      const dueChanged = currentDueAt && newDueAt
        ? currentDueAt.getTime() !== newDueAt.getTime()
        : currentDueAt !== newDueAt;
      if (dueChanged || task.pendingAnchor !== dueComputation.pendingAnchor) {
        updates.push({
          id: task.id,
          dueAt: newDueAt,
          pendingAnchor: dueComputation.pendingAnchor,
        });
      }
    }

    if (!updates.length) {
      return { updated: 0 };
    }

    const now = new Date();
    await this.db.transaction(async (tx) => {
      for (const update of updates) {
        await tx
          .update(candidateTasks)
          .set({ dueAt: update.dueAt, pendingAnchor: update.pendingAnchor, updatedAt: now })
          .where(eq(candidateTasks.id, update.id));
      }
    });

    return { updated: updates.length };
  }

  async estimateTemplate(templateId: string, options: { looDate?: string | null; startDate?: string | null; candidateId?: string | null; businessDays?: boolean } = {}): Promise<any> {
    const { looDate, startDate, candidateId, businessDays: includeBusinessDays = false } = options;

    let candidate: Candidate | undefined;
    if ((!looDate || !startDate) && candidateId) {
      candidate = await this.getCandidate(candidateId) ?? undefined;
    }

    const anchors: AnchorDates = {
      loo: ensureDate(looDate ?? candidate?.offerLetterAcceptedAt ?? candidate?.offerLetterIssuedAt ?? null),
      start: ensureDate(startDate ?? candidate?.anticipatedStartDate ?? null),
    };

    const tasksQuery = await this.db
      .select({
        id: templateTasks.id,
        stageId: templateTasks.stageId,
        templateStageId: templateTasks.templateStageId,
        stageName: hiringStages.name,
        stagePhase: templateStages.phase,
        dueRuleType: templateTasks.dueRuleType,
        dueRuleValue: templateTasks.dueRuleValue,
        fixedDate: templateTasks.fixedDate
      })
      .from(templateTasks)
      .innerJoin(templateStages, eq(templateStages.id, templateTasks.templateStageId))
      .innerJoin(hiringStages, eq(templateStages.stageId, hiringStages.id))
      .where(and(
        eq(templateTasks.templateId, templateId),
        eq(templateTasks.archived, false)
      ));

    const baselineCandidates = [anchors.loo, anchors.start].filter((date): date is Date => !!date);
    const baselineDate = baselineCandidates.length
      ? new Date(Math.min(...baselineCandidates.map(date => date.getTime())))
      : null;

    const nonEstimable: Array<{ taskId: string; rule: string | null; reason: string; missingAnchor?: AnchorKey; stageId: string; stageName: string; phase: string | null }>
      = [];
    const perPhaseMap = new Map<string, { phase: string; taskCount: number; lastDueDate: Date | null }>();
    const perStageMap = new Map<string, { stageId: string; stageName: string; phase: string | null; taskCount: number; latestOffsetDays: number; lastDueDate: Date | null }>();

    let maxCalendarOffset = 0;
    let maxDueDate: Date | null = null;

    for (const task of tasksQuery) {
      const phaseKey = task.stagePhase ?? "pre_hire";
      const dueComputation = computeDueFromRule(task.dueRuleType, task.dueRuleValue, task.fixedDate, anchors);

      if (task.dueRuleType === "days_before_stage" || task.dueRuleType === "days_after_stage") {
        nonEstimable.push({
          taskId: task.id,
          rule: task.dueRuleType,
          reason: "stage_relative",
          stageId: task.stageId,
          stageName: task.stageName,
          phase: phaseKey
        });
        continue;
      }

      if (dueComputation.pendingAnchor) {
        nonEstimable.push({
          taskId: task.id,
          rule: task.dueRuleType ?? null,
          reason: "missing_anchor",
          missingAnchor: dueComputation.missingAnchor,
          stageId: task.stageId,
          stageName: task.stageName,
          phase: phaseKey
        });
        continue;
      }

      if (!dueComputation.dueAt) {
        nonEstimable.push({
          taskId: task.id,
          rule: task.dueRuleType ?? null,
          reason: "no_due_date",
          stageId: task.stageId,
          stageName: task.stageName,
          phase: phaseKey
        });
        continue;
      }

      const phaseSummary = perPhaseMap.get(phaseKey) ?? { phase: phaseKey, taskCount: 0, lastDueDate: null };
      phaseSummary.taskCount += 1;
      if (!phaseSummary.lastDueDate || phaseSummary.lastDueDate < dueComputation.dueAt) {
        phaseSummary.lastDueDate = dueComputation.dueAt;
      }
      perPhaseMap.set(phaseKey, phaseSummary);

      const stageSummary = perStageMap.get(task.stageId) ?? {
        stageId: task.stageId,
        stageName: task.stageName,
        phase: phaseKey,
        taskCount: 0,
        latestOffsetDays: 0,
        lastDueDate: null
      };
      stageSummary.taskCount += 1;
      if (!stageSummary.lastDueDate || stageSummary.lastDueDate < dueComputation.dueAt) {
        stageSummary.lastDueDate = dueComputation.dueAt;
      }

      if (baselineDate) {
        const offset = Math.max(0, Math.ceil((dueComputation.dueAt.getTime() - baselineDate.getTime()) / MS_PER_DAY));
        if (offset > stageSummary.latestOffsetDays) {
          stageSummary.latestOffsetDays = offset;
        }
        if (offset > maxCalendarOffset) {
          maxCalendarOffset = offset;
        }
      }

      perStageMap.set(task.stageId, stageSummary);

      if (!maxDueDate || maxDueDate < dueComputation.dueAt) {
        maxDueDate = dueComputation.dueAt;
      }
    }

    const perPhase = Array.from(perPhaseMap.values())
      .sort((a, b) => a.phase.localeCompare(b.phase))
      .map(summary => ({
        phase: summary.phase,
        taskCount: summary.taskCount,
        lastDueDate: summary.lastDueDate ? summary.lastDueDate.toISOString() : null,
      }));

    const perStage = Array.from(perStageMap.values())
      .sort((a, b) => a.latestOffsetDays - b.latestOffsetDays)
      .map(stage => ({
        stageId: stage.stageId,
        stageName: stage.stageName,
        phase: stage.phase,
        taskCount: stage.taskCount,
        latestOffsetDays: stage.latestOffsetDays,
        lastDueDate: stage.lastDueDate ? stage.lastDueDate.toISOString() : null,
      }));

    const formattedNonEstimable = nonEstimable.map(item => ({
      taskId: item.taskId,
      rule: item.rule,
      reason: item.reason,
      missingAnchor: item.missingAnchor ?? null,
      stageId: item.stageId,
      stageName: item.stageName,
      phase: item.phase,
    }));

    let totalBusinessDays: number | null = null;
    if (includeBusinessDays && baselineDate && maxDueDate) {
      totalBusinessDays = countBusinessDays(baselineDate, maxDueDate);
    }

    return {
      templateId,
      taskCount: tasksQuery.length,
      anchors: {
        loo: anchors.loo ? anchors.loo.toISOString() : null,
        start: anchors.start ? anchors.start.toISOString() : null,
      },
      baselineDate: baselineDate ? baselineDate.toISOString() : null,
      lastDueDate: maxDueDate ? maxDueDate.toISOString() : null,
      totalCalendarDays: maxCalendarOffset,
      totalBusinessDays,
      nonEstimable: formattedNonEstimable,
      perPhase,
      perStage,
    };
  }

  // Comments implementation
  async getCandidateComments(params: { candidateId: string; visibility?: 'all'|'internal'|'external'; role: string; cursor?: string; limit?: number }): Promise<{ items: any[]; nextCursor?: string; totalVisibleCount: number }> {
    const { candidateId, visibility = 'all', role, cursor, limit = 20 } = params;
    const { comments, users } = await import("@shared/schemas");
    const cursorObj = this.decodeCursor(cursor);
    const visibilityFilter = role === 'candidate' ? 'external' : visibility;
    const whereParts: any[] = [eq(comments.entityType, 'candidate' as any), eq(comments.entityId, candidateId), eq(comments.isDeleted, false)];
    if (visibilityFilter !== 'all') whereParts.push(eq(comments.visibility, visibilityFilter as any));
    if (cursorObj) whereParts.push(lte(comments.createdAt, cursorObj.createdAt));

    const rows = await this.db
      .select({
        id: comments.id,
        entityType: comments.entityType,
        entityId: comments.entityId,
        body: comments.body,
        visibility: comments.visibility,
        parentId: comments.parentId,
        isDeleted: comments.isDeleted,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
        author: { id: users.id, firstName: users.firstName, lastName: users.lastName }
      })
      .from(comments)
      .leftJoin(users, eq(users.id, comments.authorUserId))
      .where(and(...whereParts))
      .orderBy(desc(comments.createdAt), desc(comments.id))
      .limit(limit + 1);

    const items = rows.slice(0, limit);
    const next = rows.length > limit ? this.encodeCursor({ createdAt: items[items.length - 1].createdAt as any, id: items[items.length - 1].id }) : undefined;

    const countRows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(comments)
      .where(and(
        eq(comments.entityType, 'candidate' as any),
        eq(comments.entityId, candidateId),
        eq(comments.isDeleted, false),
        visibilityFilter === 'all' ? sql`true` : eq(comments.visibility, visibilityFilter as any)
      ));

    return { items, nextCursor: next, totalVisibleCount: countRows[0]?.count || 0 };
  }

  async getTaskComments(params: { taskId: string; visibility?: 'all'|'internal'|'external'; role: string; cursor?: string; limit?: number }): Promise<{ items: any[]; nextCursor?: string; totalVisibleCount: number }> {
    const { taskId, visibility = 'all', role, cursor, limit = 20 } = params;
    const { comments, users } = await import("@shared/schemas");
    const cursorObj = this.decodeCursor(cursor);
    const visibilityFilter = role === 'candidate' ? 'external' : visibility;
    const whereParts: any[] = [eq(comments.entityType, 'task' as any), eq(comments.entityId, taskId), eq(comments.isDeleted, false)];
    if (visibilityFilter !== 'all') whereParts.push(eq(comments.visibility, visibilityFilter as any));
    if (cursorObj) whereParts.push(lte(comments.createdAt, cursorObj.createdAt));

    const rows = await this.db
      .select({
        id: comments.id,
        entityType: comments.entityType,
        entityId: comments.entityId,
        body: comments.body,
        visibility: comments.visibility,
        parentId: comments.parentId,
        isDeleted: comments.isDeleted,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
        author: { id: users.id, firstName: users.firstName, lastName: users.lastName }
      })
      .from(comments)
      .leftJoin(users, eq(users.id, comments.authorUserId))
      .where(and(...whereParts))
      .orderBy(desc(comments.createdAt), desc(comments.id))
      .limit(limit + 1);

    const items = rows.slice(0, limit);
    const next = rows.length > limit ? this.encodeCursor({ createdAt: items[items.length - 1].createdAt as any, id: items[items.length - 1].id }) : undefined;

    const countRows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(comments)
      .where(and(
        eq(comments.entityType, 'task' as any),
        eq(comments.entityId, taskId),
        eq(comments.isDeleted, false),
        visibilityFilter === 'all' ? sql`true` : eq(comments.visibility, visibilityFilter as any)
      ));

    return { items, nextCursor: next, totalVisibleCount: countRows[0]?.count || 0 };
  }

  async createComment(params: { entityType: 'candidate'|'task'; entityId: string; authorUserId: string; role: string; body: string; visibility: 'internal'|'external'; parentId?: string | null }): Promise<any> {
    const { entityType, entityId, authorUserId, role, body, visibility, parentId } = params;
    const { comments, users } = await import("@shared/schemas");
    let finalVisibility = visibility;
    if (role === 'candidate' && visibility === 'internal') {
      throw new Error('Candidates can only create external comments');
    }
    if (parentId) {
      const [parent] = await this.db.select().from(comments).where(eq(comments.id, parentId));
      if (!parent) throw new Error('Parent comment not found');
      finalVisibility = parent.visibility as any;
    }
    const [createdRow] = await this.db
      .insert(comments)
      .values({ entityType: entityType as any, entityId, authorUserId, body, visibility: finalVisibility as any, parentId: parentId || null })
      .returning();
    const [created] = await this.db
      .select({
        id: comments.id,
        entityType: comments.entityType,
        entityId: comments.entityId,
        body: comments.body,
        visibility: comments.visibility,
        parentId: comments.parentId,
        isDeleted: comments.isDeleted,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
        author: { id: users.id, firstName: users.firstName, lastName: users.lastName }
      })
      .from(comments)
      .leftJoin(users, eq(users.id, comments.authorUserId))
      .where(eq(comments.id, createdRow.id));
    return created;
  }

  async editComment(params: { id: string; userId: string; userRole: string; body: string }): Promise<any> {
    const { id, userId, userRole, body } = params;
    const { comments } = await import("@shared/schemas");
    const [existing] = await this.db.select().from(comments).where(eq(comments.id, id));
    if (!existing || existing.isDeleted) throw new Error('Comment not found');
    const now = new Date();
    const createdAt = new Date(existing.createdAt as any);
    const diffMs = now.getTime() - createdAt.getTime();
    const canEdit = (existing.authorUserId === userId && diffMs <= 5 * 60 * 1000) || ['system_admin','hr_staff'].includes(userRole);
    if (!canEdit) throw new Error('Not permitted to edit comment');
    const [updated] = await this.db
      .update(comments)
      .set({ body, updatedAt: new Date() })
      .where(eq(comments.id, id))
      .returning();
    return updated;
  }

  async deleteComment(params: { id: string; userId: string; userRole: string }): Promise<void> {
    const { id, userId, userRole } = params;
    const { comments } = await import("@shared/schemas");
    const [existing] = await this.db.select().from(comments).where(eq(comments.id, id));
    if (!existing || existing.isDeleted) throw new Error('Comment not found');
    const now = new Date();
    const createdAt = new Date(existing.createdAt as any);
    const diffMs = now.getTime() - createdAt.getTime();
    const canDelete = (existing.authorUserId === userId && diffMs <= 5 * 60 * 1000) || ['system_admin','hr_staff'].includes(userRole);
    if (!canDelete) throw new Error('Not permitted to delete comment');
    // Soft-delete the target comment and any direct replies
    await this.db
      .update(comments)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(or(eq(comments.id, id), eq(comments.parentId, id)));
  }

  async getCommentStats(params: { candidateId: string; role: string }): Promise<{ profile: { internalCount: number; externalCount: number; totalVisible: number }; byTask: Record<string, { internalCount: number; externalCount: number; totalVisible: number }> }> {
    const { candidateId, role } = params;
    const { comments, candidateTasks } = await import("@shared/schemas");
    const visibleSet = role === 'candidate' ? ['external'] : ['internal','external'];

    const profileCounts = await this.db
      .select({ visibility: comments.visibility, count: sql<number>`count(*)::int` })
      .from(comments)
      .where(and(eq(comments.entityType, 'candidate' as any), eq(comments.entityId, candidateId), eq(comments.isDeleted, false), inArray(comments.visibility, visibleSet as any)))
      .groupBy(comments.visibility);
    const profile = { internalCount: 0, externalCount: 0, totalVisible: 0 };
    for (const row of profileCounts) {
      if ((row.visibility as any) === 'internal') profile.internalCount = row.count;
      if ((row.visibility as any) === 'external') profile.externalCount = row.count;
    }
    profile.totalVisible = profile.internalCount + profile.externalCount;

    const taskIdsRows = await this.db
      .select({ id: candidateTasks.id })
      .from(candidateTasks)
      .where(eq(candidateTasks.candidateId, candidateId));
    const taskIds = taskIdsRows.map(r => r.id);
    const byTask: Record<string, { internalCount: number; externalCount: number; totalVisible: number }> = {};
    if (taskIds.length > 0) {
      const taskCounts = await this.db
        .select({ entityId: comments.entityId, visibility: comments.visibility, count: sql<number>`count(*)::int` })
        .from(comments)
        .where(and(eq(comments.entityType, 'task' as any), inArray(comments.entityId, taskIds), eq(comments.isDeleted, false), inArray(comments.visibility, visibleSet as any)))
        .groupBy(comments.entityId, comments.visibility);
      for (const row of taskCounts) {
        const id = row.entityId as string;
        if (!byTask[id]) byTask[id] = { internalCount: 0, externalCount: 0, totalVisible: 0 };
        if ((row.visibility as any) === 'internal') byTask[id].internalCount = row.count;
        if ((row.visibility as any) === 'external') byTask[id].externalCount = row.count;
      }
      for (const id of Object.keys(byTask)) {
        byTask[id].totalVisible = byTask[id].internalCount + byTask[id].externalCount;
      }
    }

    return { profile, byTask };
  }

  async estimateCandidate(candidateId: string, businessDays: boolean = false): Promise<any> {
    // Get candidate information including template application date
    const candidate = await this.db
      .select({
        id: candidates.id,
        templateAppliedFromId: candidates.templateAppliedFromId,
        templateAppliedAt: candidates.templateAppliedAt,
        templateLocked: candidates.templateLocked,
        anticipatedStartDate: candidates.anticipatedStartDate,
        currentStageId: candidates.currentStageId
      })
      .from(candidates)
      .where(eq(candidates.id, candidateId))
      .limit(1);

    if (!candidate.length || !candidate[0].templateAppliedFromId) {
      return {
        candidateId,
        error: "No template applied to candidate",
        taskCount: 0,
        totalCalendarDays: 0,
        totalBusinessDays: null,
        remainingTasks: 0,
        completedTasks: 0,
        lastDueDate: null,
        nonEstimable: [],
        perStage: []
      };
    }

    const candidateData = candidate[0];
    const startDate = candidateData.templateAppliedAt || candidateData.anticipatedStartDate;
    
    if (!startDate) {
      return {
        candidateId,
        error: "No anticipated start date available for calculation",
        taskCount: 0,
        totalCalendarDays: 0,
        totalBusinessDays: null,
        remainingTasks: 0,
        completedTasks: 0,
        lastDueDate: null,
        nonEstimable: [],
        perStage: []
      };
    }

    // Get all tasks for this candidate with stage information and completion status
    const tasksQuery = await this.db
      .select({
        id: candidateTasks.id,
        stageId: candidateTasks.stageId,
        stageName: hiringStages.name,
        status: candidateTasks.status,
        dueAt: candidateTasks.dueAt,
        title: taskDefinitions.name
      })
      .from(candidateTasks)
      .innerJoin(hiringStages, eq(candidateTasks.stageId, hiringStages.id))
      .innerJoin(taskDefinitions, eq(candidateTasks.taskDefId, taskDefinitions.id))
      .where(and(
        eq(candidateTasks.candidateId, candidateId),
        eq(candidateTasks.archived, false)
      ));

    const start = new Date(startDate);
    const today = new Date();
    const taskOffsets: any[] = [];
    const nonEstimable: any[] = [];
    const stageMap = new Map<string, { stageId: string; stageName: string; latestOffsetDays: number }>();

    let completedTasks = 0;
    let remainingTasks = 0;
    let maxOffsetDays = 0;

    // Calculate offsets for remaining (incomplete) tasks based on their due dates
    for (const task of tasksQuery) {
      // Treat 'canceled' as non-blocking (equivalent to 'done')
      if (task.status === 'done' || task.status === 'canceled') {
        completedTasks++;
        continue;
      }
      
      remainingTasks++;
      
      if (task.dueAt) {
        const dueDate = new Date(task.dueAt);
        const daysDiff = Math.ceil((dueDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const effectiveOffset = Math.max(daysDiff, 0);

        taskOffsets.push({
          taskId: task.id,
          stageId: task.stageId,
          stageName: task.stageName,
          offset: effectiveOffset,
          title: task.title
        });

        maxOffsetDays = Math.max(maxOffsetDays, effectiveOffset);

        // Track latest offset per stage
        const stageKey = task.stageId;
        if (!stageMap.has(stageKey) || stageMap.get(stageKey)!.latestOffsetDays < effectiveOffset) {
          stageMap.set(stageKey, {
            stageId: task.stageId,
            stageName: task.stageName,
            latestOffsetDays: effectiveOffset
          });
        }
      } else {
        nonEstimable.push({
          taskId: task.id,
          title: task.title,
          stageName: task.stageName,
          reason: "no due date set"
        });
      }
    }

    const perStage = Array.from(stageMap.values()).sort((a, b) => a.latestOffsetDays - b.latestOffsetDays);
    
    let lastDueDate: string | null = null;
    let totalBusinessDays: number | null = null;

    if (maxOffsetDays > 0) {
      const endDate = new Date(start);
      endDate.setDate(endDate.getDate() + maxOffsetDays);
      lastDueDate = endDate.toISOString().split('T')[0];

      if (businessDays) {
        totalBusinessDays = this.countBusinessDays(start, endDate);
      }
    }

    return {
      candidateId,
      taskCount: tasksQuery.length,
      completedTasks,
      remainingTasks,
      lastDueDate,
      totalCalendarDays: maxOffsetDays,
      totalBusinessDays,
      nonEstimable,
      perStage
    };
  }

  // Helper function to count business days (excluding weekends)
  private countBusinessDays(startDate: Date, endDate: Date): number {
    let count = 0;
    const current = new Date(startDate);
    
    while (current <= endDate) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday (0) or Saturday (6)
        count++;
      }
      current.setDate(current.getDate() + 1);
    }
    
    return Math.max(0, count - 1); // Subtract 1 to not count the start date
  }

  // Status transition validation and update logic
  async updateCandidateStatus(
    candidateId: string, 
    newStatus: string, 
    currentUserId: string,
    closeOpenTasks: boolean = false
  ): Promise<{ 
    success: boolean; 
    error?: string; 
    code?: string; 
    remainingTasks?: any[];
    cascaded?: {
      closedTasks: number;
      affectedCandidateStatus: string;
      reopenedTasks?: number;
    }
  }> {
    
    // Get current candidate
    const candidate = await this.getCandidate(candidateId);
    if (!candidate) {
      return { success: false, error: "Candidate not found", code: "CANDIDATE_NOT_FOUND" };
    }

    const currentStatus = candidate.status;
    
    // Define valid transitions
    const validTransitions: Record<string, string[]> = {
      'draft': ['active', 'on_hold', 'canceled', 'archived'],
      'active': ['on_hold', 'completed', 'canceled', 'archived'],
      'on_hold': ['active', 'canceled', 'archived'],
      'completed': ['archived'],
      'canceled': ['archived', 'active'], // Can restore canceled to active
      'archived': ['active'] // Can only restore to active
    };

    // Check if transition is valid
    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      return { 
        success: false, 
        error: `Invalid status transition from ${currentStatus} to ${newStatus}`, 
        code: "INVALID_STATUS_TRANSITION" 
      };
    }

    // Special validation for completed status
    if (newStatus === 'completed') {
      const incompleteRequiredTasks = await this.db
        .select({
          id: candidateTasks.id,
          title: taskDefinitions.name,
          stageName: hiringStages.name
        })
        .from(candidateTasks)
        .innerJoin(taskDefinitions, eq(candidateTasks.taskDefId, taskDefinitions.id))
        .innerJoin(hiringStages, eq(candidateTasks.stageId, hiringStages.id))
        .where(and(
          eq(candidateTasks.candidateId, candidateId),
          eq(candidateTasks.archived, false),
          eq(candidateTasks.required, true),
          and(
            ne(candidateTasks.status, 'done'),
            ne(candidateTasks.status, 'canceled')
          )
        ));

      if (incompleteRequiredTasks.length > 0) {
        return { 
          success: false, 
          error: "Cannot mark candidate as completed with incomplete required tasks", 
          code: "INCOMPLETE_REQUIRED_TASKS",
          remainingTasks: incompleteRequiredTasks
        };
      }
    }

    // Prepare update data
    const updateData: any = {
      status: newStatus,
      updatedBy: currentUserId
    };

    let closedTasksCount = 0;
    let reopenedTasksCount = 0;

    // Handle side effects based on new status
    switch (newStatus) {
      case 'archived':
        updateData.archived = true;
        updateData.archivedAt = new Date();
        updateData.archivedBy = currentUserId;
        break;
        
      case 'active':
        if (currentStatus === 'archived') {
          // Restoring from archived
          updateData.archived = false;
          updateData.archivedAt = null;
          updateData.archivedBy = null;
        }
        if (currentStatus === 'canceled') {
          // Restore previously canceled tasks back to default status
          const reopened = await this.db
            .update(candidateTasks)
            .set({ status: 'todo', updatedAt: new Date(), completedAt: null })
            .where(and(
              eq(candidateTasks.candidateId, candidateId),
              eq(candidateTasks.archived, false),
              eq(candidateTasks.status, 'canceled')
            ))
            .returning({ id: candidateTasks.id });
          reopenedTasksCount = reopened.length;
        }
        break;
        
      case 'canceled':
        // Always close open tasks when candidate is canceled
        const canceledTasks = await this.db
          .update(candidateTasks)
          .set({ 
            status: 'canceled', 
            updatedAt: new Date()
          })
          .where(and(
            eq(candidateTasks.candidateId, candidateId),
            eq(candidateTasks.archived, false),
            inArray(candidateTasks.status, ['todo', 'in_progress', 'blocked'])
          ))
          .returning({ id: candidateTasks.id });
        
        closedTasksCount = canceledTasks.length;
        break;

      case 'completed':
        // Cancel any remaining optional open tasks
        const canceledOptionalTasks = await this.db
          .update(candidateTasks)
          .set({ 
            status: 'canceled', 
            updatedAt: new Date()
          })
          .where(and(
            eq(candidateTasks.candidateId, candidateId),
            eq(candidateTasks.archived, false),
            eq(candidateTasks.required, false),
            inArray(candidateTasks.status, ['todo', 'in_progress', 'blocked'])
          ))
          .returning({ id: candidateTasks.id });
        
        closedTasksCount = canceledOptionalTasks.length;
        break;

      case 'on_hold':
        // No task updates; tasks remain editable
        break;
    }

    // Update the candidate
    const updatedCandidate = await this.updateCandidate(candidateId, updateData);
    
    if (!updatedCandidate) {
      return { success: false, error: "Failed to update candidate", code: "UPDATE_FAILED" };
    }

    return { 
      success: true,
      cascaded: {
        closedTasks: closedTasksCount,
        affectedCandidateStatus: newStatus,
        reopenedTasks: reopenedTasksCount
      }
    };
  }

  // Search methods with trigram similarity
  async searchDepartments(query: string): Promise<{ id: string; name: string; score?: number }[]> {
    const results = await this.db.execute(sql`
      WITH qry AS (
        SELECT nullif(trim(${query}), '') AS q
      )
      SELECT id, name,
             CASE WHEN (SELECT q FROM qry) IS NULL THEN 1.0
                  ELSE GREATEST(similarity(lower(name), lower((SELECT q FROM qry))), 0)
             END AS score
      FROM departments
      WHERE archived = false
        AND (
          (SELECT q FROM qry) IS NULL
          OR name ILIKE '%' || (SELECT q FROM qry) || '%'
          OR similarity(lower(name), lower((SELECT q FROM qry))) > 0.1
        )
      ORDER BY
        CASE WHEN (SELECT q FROM qry) IS NULL THEN 0 ELSE 1 END,
        score DESC,
        name ASC
      LIMIT 20
    `);

    return results.rows.map((r: any) => ({ 
      id: r.id as string, 
      name: r.name as string, 
      score: r.score as number 
    }));
  }

  async searchDivisions(query: string, departmentId?: string): Promise<{ id: string; name: string; departmentId?: string; score?: number }[]> {
    const results = await this.db.execute(sql`
      WITH qry AS (
        SELECT nullif(trim(${query}), '') AS q, ${departmentId || null}::uuid AS dept_id
      )
      SELECT id, name, department_id,
             CASE WHEN (SELECT q FROM qry) IS NULL THEN 1.0
                  ELSE GREATEST(similarity(lower(name), lower((SELECT q FROM qry))), 0)
             END AS score
      FROM divisions
      WHERE archived = false
        AND ((SELECT dept_id FROM qry) IS NULL OR department_id = (SELECT dept_id FROM qry))
        AND (
          (SELECT q FROM qry) IS NULL
          OR name ILIKE '%' || (SELECT q FROM qry) || '%'
          OR similarity(lower(name), lower((SELECT q FROM qry))) > 0.1
        )
      ORDER BY
        CASE WHEN (SELECT q FROM qry) IS NULL THEN 0 ELSE 1 END,
        score DESC,
        name ASC
      LIMIT 20
    `);

    return results.rows.map((r: any) => ({ 
      id: r.id as string, 
      name: r.name as string, 
      departmentId: r.department_id as string | undefined,
      score: r.score as number 
    }));
  }

  async searchUsers(
    query: string,
    options: { role?: string; departmentId?: string; divisionId?: string } = {}
  ): Promise<{ id: string; name: string; email: string; role: string; score?: number }[]> {
    const { role, departmentId, divisionId } = options;
    const results = await this.db.execute(sql`
      WITH params AS (
        SELECT 
          NULLIF(${query}, '')::text AS q, 
          NULLIF(${role || ''}, '')::text AS role,
          NULLIF(${departmentId || ''}, '')::uuid AS department_id,
          NULLIF(${divisionId || ''}, '')::uuid AS division_id
      )
      SELECT u.id,
             u.first_name || ' ' || u.last_name AS name,
             u.email,
             u.role,
             CASE
              WHEN (SELECT q FROM params) IS NULL THEN 1.0
              ELSE GREATEST(similarity(lower(u.first_name || ' ' || u.last_name), lower((SELECT q FROM params))), 0)
             END AS score
      FROM users u, params p
      WHERE u.status = 'active'
        AND (p.role IS NULL OR u.role::text = p.role)
        AND (
          (p.division_id IS NOT NULL AND u.division_id = p.division_id)
          OR (p.division_id IS NULL AND (p.department_id IS NULL OR u.department_id = p.department_id))
        )
        AND (
          p.q IS NULL
          OR u.first_name ILIKE '%' || p.q || '%'
          OR u.last_name ILIKE '%' || p.q || '%'
          OR (u.first_name || ' ' || u.last_name) ILIKE '%' || p.q || '%'
          OR similarity(lower(u.first_name || ' ' || u.last_name), lower(p.q)) > 0.1
        )
      ORDER BY
        CASE WHEN (SELECT q FROM params) IS NULL THEN 0 ELSE 1 END,
        score DESC,
        u.first_name || ' ' || u.last_name ASC
      LIMIT 20
    `);

    return results.rows.map((r: any) => ({ 
      id: r.id as string, 
      name: r.name as string, 
      email: r.email as string, 
      role: r.role as string, 
      score: r.score as number 
    }));
  }

  async getUserPreferences(userId: string): Promise<UserPreferences | undefined> {
    const [preferences] = await this.db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));
    return preferences || undefined;
  }

  async upsertUserPreferences(userId: string, updates: UserPreferencesUpdateInput): Promise<UserPreferences> {
    const now = new Date();
    const existing = await this.getUserPreferences(userId);

    const mergedEventSubscriptions = updates.eventSubscriptions !== undefined
      ? {
        ...USER_PREFERENCES_DEFAULTS.eventSubscriptions,
        ...(existing?.eventSubscriptions ?? {}),
        ...updates.eventSubscriptions,
      }
      : {
        ...USER_PREFERENCES_DEFAULTS.eventSubscriptions,
        ...(existing?.eventSubscriptions ?? {}),
      };

    const resolved = {
      userId,
      mytasksShowArchived: updates.mytasksShowArchived ?? existing?.mytasksShowArchived ?? USER_PREFERENCES_DEFAULTS.mytasksShowArchived,
      mytasksShowCanceled: updates.mytasksShowCanceled ?? existing?.mytasksShowCanceled ?? USER_PREFERENCES_DEFAULTS.mytasksShowCanceled,
      mytasksShowCompleted: updates.mytasksShowCompleted ?? existing?.mytasksShowCompleted ?? USER_PREFERENCES_DEFAULTS.mytasksShowCompleted,
      notifyInApp: updates.notifyInApp ?? existing?.notifyInApp ?? USER_PREFERENCES_DEFAULTS.notifyInApp,
      notifyEmail: updates.notifyEmail ?? existing?.notifyEmail ?? USER_PREFERENCES_DEFAULTS.notifyEmail,
      digestFrequency: updates.digestFrequency ?? existing?.digestFrequency ?? USER_PREFERENCES_DEFAULTS.digestFrequency,
      quietHoursStart: updates.quietHoursStart === undefined ? (existing?.quietHoursStart ?? USER_PREFERENCES_DEFAULTS.quietHoursStart) : updates.quietHoursStart,
      quietHoursEnd: updates.quietHoursEnd === undefined ? (existing?.quietHoursEnd ?? USER_PREFERENCES_DEFAULTS.quietHoursEnd) : updates.quietHoursEnd,
      allowSelfNotifications: updates.allowSelfNotifications ?? existing?.allowSelfNotifications ?? USER_PREFERENCES_DEFAULTS.allowSelfNotifications,
      eventSubscriptions: mergedEventSubscriptions,
    } satisfies typeof userPreferences.$inferInsert;

    const [result] = await this.db
      .insert(userPreferences)
      .values({ ...resolved, updatedAt: now })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: {
          ...resolved,
          updatedAt: now,
        }
      })
      .returning();

    return result;
  }

  // User identity methods for multi-provider authentication

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.username, username));
    return user || undefined;
  }

  async getUserIdentityByProvider(provider: string, externalId: string): Promise<UserIdentity | undefined> {
    const [identity] = await this.db
      .select()
      .from(userIdentities)
      .where(and(
        eq(userIdentities.provider, provider),
        eq(userIdentities.externalId, externalId)
      ));
    return identity || undefined;
  }

  async createUserIdentity(identityData: InsertUserIdentity): Promise<UserIdentity> {
    const [identity] = await this.db
      .insert(userIdentities)
      .values(identityData)
      .returning();
    return identity;
  }

  async updateUserIdentity(id: string, data: Partial<UserIdentity>): Promise<UserIdentity | undefined> {
    const [identity] = await this.db
      .update(userIdentities)
      .set(data)
      .where(eq(userIdentities.id, id))
      .returning();
    return identity || undefined;
  }

  async createInvitation(params: { email: string; roles: string[]; invitedBy?: string | null; token: string; expiresAt: Date; departmentId?: string | null; divisionId?: string | null; firstName?: string | null; lastName?: string | null }): Promise<Invitation> {
    const normalizedEmail = params.email.trim().toLowerCase();
    const usernameLocal = normalizedEmail.includes("@") ? normalizedEmail.split("@")[0] : normalizedEmail;
    const roles = Array.from(new Set(params.roles.map(role => role.trim()).filter(Boolean)));
    const now = new Date();
    const expiresAt = new Date(params.expiresAt);

    return await this.db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(invitations)
        .where(eq(invitations.email, normalizedEmail))
        .limit(1);

      if (existing.length > 0) {
        const [updated] = await tx
          .update(invitations)
          .set({
            email: normalizedEmail,
            username: usernameLocal,
            roles,
            firstName: params.firstName ?? null,
            lastName: params.lastName ?? null,
            token: params.token,
            status: "pending",
            expiresAt,
            consumedAt: null,
            invitedBy: params.invitedBy ?? existing[0].invitedBy ?? null,
            departmentId: params.departmentId ?? null,
            divisionId: params.divisionId ?? null,
            updatedAt: now
          })
          .where(eq(invitations.id, existing[0].id))
          .returning();
        return updated;
      }

      const [created] = await tx
        .insert(invitations)
        .values({
          email: normalizedEmail,
          username: usernameLocal,
          roles,
          firstName: params.firstName ?? null,
          lastName: params.lastName ?? null,
          token: params.token,
          status: "pending",
          expiresAt,
          consumedAt: null,
          invitedBy: params.invitedBy ?? null,
          departmentId: params.departmentId ?? null,
          divisionId: params.divisionId ?? null,
          createdAt: now,
          updatedAt: now
        })
        .returning();
      return created;
    });
  }

  async getInvitationByToken(token: string): Promise<Invitation | null> {
    const [invite] = await this.db
      .select()
      .from(invitations)
      .where(eq(invitations.token, token))
      .limit(1);
    return invite ?? null;
  }

  async consumeInvitation(id: string): Promise<Invitation | null> {
    const [updated] = await this.db
      .update(invitations)
      .set({
        status: "consumed",
        consumedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(invitations.id, id))
      .returning();
    return updated ?? null;
  }

  async findValidPendingInviteForIdentifier(identifier: string): Promise<Invitation | null> {
    const normalized = identifier.trim().toLowerCase();
    const usernameLocal = normalized.includes("@") ? normalized.split("@")[0] : normalized;
    const now = new Date();

    const [invite] = await this.db
      .select()
      .from(invitations)
      .where(and(
        eq(invitations.status, "pending"),
        gt(invitations.expiresAt, now),
        or(
          eq(invitations.email, normalized),
          eq(invitations.username, usernameLocal)
        )
      ))
      .orderBy(desc(invitations.updatedAt))
      .limit(1);

    return invite ?? null;
  }

  async getPendingInvitationsForUsersList(filters?: { role?: string; departmentId?: string; divisionId?: string; search?: string }): Promise<Array<Invitation & { department?: { id: string; name: string } | null; division?: { id: string; name: string } | null }>> {
    const where: any[] = [
      eq(invitations.status, 'pending')
    ];
    if (filters?.role) {
      // roles is text[]; use sql to check
      where.push(sql`$${filters.role} = ANY(${invitations.roles})`);
    }
    if (filters?.departmentId) {
      where.push(eq(invitations.departmentId, filters.departmentId));
    }
    if (filters?.divisionId) {
      where.push(eq(invitations.divisionId, filters.divisionId));
    }
    if (filters?.search) {
      const q = `%${filters.search.toLowerCase()}%`;
      where.push(sql`lower(${invitations.email}) like ${q}`);
    }

    const rows = await this.db
      .select({
        id: invitations.id,
        email: invitations.email,
        username: invitations.username,
        firstName: invitations.firstName,
        lastName: invitations.lastName,
        roles: invitations.roles,
        token: invitations.token,
        status: invitations.status,
        expiresAt: invitations.expiresAt,
        consumedAt: invitations.consumedAt,
        invitedBy: invitations.invitedBy,
        departmentId: invitations.departmentId,
        divisionId: invitations.divisionId,
        createdAt: invitations.createdAt,
        updatedAt: invitations.updatedAt,
        department: {
          id: departments.id,
          name: departments.name
        },
        division: {
          id: divisions.id,
          name: divisions.name
        }
      })
      .from(invitations)
      .leftJoin(departments, eq(invitations.departmentId, departments.id))
      .leftJoin(divisions, eq(invitations.divisionId, divisions.id))
      .where(and(...where))
      .orderBy(desc(invitations.updatedAt));

    return rows as any;
  }

  async getUserIdentities(userId: string): Promise<UserIdentity[]> {
    return await this.db
      .select()
      .from(userIdentities)
      .where(eq(userIdentities.userId, userId))
      .orderBy(userIdentities.createdAt);
  }

  async deleteUserIdentity(id: string): Promise<void> {
    await this.db
      .delete(userIdentities)
      .where(eq(userIdentities.id, id));
  }

  // Auth Providers methods
  async getAllAuthProviders(): Promise<AuthProvider[]> {
    return await this.db
      .select()
      .from(authProviders)
      .orderBy(authProviders.id);
  }

  async getAuthProvider(id: string): Promise<AuthProvider | undefined> {
    const [provider] = await this.db
      .select()
      .from(authProviders)
      .where(eq(authProviders.id, id));
    return provider || undefined;
  }

  async updateAuthProvider(id: string, data: Partial<AuthProvider>): Promise<AuthProvider | undefined> {
    const [provider] = await this.db
      .update(authProviders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(authProviders.id, id))
      .returning();
    return provider || undefined;
  }
}

const sharedStorageInstance = new DatabaseStorage();

export const defaultStorage = sharedStorageInstance;
export let storage: IStorage = sharedStorageInstance;

export function setStorage(newStorage: IStorage): void {
  storage = newStorage;
}

export function resetStorage(): void {
  storage = sharedStorageInstance;
}
