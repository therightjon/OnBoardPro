/**
 * Dashboard Service
 *
 * Provides aggregated data for dashboard widgets including
 * division candidate counts and recent activity events.
 */

import { eq, and, desc, isNotNull, sql, asc, gte, lte, between } from "drizzle-orm";
import type { db as DbType } from "../../db/connection";
import {
  candidates,
  candidateTasks,
  candidateStageHistory,
  candidateTypes,
  divisions,
  departments,
  hiringStages,
  templates
} from "@shared/schemas";
import type { AuthorizationContext, CandidateScopeFilters, DivisionActiveCandidateSummary } from "../../repositories/base/types";

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

export class DashboardService {
  constructor(private db: typeof DbType) {}

  /**
   * Get active candidate counts by division for dashboard widget
   */
  async getDivisionActiveCandidateCounts(
    limit: number = 4,
    auth?: AuthorizationContext
  ): Promise<DivisionActiveCandidateSummary[]> {
    const whereConditions: any[] = [
      eq(candidates.archived, false),
      eq(candidates.status, "active")
    ];

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
      .orderBy(desc(countExpression), asc(divisions.name))
      .limit(Math.max(1, Math.min(limit, 25)));

    return results;
  }

  /**
   * Get recent activity events for dashboard widget
   */
  async getRecentActivityEvents(
    limit: number = 5,
    auth?: AuthorizationContext
  ): Promise<RecentActivityEvent[]> {
    const effectiveLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 10) : 5;
    const perTypeLimit = Math.max(effectiveLimit * 2, 8);

    const buildCandidateScopeConditions = (): any[] => {
      const scopeConditions: any[] = [eq(candidates.archived, false)];
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
        this.applyScopeFilters(scopeConditions, scopeFilters, true);
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

  /**
   * Get dashboard metrics with historical comparison
   */
  async getDashboardMetrics(auth?: AuthorizationContext): Promise<{
    activeCandidates: { current: number; change: number; changePercent: number };
    tasksDue: { current: number; change: number; changePercent: number };
    overdueTasks: { current: number; change: number; changePercent: number };
    completionRate: { current: number; change: number; changePercent: number };
  }> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const buildCandidateScopeConditions = (baseConditions: any[] = []): any[] => {
      const scopeConditions: any[] = [...baseConditions];
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
        this.applyScopeFilters(scopeConditions, scopeFilters, true);
      }
      return scopeConditions;
    };

    // Active candidates - current
    const activeCandidatesCurrent = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(candidates)
      .where(and(...buildCandidateScopeConditions([eq(candidates.status, "active"), eq(candidates.archived, false)])));

    // Active candidates - 30 days ago
    const activeCandidatesHistorical = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(candidates)
      .where(
        and(
          ...buildCandidateScopeConditions([
            eq(candidates.status, "active"),
            eq(candidates.archived, false),
            lte(candidates.createdAt, thirtyDaysAgo)
          ])
        )
      );

    // Completion rate - current
    const completedCandidatesCurrent = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(candidates)
      .where(
        and(
          ...buildCandidateScopeConditions([
            eq(candidates.status, "completed"),
            eq(candidates.archived, false)
          ])
        )
      );

    const totalCandidatesCurrent = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(candidates)
      .where(
        and(
          ...buildCandidateScopeConditions([
            eq(candidates.archived, false),
            sql`${candidates.status} NOT IN ('draft', 'canceled')`
          ])
        )
      );

    // Completion rate - 30 days ago
    const completedCandidatesHistorical = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(candidates)
      .where(
        and(
          ...buildCandidateScopeConditions([
            eq(candidates.status, "completed"),
            eq(candidates.archived, false),
            lte(candidates.updatedAt, thirtyDaysAgo)
          ])
        )
      );

    const totalCandidatesHistorical = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(candidates)
      .where(
        and(
          ...buildCandidateScopeConditions([
            eq(candidates.archived, false),
            lte(candidates.createdAt, thirtyDaysAgo),
            sql`${candidates.status} NOT IN ('draft', 'canceled')`
          ])
        )
      );

    // Tasks - need to join with candidates for scope filtering
    const buildTaskScopeConditions = (baseConditions: any[] = []): any[] => {
      const scopeConditions: any[] = [
        ...baseConditions,
        eq(candidateTasks.archived, false)
      ];
      
      if (auth && !auth.privileged) {
        scopeConditions.push(eq(candidates.archived, false));
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
        this.applyScopeFilters(scopeConditions, scopeFilters, true);
      }
      return scopeConditions;
    };

    // Tasks due within 7 days - current
    const tasksDueCurrent = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(candidateTasks)
      .innerJoin(candidates, eq(candidateTasks.candidateId, candidates.id))
      .where(
        and(
          ...buildTaskScopeConditions([
            sql`${candidateTasks.dueAt} IS NOT NULL`,
            lte(candidateTasks.dueAt, sevenDaysFromNow),
            sql`${candidateTasks.status} != 'done'`
          ])
        )
      );

    // Tasks due within 7 days - 7 days ago (to compare week-over-week)
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysFromThen = new Date(sevenDaysAgo);
    sevenDaysFromThen.setDate(sevenDaysFromThen.getDate() + 7);

