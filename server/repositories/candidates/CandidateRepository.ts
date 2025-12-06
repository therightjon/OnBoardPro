/**
 * Candidate Repository
 *
 * Main repository for candidate management with comprehensive authorization
 * and scope filtering. Handles CRUD operations, status transitions, and
 * dashboard aggregations for candidates.
 */

import { eq, and, desc, inArray, sql, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  candidates,
  candidateTasks,
  candidateTypes,
  departments,
  divisions,
  users,
  facultyRanks,
  hiringStages,
  templateStages,
  templates,
  taskDefinitions,
  type Candidate,
  type InsertCandidate,
} from "@shared/schemas";
import { BaseRepository } from "../base/BaseRepository";
import type {
  AuthorizationContext,
  CandidateScopeFilters,
  DivisionActiveCandidateSummary,
} from "../base/types";

/**
 * Repository for candidate-related data operations
 * Extends BaseRepository to inherit pagination and authorization helpers
 */
export class CandidateRepository extends BaseRepository {
  /**
   * Get a list of candidates with optional filtering and authorization
   *
   * @param filters - Optional filters including department, division, manager, archived status
   * @param auth - Optional authorization context for access control
   * @returns Array of candidates with current stage and task counts
   */
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

    // Apply explicit filters from request
    this.applyScopeFilters(whereConditions, {
      departmentIds,
      divisionIds,
      managerIds,
      candidateIds,
      linkedUserIds
    }, filters?.requireScope === true);

    // Apply authorization-based filters for non-privileged users
    if (auth && !auth.privileged) {
      const authFilters: CandidateScopeFilters = {};
      if (auth.departmentIds.size > 0) {
        authFilters.departmentIds = Array.from(auth.departmentIds);
      }
      if (auth.divisionIds.size > 0) {
        authFilters.divisionIds = Array.from(auth.divisionIds);
      }
      const managerScope = new Set<string>();
      if (auth.managedCandidateIds.size > 0) {
        authFilters.candidateIds = Array.from(auth.managedCandidateIds);
      }
      if (auth.roles.has("manager") && auth.userId) {
        managerScope.add(auth.userId);
        authFilters.managerIds = Array.from(managerScope);
      }
      if (auth.roles.has("candidate") && auth.userId) {
        authFilters.linkedUserIds = [auth.userId];
      }
      // Require at least one authorization scope to match
      this.applyScopeFilters(whereConditions, authFilters, true);
    }

    const currentTemplateStage = alias(templateStages, "current_template_stage");

    return await this.db
      .select({
        id: candidates.id,
        salutation: candidates.salutation,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
        letterOfIntentDate: candidates.letterOfIntentDate,
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
        // Use snapshot if available, otherwise get from templates table (for deferred template)
        templateNameSnapshot: sql<string>`COALESCE(${candidates.templateNameSnapshot}, ${templates.name})`,
        templateVersion: candidates.templateVersion,
        archived: candidates.archived,
        archivedAt: candidates.archivedAt,
        archivedBy: candidates.archivedBy,
        createdAt: candidates.createdAt,
        updatedAt: candidates.updatedAt,
        // Subquery: Count pending anchor tasks
        pendingAnchorCount: sql<number>`(
          SELECT count(*)::int
          FROM candidate_tasks ct
          WHERE ct.candidate_id = ${candidates.id}
            AND ct.pending_anchor = true
            AND ct.archived = false
        )`,
        // Subquery: Count open pre-hire tasks
        openPrehireTasks: sql<number>`(
          SELECT count(*)::int
          FROM candidate_tasks ct
          WHERE ct.candidate_id = ${candidates.id}
            AND ct.archived = false
            AND ct.status NOT IN ('done', 'canceled')
            AND (ct.phase_snapshot IS NULL OR ct.phase_snapshot = 'pre_hire')
        )`,
        // Subquery: Count open onboarding tasks
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
      .leftJoin(templates, eq(candidates.templateAppliedFromId, templates.id))
      .leftJoin(currentTemplateStage, and(
        eq(currentTemplateStage.templateId, candidates.templateAppliedFromId),
        eq(currentTemplateStage.stageId, candidates.currentStageId),
        eq(currentTemplateStage.isActive, true)
      ))
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .orderBy(desc(candidates.createdAt));
  }

  /**
   * Build a visibility checker function for a specific authorization context
   * Used to filter single candidate results in memory after fetching
   *
   * @param auth - Authorization context
   * @returns Function that returns true if candidate is visible
   */
  private buildCandidateVisibilityChecker(auth: AuthorizationContext): (candidate: any) => boolean {
    return (candidate: any) => {
      if (auth.privileged) return true;

      // Check department scope
      if (candidate.departmentId && auth.departmentIds.has(candidate.departmentId)) {
        return true;
      }

      // Check division scope
      if (candidate.divisionId && auth.divisionIds.has(candidate.divisionId)) {
        return true;
      }

      // Check manager scope
      if (auth.roles.has("manager") && candidate.managerId === auth.userId) {
        return true;
      }

      // Check candidate self-access
      if (auth.roles.has("candidate") && candidate.linkedUserId === auth.userId) {
        return true;
      }

      // Check explicit candidate grants
      if (auth.managedCandidateIds.has(candidate.id)) {
        return true;
      }

      return false;
    };
  }

  /**
   * Get a single candidate by ID with full details and authorization check
   *
   * Performs a complex query with 10+ left joins to fetch all related data.
   * Authorization is enforced AFTER the query to check visibility.
   *
   * @param id - Candidate ID
   * @param auth - Optional authorization context for access control
   * @returns Candidate with all related entities or undefined if not found/not authorized
   */
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
        letterOfIntentDate: candidates.letterOfIntentDate,
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
        // Subquery: Count pending anchor tasks
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
        // Use snapshot if available, otherwise get from templates table (for deferred template)
        templateNameSnapshot: sql<string>`COALESCE(${candidates.templateNameSnapshot}, ${templates.name})`,
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
      .leftJoin(templates, eq(candidates.templateAppliedFromId, templates.id))
      .leftJoin(currentTemplateStage, and(
        eq(currentTemplateStage.templateId, candidates.templateAppliedFromId),
        eq(currentTemplateStage.stageId, candidates.currentStageId),
        eq(currentTemplateStage.isActive, true)
      ))
      .where(eq(candidates.id, id));

    if (!candidate) return undefined;

    // CRITICAL: Authorization check for non-privileged users
    if (auth && !auth.privileged) {
      const accessible = this.buildCandidateVisibilityChecker(auth);
      if (!accessible(candidate)) {
        return undefined;
      }
    }

    return candidate;
  }

