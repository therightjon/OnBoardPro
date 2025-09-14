import { 
  users, 
  userRoles,
  userIdentities,
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
  userPreferences,
  systemSettings,
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
  type InsertUserPreferences,
  type UserRole,
  type InsertUserRole
} from "@shared/schemas";
import { db } from "./connection";
import { eq, and, isNull, sql, desc, asc, ilike, inArray, or, ne, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./connection";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  // Basic user operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  getAllUsers(filters?: { status?: string; role?: string; departmentId?: string; divisionId?: string; search?: string }): Promise<User[]>;
  
  // User role management
  getUserRoles(userId: string): Promise<UserRole[]>;
  setUserRoles(userId: string, roles: string[]): Promise<UserRole[]>;
  
  // User status management
  disableUser(userId: string, reassignOpenTasksTo?: string): Promise<{ success: boolean; tasksReassigned?: number }>;
  enableUser(userId: string): Promise<User | undefined>;
  updateLastLogin(userId: string): Promise<void>;
  
  // User task counts (for disable dialog)
  getUserOpenTaskCount(userId: string): Promise<{ total: number; required: number }>;
  
  // User Preferences
  getUserPreferences(userId: string): Promise<UserPreferences | undefined>;
  upsertUserPreferences(preferences: InsertUserPreferences): Promise<UserPreferences>;
  
  // Candidates
  getCandidates(filters?: any): Promise<Candidate[]>;
  getCandidate(id: string): Promise<Candidate | undefined>;
  createCandidate(candidate: InsertCandidate): Promise<Candidate>;
  updateCandidate(id: string, data: Partial<Candidate>): Promise<Candidate | undefined>;
  
  // Tasks
  getCandidateTasks(filters?: any): Promise<CandidateTask[]>;
  getCandidateTask(id: string): Promise<CandidateTask | undefined>;
  createCandidateTask(task: InsertCandidateTask): Promise<CandidateTask>;
  updateCandidateTask(id: string, data: Partial<CandidateTask>): Promise<CandidateTask | undefined>;
  deleteCandidateTask(id: string): Promise<void>;
  archiveCandidateTask(id: string): Promise<void>;
  getCandidateStageHistory(candidateId: string): Promise<any[]>;
  getDashboardTasks(): Promise<any[]>;
  
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
  
  // Reference data
  getHiringStages(): Promise<HiringStage[]>;
  getTaskCategories(): Promise<TaskCategory[]>;
  getTaskPriorities(): Promise<TaskPriority[]>;
  getCandidateTypes(): Promise<CandidateType[]>;
  getFacultyRanks(): Promise<FacultyRank[]>;
  getUsers(): Promise<User[]>; // Legacy method - use getAllUsers for new code
  
  // Auth Providers
  getAllAuthProviders(): Promise<AuthProvider[]>;
  getAuthProvider(id: string): Promise<AuthProvider | undefined>;
  updateAuthProvider(id: string, data: Partial<AuthProvider>): Promise<AuthProvider | undefined>;
  
  // Session store
  sessionStore: session.Store;
  
  // Template expansion
  expandTemplate(templateId: string, candidateId: string, currentUserId: string): Promise<number>;
  
  // Template estimation
  estimateTemplate(templateId: string, startDate?: string, businessDays?: boolean): Promise<any>;

  // Comments
  getCandidateComments(params: { candidateId: string; visibility?: 'all'|'internal'|'external'; role: string; cursor?: string; limit?: number }): Promise<{ items: any[]; nextCursor?: string; totalVisibleCount: number }>;
  getTaskComments(params: { taskId: string; visibility?: 'all'|'internal'|'external'; role: string; cursor?: string; limit?: number }): Promise<{ items: any[]; nextCursor?: string; totalVisibleCount: number }>;
  createComment(params: { entityType: 'candidate'|'task'; entityId: string; authorUserId: string; role: string; body: string; visibility: 'internal'|'external'; parentId?: string | null }): Promise<any>;
  editComment(params: { id: string; userId: string; userRole: string; body: string }): Promise<any>;
  deleteComment(params: { id: string; userId: string; userRole: string }): Promise<void>;
  getCommentStats(params: { candidateId: string; role: string }): Promise<{ profile: { internalCount: number; externalCount: number; totalVisible: number }; byTask: Record<string, { internalCount: number; externalCount: number; totalVisible: number }> }>;
}

// Business day utility functions
function addBusinessDays(startDate: Date, businessDays: number): Date {
  let result = new Date(startDate);
  let remainingDays = businessDays;
  
  while (remainingDays > 0) {
    result.setDate(result.getDate() + 1);
    // 0 = Sunday, 6 = Saturday
    if (result.getDay() !== 0 && result.getDay() !== 6) {
      remainingDays--;
    }
  }
  
  return result;
}