    const tasksDueHistorical = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(candidateTasks)
      .innerJoin(candidates, eq(candidateTasks.candidateId, candidates.id))
      .where(
        and(
          ...buildTaskScopeConditions([
            sql`${candidateTasks.dueAt} IS NOT NULL`,
            lte(candidateTasks.dueAt, sevenDaysFromThen),
            lte(candidateTasks.createdAt, sevenDaysAgo),
            sql`${candidateTasks.status} != 'done'`,
            sql`(${candidateTasks.completedAt} IS NULL OR ${candidateTasks.completedAt} > ${sevenDaysAgo})`
          ])
        )
      );

    // Overdue tasks - current
    const overdueTasksCurrent = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(candidateTasks)
      .innerJoin(candidates, eq(candidateTasks.candidateId, candidates.id))
      .where(
        and(
          ...buildTaskScopeConditions([
            sql`${candidateTasks.dueAt} IS NOT NULL`,
            sql`${candidateTasks.dueAt} < ${now}`,
            sql`${candidateTasks.status} != 'done'`
          ])
        )
      );

    // Overdue tasks - 7 days ago
    const overdueTasksHistorical = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(candidateTasks)
      .innerJoin(candidates, eq(candidateTasks.candidateId, candidates.id))
      .where(
        and(
          ...buildTaskScopeConditions([
            sql`${candidateTasks.dueAt} IS NOT NULL`,
            sql`${candidateTasks.dueAt} < ${sevenDaysAgo}`,
            lte(candidateTasks.createdAt, sevenDaysAgo),
            sql`${candidateTasks.status} != 'done'`,
            sql`(${candidateTasks.completedAt} IS NULL OR ${candidateTasks.completedAt} > ${sevenDaysAgo})`
          ])
        )
      );

    // Calculate changes
    const calcChange = (current: number, historical: number) => {
      const change = current - historical;
      const changePercent = historical > 0 ? Math.round((change / historical) * 100) : current > 0 ? 100 : 0;
      return { current, change, changePercent };
    };

    const activeCandidatesMetric = calcChange(
      activeCandidatesCurrent[0]?.count ?? 0,
      activeCandidatesHistorical[0]?.count ?? 0
    );

    const tasksDueMetric = calcChange(
      tasksDueCurrent[0]?.count ?? 0,
      tasksDueHistorical[0]?.count ?? 0
    );

    const overdueTasksMetric = calcChange(
      overdueTasksCurrent[0]?.count ?? 0,
      overdueTasksHistorical[0]?.count ?? 0
    );

    const completionRateCurrent =
      (totalCandidatesCurrent[0]?.count ?? 0) > 0
        ? Math.round(((completedCandidatesCurrent[0]?.count ?? 0) / (totalCandidatesCurrent[0]?.count ?? 1)) * 100)
        : 0;

    const completionRateHistorical =
      (totalCandidatesHistorical[0]?.count ?? 0) > 0
        ? Math.round(((completedCandidatesHistorical[0]?.count ?? 0) / (totalCandidatesHistorical[0]?.count ?? 1)) * 100)
        : 0;

    const completionRateMetric = {
      current: completionRateCurrent,
      change: completionRateCurrent - completionRateHistorical,
      changePercent: completionRateCurrent - completionRateHistorical
    };

    return {
      activeCandidates: activeCandidatesMetric,
      tasksDue: tasksDueMetric,
      overdueTasks: overdueTasksMetric,
      completionRate: completionRateMetric
    };
  }

  /**
   * Apply scope filters for authorization
   */
  private applyScopeFilters(
    whereConditions: any[],
    filters: CandidateScopeFilters,
    requireScope = false
  ): void {
    const scopeConditions: any[] = [];
    const departmentIds = filters.departmentIds ? Array.from(new Set(filters.departmentIds)) : [];
    const divisionIds = filters.divisionIds ? Array.from(new Set(filters.divisionIds)) : [];
    const managerIds = filters.managerIds ? Array.from(new Set(filters.managerIds)) : [];
    const candidateIds = filters.candidateIds ? Array.from(new Set(filters.candidateIds)) : [];
    const linkedUserIds = filters.linkedUserIds ? Array.from(new Set(filters.linkedUserIds)) : [];

    if (departmentIds.length > 0) {
      scopeConditions.push(sql`${candidates.departmentId} IN (${sql.join(departmentIds.map(id => sql`${id}::uuid`), sql`, `)})`);
    }
    if (divisionIds.length > 0) {
      scopeConditions.push(sql`${candidates.divisionId} IN (${sql.join(divisionIds.map(id => sql`${id}::uuid`), sql`, `)})`);
    }
    if (managerIds.length > 0) {
      scopeConditions.push(sql`${candidates.managerId} IN (${sql.join(managerIds.map(id => sql`${id}::uuid`), sql`, `)})`);
    }
    if (candidateIds.length > 0) {
      scopeConditions.push(sql`${candidates.id} IN (${sql.join(candidateIds.map(id => sql`${id}::uuid`), sql`, `)})`);
    }
    if (linkedUserIds.length > 0) {
      scopeConditions.push(sql`${candidates.linkedUserId} IN (${sql.join(linkedUserIds.map(id => sql`${id}::uuid`), sql`, `)})`);
    }

    if (scopeConditions.length > 0) {
      const { or } = require("drizzle-orm");
      whereConditions.push(or(...scopeConditions));
    } else if (requireScope) {
      // No scope filters but scope is required - return empty results
      whereConditions.push(sql`FALSE`);
    }
  }
}