  /**
   * Create a new candidate
   *
   * @param insertCandidate - Candidate data to insert
   * @returns Created candidate
   */
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

  /**
   * Update a candidate's fields
   *
   * @param id - Candidate ID
   * @param data - Partial candidate data to update
   * @returns Updated candidate or undefined if not found
   */
  async updateCandidate(id: string, data: Partial<Candidate>): Promise<Candidate | undefined> {
    const [candidate] = await this.db
      .update(candidates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(candidates.id, id))
      .returning();

    return candidate || undefined;
  }

  /**
   * Update candidate status with validation and cascading task updates
   *
   * CRITICAL: This is a VERY COMPLEX method with extensive business logic!
   * - Validates status transitions based on allowed state machine
   * - Enforces completion rules (all required tasks must be done)
   * - Cascades status changes to related tasks
   * - Handles archive/restore operations
   *
   * Status transition rules:
   * - draft -> active, on_hold, canceled, archived
   * - active -> on_hold, completed, canceled, archived
   * - on_hold -> active, canceled, archived
   * - completed -> archived
   * - canceled -> archived, active (restore)
   * - archived -> active (restore only)
   *
   * @param candidateId - Candidate ID
   * @param newStatus - New status to transition to
   * @param currentUserId - User making the change
   * @param closeOpenTasks - Whether to close open tasks (used for some transitions)
   * @returns Result with success flag and any cascade information
   */
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
    const statusBeforeArchive = (candidate as any).statusBeforeArchive as string | null | undefined;
    
    // Define valid transitions
    const validTransitions: Record<string, string[]> = {
      'draft': ['active', 'on_hold', 'canceled', 'archived'],
      'active': ['on_hold', 'completed', 'canceled', 'archived'],
      'on_hold': ['active', 'canceled', 'archived'],
      'completed': ['archived'],
      'canceled': ['archived', 'active'], // Can restore canceled to active
      'offer_declined': ['archived', 'active'], // Can restore offer_declined to active
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
            sql`${candidateTasks.status} != 'done'`,
            sql`${candidateTasks.status} != 'canceled'`
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
        updateData.statusBeforeArchive = statusBeforeArchive ?? currentStatus;
        break;
        
      case 'active':
        if (currentStatus === 'archived') {
          // Restoring from archived
          updateData.archived = false;
          updateData.archivedAt = null;
          updateData.archivedBy = null;
          updateData.statusBeforeArchive = null;
        }
        if (currentStatus === 'canceled' || currentStatus === 'offer_declined' || 
            (currentStatus === 'archived' && (statusBeforeArchive === 'canceled' || statusBeforeArchive === 'offer_declined'))) {
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

  /**
   * Get division active candidate counts for dashboard
   *
   * Returns aggregated counts of active candidates grouped by division.
   * Applies authorization filtering for non-privileged users.
   *
   * @param limit - Maximum number of divisions to return (default 4, max 25)
   * @param auth - Optional authorization context for access control
   * @returns Array of division summaries with active candidate counts
   */
  async getDivisionActiveCandidateCounts(
    limit: number = 4,
    auth?: AuthorizationContext
  ): Promise<DivisionActiveCandidateSummary[]> {
    const whereConditions: any[] = [
      eq(candidates.archived, false),
      eq(candidates.status, "active")
    ];

    // Apply authorization-based filters for non-privileged users
    if (auth && !auth.privileged) {
      const scopeFilters: CandidateScopeFilters = {};
      if (auth.departmentIds.size > 0) {
        scopeFilters.departmentIds = Array.from(auth.departmentIds);
      }
      if (auth.divisionIds.size > 0) {
        scopeFilters.divisionIds = Array.from(auth.divisionIds);
      }
      if (auth.managedCandidateIds.size > 0) {
        scopeFilters.candidateIds = Array.from(auth.managedCandidateIds);
      }
      if (auth.roles.has("manager") && auth.userId) {
        scopeFilters.managerIds = [auth.userId];
      }
      if (auth.isCandidate && auth.userId) {
        scopeFilters.linkedUserIds = [auth.userId];
      }
      this.applyScopeFilters(whereConditions, scopeFilters, true);
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
      .orderBy(desc(countExpression), sql`${divisions.name} ASC`)
      .limit(Math.max(1, Math.min(limit, 25)));

    return results;
  }
}