function countBusinessDays(startDate: Date, endDate: Date): number {
  let count = 0;
  let current = new Date(startDate);
  
  while (current <= endDate) {
    // 0 = Sunday, 6 = Saturday
    if (current.getDay() !== 0 && current.getDay() !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return count;
}

export class DatabaseStorage implements IStorage {
  public sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool, 
      createTableIfMissing: true 
    });
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

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
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
    
    return await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
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
    return await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
  }

  async setUserRoles(userId: string, roles: string[]): Promise<UserRole[]> {
    // Remove existing roles
    await db.delete(userRoles).where(eq(userRoles.userId, userId));
    
    // Add new roles
    if (roles.length > 0) {
      const newRoles = roles.map(role => ({
        userId,
        role: role as any
      }));
      
      return await db
        .insert(userRoles)
        .values(newRoles)
        .returning();
    }
    
    return [];
  }

  async disableUser(userId: string, reassignOpenTasksTo?: string): Promise<{ success: boolean; tasksReassigned?: number }> {
    return await db.transaction(async (tx) => {
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
          .set({ assigneeId: reassignOpenTasksTo, updatedAt: new Date() })
          .where(
            and(
              eq(candidateTasks.assigneeId, userId),
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
    const [user] = await db
      .update(users)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user || undefined;
  }

  async updateLastLogin(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, userId));
  }

  async getUserOpenTaskCount(userId: string): Promise<{ total: number; required: number }> {
    const result = await db.execute(sql`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN required = true THEN 1 ELSE 0 END) as required
      FROM candidate_tasks 
      WHERE assignee_id = ${userId}
        AND status NOT IN ('done', 'canceled')
        AND archived = false
    `);
    
    const row = result.rows[0] as any;
    return {
      total: parseInt(row.total) || 0,
      required: parseInt(row.required) || 0
    };
  }

  async getCandidates(filters?: any): Promise<any[]> {
    const whereConditions = [];
    
    // By default, exclude archived candidates unless explicitly requested
    if (!filters?.includeArchived) {
      whereConditions.push(eq(candidates.archived, false));
    }
    
    return await db
      .select({
        id: candidates.id,
        salutation: candidates.salutation,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
        startDate: candidates.startDate,
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
        currentStage: {
          id: hiringStages.id,
          name: hiringStages.name,
          // DISPLAY ONLY: global orderIndex for UI sorting, not business logic
          orderIndex: hiringStages.orderIndex
        }
      })
      .from(candidates)
      .leftJoin(hiringStages, eq(candidates.currentStageId, hiringStages.id))
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .orderBy(desc(candidates.createdAt));
  }

  async getCandidate(id: string): Promise<any> {
    const [candidate] = await db
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
        startDate: candidates.startDate,
        status: candidates.status,
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
        facultyRank: {
          id: facultyRanks.id,
          name: facultyRanks.name
        },
        templateNameSnapshot: candidates.templateNameSnapshot,
        templateVersion: candidates.templateVersion,
        currentStage: {
          id: hiringStages.id,
          name: hiringStages.name,
          // DISPLAY ONLY: global orderIndex for UI sorting, not business logic
          orderIndex: hiringStages.orderIndex
        }
      })
      .from(candidates)
      .leftJoin(candidateTypes, eq(candidates.candidateTypeId, candidateTypes.id))
      .leftJoin(departments, eq(candidates.departmentId, departments.id))
      .leftJoin(divisions, eq(candidates.divisionId, divisions.id))
      .leftJoin(users, eq(candidates.managerId, users.id))
      .leftJoin(facultyRanks, eq(candidates.facultyRankId, facultyRanks.id))
      .leftJoin(hiringStages, eq(candidates.currentStageId, hiringStages.id))
      .where(eq(candidates.id, id));
    return candidate || undefined;
  }

  // System settings helpers
  async getSystemSettings(): Promise<{ auto_regress_on_prior_open: boolean }> {
    const rows = await db.select().from(systemSettings);
    const map = new Map(rows.map((r: any) => [r.key, r.value]));
    const autoRegress = Boolean(map.get('auto_regress_on_prior_open')?.enabled ?? false);
    return { auto_regress_on_prior_open: autoRegress };
  }

  async setSystemSettings(patch: { auto_regress_on_prior_open?: boolean }): Promise<{ auto_regress_on_prior_open: boolean } | undefined> {
    if (patch.auto_regress_on_prior_open !== undefined) {
      const now = new Date();
      const value = { enabled: !!patch.auto_regress_on_prior_open } as any;
      await db
        .insert(systemSettings)
        .values({ key: 'auto_regress_on_prior_open', value, updatedAt: now, createdAt: now } as any)
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value, updatedAt: now }
        });
    }
    return await this.getSystemSettings();
  }

  async createCandidate(insertCandidate: InsertCandidate): Promise<Candidate> {
    const [candidate] = await db
      .insert(candidates)
      .values(insertCandidate)
      .returning();
    return candidate;
  }

  async updateCandidate(id: string, data: Partial<Candidate>): Promise<Candidate | undefined> {
    const [candidate] = await db
      .update(candidates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(candidates.id, id))
      .returning();
    return candidate || undefined;
  }

  async getCandidateTasks(filters?: any): Promise<any[]> {
    const whereConditions = [eq(candidateTasks.archived, false)];
    
    if (filters?.assigneeId) {
      whereConditions.push(eq(candidateTasks.assigneeId, filters.assigneeId));
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
    
    const rawTasks = await db
      .select({
        id: candidateTasks.id,
        candidateId: candidateTasks.candidateId,
        title: candidateTasks.title,
        description: candidateTasks.description,
        notes: candidateTasks.notes,
        stage_id: candidateTasks.stageId,
        stage_name: hiringStages.name,
        stage_order_index: candidateTemplateStages.orderIndex,
        assignee_id: candidateTasks.assigneeId,
        assignee_firstName: users.firstName,
        assignee_lastName: users.lastName,
        priority: candidateTasks.priority,
        priority_name: taskPriorities.name,
        category_id: candidateTasks.categoryId,
        category_name: taskCategories.name,
        dueAt: candidateTasks.dueAt,
        status: candidateTasks.status,
        required: candidateTasks.required,
        cancel_reason: candidateTasks.cancelReason,
        updated_at: candidateTasks.updatedAt,
        // Add candidate fields to prevent "Unknown Candidate"
        candidate_id: candidates.id,
        candidate_first_name: candidates.firstName,
        candidate_last_name: candidates.lastName,
        candidate_status: candidates.status
      })
      .from(candidateTasks)
      .innerJoin(candidates, eq(candidateTasks.candidateId, candidates.id)) // INNER JOIN to guarantee candidate data
      .leftJoin(candidateTemplateStages, and(
        eq(candidateTemplateStages.candidateId, candidateTasks.candidateId),
        eq(candidateTemplateStages.stageId, candidateTasks.stageId)
      ))
      .leftJoin(hiringStages, eq(hiringStages.id, candidateTasks.stageId))
      .leftJoin(users, eq(users.id, candidateTasks.assigneeId))
      .leftJoin(taskPriorities, eq(taskPriorities.name, candidateTasks.priority))
      .leftJoin(taskCategories, eq(taskCategories.id, candidateTasks.categoryId))
      .where(and(...whereConditions))
      .orderBy(desc(candidateTasks.dueAt), desc(candidateTasks.updatedAt));

    // Transform the flat structure to match frontend expectations
    return rawTasks.map(task => ({
      ...task,
      assignee: task.assignee_firstName || task.assignee_lastName ? { 
        id: task.assignee_id,
        firstName: task.assignee_firstName,
        lastName: task.assignee_lastName 
      } : null,
      candidate: {
        id: task.candidate_id,
        firstName: task.candidate_first_name,
        lastName: task.candidate_last_name,
        status: task.candidate_status
      }
    }));
  }

  async getDashboardTasks(): Promise<any[]> {
    // Get all tasks from candidates with active or on_hold status for KPI calculations
    const rawTasks = await db
      .select({
        id: candidateTasks.id,
        candidateId: candidateTasks.candidateId,
        title: candidateTasks.title,
        description: candidateTasks.description,
        assignee_id: candidateTasks.assigneeId,
        assignee_firstName: users.firstName,
        assignee_lastName: users.lastName,
        priority: candidateTasks.priority,
        dueAt: candidateTasks.dueAt,
        status: candidateTasks.status,
        required: candidateTasks.required,
        cancel_reason: candidateTasks.cancelReason,
        updated_at: candidateTasks.updatedAt,
        candidate_status: candidates.status
      })
      .from(candidateTasks)
      .innerJoin(candidates, eq(candidateTasks.candidateId, candidates.id))
      .leftJoin(users, eq(users.id, candidateTasks.assigneeId))
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
      } : null
    }));
  }

  async getCandidateTask(id: string): Promise<CandidateTask | undefined> {
    const [task] = await db
      .select()
      .from(candidateTasks)
      .where(and(eq(candidateTasks.id, id), eq(candidateTasks.archived, false)));
    return task || undefined;
  }

  async createCandidateTask(insertTask: InsertCandidateTask): Promise<CandidateTask> {
    const [task] = await db
      .insert(candidateTasks)
      .values(insertTask)
      .returning();
    return task;
  }

  async updateCandidateTask(id: string, data: Partial<CandidateTask>): Promise<CandidateTask | undefined> {
    const [task] = await db
      .update(candidateTasks)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(candidateTasks.id, id), eq(candidateTasks.archived, false)))
      .returning();
    return task || undefined;
  }

  async deleteCandidateTask(id: string): Promise<void> {
    await db
      .update(candidateTasks)
      .set({ deletedAt: new Date() })
      .where(eq(candidateTasks.id, id));
  }

  async archiveCandidateTask(id: string): Promise<void> {
    await db
      .update(candidateTasks)
      .set({ archived: true, updatedAt: new Date() })
      .where(eq(candidateTasks.id, id));
  }

  async getCandidateStageHistory(candidateId: string): Promise<any[]> {
    const fromStages = alias(hiringStages, 'from_hs');
    const rows = await db
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
    return await db.select().from(templates).where(eq(templates.archived, false));
  }

  async getTemplate(id: string): Promise<Template | undefined> {
    const [template] = await db.select().from(templates).where(eq(templates.id, id));
    return template || undefined;
  }

  async createTemplate(insertTemplate: InsertTemplate, cloneFromTemplateId?: string): Promise<Template> {
    const [template] = await db
      .insert(templates)
      .values(insertTemplate)
      .returning();
    
    // If cloning from another template, copy its template stages and tasks
    if (cloneFromTemplateId) {
      // First, copy template stages
      const sourceStages = await db
        .select()
        .from(templateStages)
        .where(and(
          eq(templateStages.templateId, cloneFromTemplateId),
          eq(templateStages.isActive, true)
        ))
        .orderBy(asc(templateStages.orderIndex));
      
      // Copy stages to new template (keeping original stage IDs)
      if (sourceStages.length > 0) {
        const stagesToClone = sourceStages.map(stage => ({
          templateId: template.id,
          stageId: stage.stageId,
          orderIndex: stage.orderIndex,
          isActive: true
        }));
        
        await db.insert(templateStages).values(stagesToClone);
      }
      
      // Then copy template tasks (now stage IDs will be valid)
      const sourceTasks = await db
        .select()
        .from(templateTasks)
        .where(and(
          eq(templateTasks.templateId, cloneFromTemplateId),
          eq(templateTasks.archived, false)
        ));
      
      if (sourceTasks.length > 0) {
        const tasksToClone = sourceTasks.map(task => ({
          templateId: template.id,
          taskDefId: task.taskDefId,
          stageId: task.stageId,
          dueRuleType: task.dueRuleType,
          dueRuleValue: task.dueRuleValue,
          fixedDate: task.fixedDate,
          defaultAssigneeId: task.defaultAssigneeId,
          defaultPriorityId: task.defaultPriorityId,
          defaultCategoryId: task.defaultCategoryId,
          archived: false
        }));
        
        await db.insert(templateTasks).values(tasksToClone);
      }
    }
    
    return template;
  }

  async updateTemplate(id: string, data: Partial<Template>): Promise<Template | undefined> {
    const [template] = await db
      .update(templates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(templates.id, id))
      .returning();
    return template || undefined;
  }

  async getTaskDefinitions(): Promise<TaskDefinition[]> {
    return await db.select().from(taskDefinitions).orderBy(asc(taskDefinitions.name));
  }

  async getTaskDefinition(id: string): Promise<TaskDefinition | undefined> {
    const [taskDef] = await db.select().from(taskDefinitions).where(eq(taskDefinitions.id, id));
    return taskDef || undefined;
  }

  async createTaskDefinition(insertTaskDef: InsertTaskDefinition): Promise<TaskDefinition> {
    const [taskDef] = await db
      .insert(taskDefinitions)
      .values(insertTaskDef)
      .returning();
    return taskDef;
  }

  async updateTaskDefinition(id: string, data: Partial<TaskDefinition>): Promise<TaskDefinition | undefined> {
    const [taskDef] = await db
      .update(taskDefinitions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(taskDefinitions.id, id))
      .returning();
    return taskDef || undefined;
  }

  async getDepartments(includeArchived: boolean = false): Promise<Department[]> {
    if (includeArchived) {
      return await db.select().from(departments);
    }
    return await db.select().from(departments).where(eq(departments.archived, false));
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
      return await db.select().from(divisions).where(and(...whereConditions));
    }
    
    return await db.select().from(divisions);
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

    return await db
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
    
    return await db
      .select({
        id: users.id,
        name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
        email: users.email,
        role: users.role
      })
      .from(users)
      .where(and(...whereConditions))
      .orderBy(users.role, users.firstName, users.lastName)
      .limit(limit)
      .offset(offset);
  }

  async createDepartment(insertDept: InsertDepartment): Promise<Department> {
    const [dept] = await db
      .insert(departments)
      .values(insertDept)
      .returning();
    return dept;
  }

  async createDivision(insertDiv: InsertDivision): Promise<Division> {
    const [div] = await db
      .insert(divisions)
      .values(insertDiv)
      .returning();
    return div;
  }

  async updateDepartment(id: string, data: Partial<Department>): Promise<Department | undefined> {
    const [dept] = await db
      .update(departments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(departments.id, id))
      .returning();
    return dept || undefined;
  }

  async updateDivision(id: string, data: Partial<Division>): Promise<Division | undefined> {
    const [div] = await db
      .update(divisions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(divisions.id, id))
      .returning();
    return div || undefined;
  }

  async getHiringStages(): Promise<HiringStage[]> {
    // DISPLAY ONLY: This ordering is for admin UI and selectors only, 
    // NOT for template or candidate business logic
    return await db.select().from(hiringStages).orderBy(asc(hiringStages.orderIndex));
  }

  async createHiringStage(insertStage: InsertHiringStage): Promise<HiringStage> {
    // If no orderIndex provided, set it to the next available value
    if (!insertStage.orderIndex) {
      const maxOrderQuery = await db
        .select({ maxOrder: sql<number>`max(${hiringStages.orderIndex})` })
        .from(hiringStages);
      const maxOrder = maxOrderQuery[0]?.maxOrder || 0;
      insertStage.orderIndex = maxOrder + 1;
    }

    const [stage] = await db
      .insert(hiringStages)
      .values(insertStage)
      .returning();
    return stage;
  }

  async updateHiringStage(id: string, data: Partial<HiringStage>): Promise<HiringStage | undefined> {
    const [stage] = await db
      .update(hiringStages)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(hiringStages.id, id))
      .returning();
    return stage || undefined;
  }

  async deleteHiringStage(id: string): Promise<void> {
    // Soft delete by setting isActive to false
    await db
      .update(hiringStages)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(hiringStages.id, id));
  }

  async getTaskCategories(): Promise<TaskCategory[]> {
    return await db.select().from(taskCategories).orderBy(asc(taskCategories.name));
  }

  async getCandidateTypes(): Promise<CandidateType[]> {
    return await db.select().from(candidateTypes).orderBy(asc(candidateTypes.name));
  }

  async getFacultyRanks(): Promise<FacultyRank[]> {
    return await db.select().from(facultyRanks).orderBy(asc(facultyRanks.name));
  }

  async getUsers(): Promise<User[]> {
    return await db.select().from(users).where(eq(users.active, true)).orderBy(asc(users.firstName), asc(users.lastName));
  }

  // Template Tasks methods
  async getTemplateTasks(templateId: string): Promise<TemplateTask[]> {
    return await db
      .select()
      .from(templateTasks)
      .where(and(
        eq(templateTasks.templateId, templateId),
        eq(templateTasks.archived, false)
      ))
      .orderBy(asc(templateTasks.createdAt));
  }

  async getTemplateTask(id: string): Promise<TemplateTask | undefined> {
    const [task] = await db.select().from(templateTasks).where(eq(templateTasks.id, id));
    return task || undefined;
  }

  async createTemplateTask(insertTask: InsertTemplateTask): Promise<TemplateTask> {
    const [task] = await db
      .insert(templateTasks)
      .values(insertTask)
      .returning();
    return task;
  }

  async updateTemplateTask(id: string, data: Partial<TemplateTask>): Promise<TemplateTask | undefined> {
    const [task] = await db
      .update(templateTasks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(templateTasks.id, id))
      .returning();
    return task || undefined;
  }

  async archiveTemplateTask(id: string): Promise<void> {
    // For template tasks, we actually delete them rather than just archive
    // This allows the database trigger to auto-remove empty stages
    await db
      .delete(templateTasks)
      .where(eq(templateTasks.id, id));
  }

  // Template Stages methods
  async getTemplateStages(templateId: string): Promise<TemplateStage[]> {
    return await db
      .select()
      .from(templateStages)
      .where(and(
        eq(templateStages.templateId, templateId),
        eq(templateStages.isActive, true)
      ))
      .orderBy(asc(templateStages.orderIndex));
  }

  async getTemplateStage(id: string): Promise<TemplateStage | undefined> {
    const [stage] = await db.select().from(templateStages).where(eq(templateStages.id, id));
    return stage || undefined;
  }

  async createTemplateStage(insertStage: InsertTemplateStage): Promise<TemplateStage> {
    // (a) Upsert the stage using the exact SQL from requirements
    await db.execute(sql`
      INSERT INTO template_stages (template_id, stage_id, order_index, is_active, created_at, updated_at)
      VALUES (${insertStage.templateId}, ${insertStage.stageId}, COALESCE(${insertStage.orderIndex || 0}, 0), TRUE, now(), now())
      ON CONFLICT (template_id, stage_id)
      DO UPDATE SET
        is_active   = TRUE,
        order_index = COALESCE(EXCLUDED.order_index, template_stages.order_index),
        updated_at  = now()
    `);

    // (b) If this template now has exactly 1 active stage, auto-activate template
    const result = await db.execute(sql`
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
    const [stage] = await db
      .select()
      .from(templateStages)
      .where(and(
        eq(templateStages.templateId, insertStage.templateId),
        eq(templateStages.stageId, insertStage.stageId)
      ));
    
    return stage;
  }

  async updateTemplateStage(id: string, data: Partial<TemplateStage>): Promise<TemplateStage | undefined> {
    const [stage] = await db
      .update(templateStages)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(templateStages.id, id))
      .returning();
    return stage || undefined;
  }

  async deleteTemplateStage(id: string): Promise<void> {
    await db
      .update(templateStages)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(templateStages.id, id));
  }

  async reorderTemplateStages(templateId: string, stageIdsInOrder: string[]): Promise<void> {
    await db.transaction(async (trx) => {
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
      return await db
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
    const [created] = await db
      .insert(candidateTemplateStages)
      .values(stage)
      .returning();
    return created;
  }

  async upsertCandidateTemplateStages(candidateId: string, stages: InsertCandidateTemplateStage[]): Promise<void> {
    // Use UPSERT to handle conflicts
    for (const stage of stages) {
      await db
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

  async archiveTemplate(id: string): Promise<void> {
    const result = await db
      .update(templates)
      .set({ archived: true, isActive: false, updatedAt: new Date() })
      .where(and(eq(templates.id, id), eq(templates.archived, false)))
      .returning({ id: templates.id });
    
    if (result.length === 0) {
      throw new Error("Template not found or already archived");
    }
  }

  async getTemplateReadiness(id: string): Promise<{ active_stage_count: number }> {
    const [result] = await db
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
    return await db.select().from(taskPriorities).orderBy(asc(taskPriorities.name));
  }

  async expandTemplate(templateId: string, candidateId: string, currentUserId: string): Promise<number> {
    // Get the candidate
    const candidate = await this.getCandidate(candidateId);
    if (!candidate) {
      throw new Error("Candidate not found");
    }

    // Check guards
    if (!candidate.startDate) {
      throw new Error("Candidate must have a start date to apply template");
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

    // Get template tasks
    const templateTasksList = await this.getTemplateTasks(templateId);
    if (templateTasksList.length === 0) {
      throw new Error("Template has no tasks defined");
    }

    // Get task definitions for all template tasks
    const taskDefs = await Promise.all(
      templateTasksList.map(tt => this.getTaskDefinition(tt.taskDefId))
    );

    // Calculate due dates and create candidate tasks
    const startDate = new Date(candidate.startDate);
    const tasksToCreate = [];

    for (let i = 0; i < templateTasksList.length; i++) {
      const templateTask = templateTasksList[i];
      const taskDef = taskDefs[i];
      
      if (!taskDef) continue;

      // Calculate due date based on rule type
      let dueAt: Date | null = null;
      
      switch (templateTask.dueRuleType) {
        case "on_start_date":
          dueAt = startDate;
          break;
        case "days_before_start":
          if (templateTask.dueRuleValue) {
            dueAt = new Date(startDate);
            dueAt.setDate(dueAt.getDate() - templateTask.dueRuleValue);
          }
          break;
        case "days_after_start":
          if (templateTask.dueRuleValue) {
            dueAt = new Date(startDate);
            dueAt.setDate(dueAt.getDate() + templateTask.dueRuleValue);
          }
          break;
        case "fixed_date":
          if (templateTask.fixedDate) {
            dueAt = new Date(templateTask.fixedDate);
          }
          break;
        // TODO: Implement stage-based due dates when stage tracking is added
        case "days_before_stage":
        case "days_after_stage":
          // For now, default to start date
          dueAt = startDate;
          break;
      }

      // Get default priority name
      let priority = "medium";
      if (templateTask.defaultPriorityId) {
        const priorityRecord = await db
          .select()
          .from(taskPriorities)
          .where(eq(taskPriorities.id, templateTask.defaultPriorityId));
        if (priorityRecord[0]) {
          priority = priorityRecord[0].name;
        }
      }

      tasksToCreate.push({
        candidateId,
        taskDefId: templateTask.taskDefId,
        title: taskDef.name,
        description: taskDef.description,
        stageId: templateTask.stageId,
        assigneeId: templateTask.defaultAssigneeId,
        priority: priority as "low" | "medium" | "high" | "critical",
        categoryId: templateTask.defaultCategoryId || (await this.getTaskCategories())[0]?.id,
        dueAt,
        status: "todo" as const,
        required: (templateTask as any).isRequired ?? true,
        archived: false
      });
    }

    // Create all tasks first
    if (tasksToCreate.length > 0) {
      await db.insert(candidateTasks).values(tasksToCreate);
    }

    // Snapshot the template's stage sequence using SQL for efficiency
    await db.execute(sql`
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
    await db.execute(sql`
      UPDATE candidate_tasks ct
      SET stage_order_index = s.order_index
      FROM candidate_template_stages s
      WHERE s.candidate_id = ct.candidate_id AND s.stage_id = ct.stage_id AND ct.candidate_id = ${candidateId}
    `);

    // Get template stages to set initial stage
    const templateStagesList = await this.getTemplateStages(templateId);
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
      await db
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

    return tasksToCreate.length;
  }

  async estimateTemplate(templateId: string, startDate?: string, businessDays: boolean = false): Promise<any> {
    // Get active template tasks with stage information
    const tasksQuery = await db
      .select({
        id: templateTasks.id,
        stageId: templateTasks.stageId,
        stageName: hiringStages.name,
        dueRuleType: templateTasks.dueRuleType,
        dueRuleValue: templateTasks.dueRuleValue,
        fixedDate: templateTasks.fixedDate
      })
      .from(templateTasks)
      .innerJoin(hiringStages, eq(templateTasks.stageId, hiringStages.id))
      .where(and(
        eq(templateTasks.templateId, templateId),
        eq(templateTasks.archived, false)
      ));

    const start = startDate ? new Date(startDate) : null;
    const taskOffsets: any[] = [];
    const nonEstimable: any[] = [];
    const stageMap = new Map<string, { stageId: string; stageName: string; latestOffsetDays: number }>();

    // Calculate offsets for each task
    for (const task of tasksQuery) {
      let effectiveOffset: number | null = null;

      switch (task.dueRuleType) {
        case "on_start_date":
          effectiveOffset = 0;
          break;
        case "days_after_start":
          effectiveOffset = task.dueRuleValue || 0;
          break;
        case "days_before_start":
          // Negative offsets don't extend duration, but we track them as 0
          effectiveOffset = 0;
          break;
        case "fixed_date":
          if (start && task.fixedDate) {
            const fixedDateObj = new Date(task.fixedDate);
            const daysDiff = Math.ceil((fixedDateObj.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
            effectiveOffset = Math.max(daysDiff, 0);
          } else {
            nonEstimable.push({
              taskId: task.id,
              rule: task.dueRuleType,
              reason: start ? "invalid fixed date" : "no start date provided"
            });
          }
          break;
        case "days_before_stage":
        case "days_after_stage":
          nonEstimable.push({
            taskId: task.id,
            rule: task.dueRuleType,
            reason: "stage-relative rule"
          });
          break;
      }

      if (effectiveOffset !== null) {
        taskOffsets.push({
          taskId: task.id,
          stageId: task.stageId,
          stageName: task.stageName,
          offset: effectiveOffset
        });

        // Track latest offset per stage
        const stageKey = task.stageId;
        if (!stageMap.has(stageKey) || stageMap.get(stageKey)!.latestOffsetDays < effectiveOffset) {
          stageMap.set(stageKey, {
            stageId: task.stageId,
            stageName: task.stageName,
            latestOffsetDays: effectiveOffset
          });
        }
      }
    }

    // Calculate total duration
    const totalCalendarDays = Math.max(0, ...taskOffsets.map(t => t.offset), 0);
    const perStage = Array.from(stageMap.values()).sort((a, b) => a.latestOffsetDays - b.latestOffsetDays);

    // Calculate dates and business days if start date provided
    let lastDueDate: string | null = null;
    let totalBusinessDays: number | null = null;

    if (start && taskOffsets.length > 0) {
      const endDate = new Date(start);
      endDate.setDate(endDate.getDate() + totalCalendarDays);
      lastDueDate = endDate.toISOString().split('T')[0];

      if (businessDays) {
        totalBusinessDays = countBusinessDays(start, endDate);
      }
    }

    return {
      templateId,
      taskCount: tasksQuery.length,
      lastDueDate,
      totalCalendarDays,
      totalBusinessDays,
      nonEstimable,
      perStage
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

    const rows = await db
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

    const countRows = await db
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

    const rows = await db
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

    const countRows = await db
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
      const [parent] = await db.select().from(comments).where(eq(comments.id, parentId));
      if (!parent) throw new Error('Parent comment not found');
      finalVisibility = parent.visibility as any;
    }
    const [createdRow] = await db
      .insert(comments)
      .values({ entityType: entityType as any, entityId, authorUserId, body, visibility: finalVisibility as any, parentId: parentId || null })
      .returning();
    const [created] = await db
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
    const [existing] = await db.select().from(comments).where(eq(comments.id, id));
    if (!existing || existing.isDeleted) throw new Error('Comment not found');
    const now = new Date();
    const createdAt = new Date(existing.createdAt as any);
    const diffMs = now.getTime() - createdAt.getTime();
    const canEdit = (existing.authorUserId === userId && diffMs <= 5 * 60 * 1000) || ['system_admin','hr_staff'].includes(userRole);
    if (!canEdit) throw new Error('Not permitted to edit comment');
    const [updated] = await db
      .update(comments)
      .set({ body, updatedAt: new Date() })
      .where(eq(comments.id, id))
      .returning();
    return updated;
  }

  async deleteComment(params: { id: string; userId: string; userRole: string }): Promise<void> {
    const { id, userId, userRole } = params;
    const { comments } = await import("@shared/schemas");
    const [existing] = await db.select().from(comments).where(eq(comments.id, id));
    if (!existing || existing.isDeleted) throw new Error('Comment not found');
    const now = new Date();
    const createdAt = new Date(existing.createdAt as any);
    const diffMs = now.getTime() - createdAt.getTime();
    const canDelete = (existing.authorUserId === userId && diffMs <= 5 * 60 * 1000) || ['system_admin','hr_staff'].includes(userRole);
    if (!canDelete) throw new Error('Not permitted to delete comment');
    await db.update(comments).set({ isDeleted: true, updatedAt: new Date() }).where(eq(comments.id, id));
  }

  async getCommentStats(params: { candidateId: string; role: string }): Promise<{ profile: { internalCount: number; externalCount: number; totalVisible: number }; byTask: Record<string, { internalCount: number; externalCount: number; totalVisible: number }> }> {
    const { candidateId, role } = params;
    const { comments, candidateTasks } = await import("@shared/schemas");
    const visibleSet = role === 'candidate' ? ['external'] : ['internal','external'];

    const profileCounts = await db
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

    const taskIdsRows = await db
      .select({ id: candidateTasks.id })
      .from(candidateTasks)
      .where(eq(candidateTasks.candidateId, candidateId));
    const taskIds = taskIdsRows.map(r => r.id);
    const byTask: Record<string, { internalCount: number; externalCount: number; totalVisible: number }> = {};
    if (taskIds.length > 0) {
      const taskCounts = await db
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
    const candidate = await db
      .select({
        id: candidates.id,
        templateAppliedFromId: candidates.templateAppliedFromId,
        templateAppliedAt: candidates.templateAppliedAt,
        templateLocked: candidates.templateLocked,
        startDate: candidates.startDate,
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
    const startDate = candidateData.templateAppliedAt || candidateData.startDate;
    
    if (!startDate) {
      return {
        candidateId,
        error: "No start date available for calculation",
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
    const tasksQuery = await db
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
      const incompleteRequiredTasks = await db
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
          const reopened = await db
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
        const canceledTasks = await db
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
        const canceledOptionalTasks = await db
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
    const results = await db.execute(sql`
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

  async searchDivisions(query: string, departmentId?: string): Promise<{ id: string; name: string; score?: number }[]> {
    const results = await db.execute(sql`
      WITH qry AS (
        SELECT nullif(trim(${query}), '') AS q, ${departmentId || null}::uuid AS dept_id
      )
      SELECT id, name,
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
      score: r.score as number 
    }));
  }

  async searchUsers(query: string, role?: string, departmentId?: string, divisionId?: string): Promise<{ id: string; name: string; score?: number }[]> {
    const results = await db.execute(sql`
      WITH params AS (
        SELECT 
          NULLIF(${query}, '')::text AS q, 
          NULLIF(${role || ''}, '')::text AS role,
          NULLIF(${departmentId || ''}, '')::uuid AS department_id,
          NULLIF(${divisionId || ''}, '')::uuid AS division_id
      )
      SELECT u.id,
             u.first_name || ' ' || u.last_name AS name,
             CASE
               WHEN (SELECT q FROM params) IS NULL THEN 1.0
               ELSE GREATEST(similarity(lower(u.first_name || ' ' || u.last_name), lower((SELECT q FROM params))), 0)
             END AS score
      FROM users u, params p
      WHERE u.status = 'active'
        AND (p.role IS NULL OR u.role::text = p.role)
        AND (
          p.division_id IS NOT NULL AND u.division_id = p.division_id
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
      score: r.score as number 
    }));
  }

  async getUserPreferences(userId: string): Promise<UserPreferences | undefined> {
    const [preferences] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));
    return preferences || undefined;
  }

  async upsertUserPreferences(preferences: InsertUserPreferences): Promise<UserPreferences> {
    const [result] = await db
      .insert(userPreferences)
      .values({ ...preferences, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: {
          mytasksShowArchived: preferences.mytasksShowArchived,
          mytasksShowCanceled: preferences.mytasksShowCanceled,
          mytasksShowCompleted: preferences.mytasksShowCompleted,
          updatedAt: new Date()
        }
      })
      .returning();
    return result;
  }

  // User identity methods for multi-provider authentication

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));
    return user || undefined;
  }

  async getUserIdentityByProvider(provider: string, externalId: string): Promise<UserIdentity | undefined> {
    const [identity] = await db
      .select()
      .from(userIdentities)
      .where(and(
        eq(userIdentities.provider, provider),
        eq(userIdentities.externalId, externalId)
      ));
    return identity || undefined;
  }

  async createUserIdentity(identityData: InsertUserIdentity): Promise<UserIdentity> {
    const [identity] = await db
      .insert(userIdentities)
      .values(identityData)
      .returning();
    return identity;
  }

  async updateUserIdentity(id: string, data: Partial<UserIdentity>): Promise<UserIdentity | undefined> {
    const [identity] = await db
      .update(userIdentities)
      .set(data)
      .where(eq(userIdentities.id, id))
      .returning();
    return identity || undefined;
  }

  async getUserIdentities(userId: string): Promise<UserIdentity[]> {
    return await db
      .select()
      .from(userIdentities)
      .where(eq(userIdentities.userId, userId))
      .orderBy(userIdentities.createdAt);
  }

  async deleteUserIdentity(id: string): Promise<void> {
    await db
      .delete(userIdentities)
      .where(eq(userIdentities.id, id));
  }

  // Auth Providers methods
  async getAllAuthProviders(): Promise<AuthProvider[]> {
    return await db
      .select()
      .from(authProviders)
      .orderBy(authProviders.id);
  }

  async getAuthProvider(id: string): Promise<AuthProvider | undefined> {
    const [provider] = await db
      .select()
      .from(authProviders)
      .where(eq(authProviders.id, id));
    return provider || undefined;
  }

  async updateAuthProvider(id: string, data: Partial<AuthProvider>): Promise<AuthProvider | undefined> {
    const [provider] = await db
      .update(authProviders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(authProviders.id, id))
      .returning();
    return provider || undefined;
  }
}

export const storage = new DatabaseStorage();
