import { MockServiceFactory } from "./mockServiceFactory";
import type { Candidate, CandidateTask, Department, Division, TaskCategory, TaskPriority, TaskDefinition, Template, TemplateStage, TemplateTask, User, AuthProvider } from "@shared/schemas";

export interface SeededAuthorizationFixtures {
  departments: Record<string, string>;
  divisions: Record<string, string>;
  users: Record<string, string>;
  candidates: Record<string, string>;
  templates: Record<string, string>;
  tasks: Record<string, string>;
}

const ids = {
  departments: {
    alpha: "11111111-1111-1111-1111-111111111111",
    beta: "22222222-2222-2222-2222-222222222222"
  },
  divisions: {
    alpha: "33333333-3333-3333-3333-333333333333",
    beta: "44444444-4444-4444-4444-444444444444"
  },
  candidateTypes: {
    faculty: "55555555-5555-5555-5555-555555555555"
  },
  facultyRanks: {
    instructor: "66666666-6666-6666-6666-666666666666"
  },
  taskCategories: {
    onboarding: "77777777-7777-7777-7777-777777777777"
  },
  taskPriorities: {
    medium: "88888888-8888-8888-8888-888888888888"
  },
  hiringStages: {
    offer: "99999999-9999-9999-9999-999999999999"
  },
  templates: {
    onboarding: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
  },
  templateStages: {
    offer: "cccccccc-cccc-cccc-cccc-cccccccccccc"
  },
  taskDefinitions: {
    provisioning: "dddddddd-dddd-dddd-dddd-dddddddddddd"
  },
  templateTasks: {
    provisioning: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"
  },
  users: {
    systemAdmin: "f1111111-1111-1111-1111-111111111111",
    hrStaff: "f2222222-2222-2222-2222-222222222222",
    departmentAdmin: "f3333333-3333-3333-3333-333333333333",
    divisionLeader: "f4444444-4444-4444-4444-444444444444",
    manager: "f5555555-5555-5555-5555-555555555555",
    dualRole: "f6666666-6666-6666-6666-666666666666",
    candidateUser: "f7777777-7777-7777-7777-777777777777"
  },
  candidates: {
    alphaPrimary: "f8888888-8888-8888-8888-888888888888",
    betaCandidate: "f9999999-9999-9999-9999-999999999999",
    managedOnly: "fababab0-0000-0000-0000-000000000000"
  },
  candidateTasks: {
    alphaTask: "fcdcdcdc-dcdc-dcdc-dcdc-dcdcdcdcdcdc",
    betaTask: "fdeedeee-deee-deee-deee-deeedeeedeee",
    managedTask: "fff0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0"
  }
} as const;

const now = new Date("2024-01-01T00:00:00Z");

function makeDepartment(overrides: Partial<Department>): Department {
  return {
    id: overrides.id!,
    name: overrides.name ?? "Department",
    archived: overrides.archived ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now
  } as Department;
}

function makeDivision(overrides: Partial<Division>): Division {
  return {
    id: overrides.id!,
    departmentId: overrides.departmentId!,
    name: overrides.name ?? "Division",
    archived: overrides.archived ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now
  } as Division;
}

function makeUser(overrides: Partial<User>): User {
  return {
    id: overrides.id!,
    email: overrides.email ?? "user@example.com",
    firstName: overrides.firstName ?? "Test",
    lastName: overrides.lastName ?? "User",
    mentionKey: overrides.mentionKey ?? "test.user",
    passwordHash: overrides.passwordHash ?? null,
    role: overrides.role ?? "hr_staff",
    status: overrides.status ?? "active",
    departmentId: overrides.departmentId ?? null,
    divisionId: overrides.divisionId ?? null,
    active: overrides.active ?? true,
    lastLoginAt: overrides.lastLoginAt ?? null,
    authProvider: overrides.authProvider ?? "local",
    externalId: overrides.externalId ?? null,
    username: overrides.username ?? null,
    emailVerified: overrides.emailVerified ?? true,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now
  } as User;
}

function makeCandidate(overrides: Partial<Candidate>): Candidate {
  return {
    id: overrides.id!,
    salutation: overrides.salutation ?? "Dr.",
    firstName: overrides.firstName ?? "First",
    lastName: overrides.lastName ?? "Last",
    email: overrides.email ?? "candidate@example.com",
    candidateTypeId: overrides.candidateTypeId!,
    departmentId: overrides.departmentId!,
    divisionId: overrides.divisionId ?? null,
    managerId: overrides.managerId ?? null,
    facultyRankId: overrides.facultyRankId ?? null,
    offerLetterIssuedAt: overrides.offerLetterIssuedAt ?? now,
    offerLetterAcceptedAt: overrides.offerLetterAcceptedAt ?? now,
    anticipatedStartDate: overrides.anticipatedStartDate ?? now,
    status: overrides.status ?? "active",
    primaryOwnerId: overrides.primaryOwnerId ?? null,
    linkedUserId: overrides.linkedUserId ?? null,
    currentStageId: overrides.currentStageId ?? null,
    templateAppliedFromId: overrides.templateAppliedFromId ?? null,
    templateAppliedAt: overrides.templateAppliedAt ?? null,
    templateLocked: overrides.templateLocked ?? false,
    templateNameSnapshot: overrides.templateNameSnapshot ?? null,
    templateVersion: overrides.templateVersion ?? 1,
    archived: overrides.archived ?? false,
    archivedAt: overrides.archivedAt ?? null,
    archivedBy: overrides.archivedBy ?? null,
    isBlockedByPriorStage: overrides.isBlockedByPriorStage ?? false,
    blockerSummary: overrides.blockerSummary ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now
  } as Candidate;
}

function makeTask(overrides: Partial<CandidateTask>): CandidateTask {
  return {
    id: overrides.id!,
    candidateId: overrides.candidateId!,
    taskDefId: overrides.taskDefId ?? null,
    title: overrides.title ?? "Task",
    description: overrides.description ?? null,
    stageId: overrides.stageId!,
    templateStageId: overrides.templateStageId ?? null,
    phaseSnapshot: overrides.phaseSnapshot ?? null,
    assigneeKind: overrides.assigneeKind ?? "user",
    assigneeUserId: overrides.assigneeUserId ?? null,
    assigneeRole: overrides.assigneeRole ?? null,
    assigneeResolvedAt: overrides.assigneeResolvedAt ?? null,
    priority: overrides.priority ?? "medium",
    categoryId: overrides.categoryId!,
    dueAt: overrides.dueAt ?? now,
    dueRuleType: overrides.dueRuleType ?? "days_after_start",
    dueRuleValue: overrides.dueRuleValue ?? 3,
    fixedDate: overrides.fixedDate ?? null,
    pendingAnchor: overrides.pendingAnchor ?? false,
    status: overrides.status ?? "todo",
    completedAt: overrides.completedAt ?? null,
    cancelReason: overrides.cancelReason ?? null,
    notes: overrides.notes ?? null,
    required: overrides.required ?? true,
    archived: overrides.archived ?? false,
    stageOrderIndex: overrides.stageOrderIndex ?? null,
    updatedBy: overrides.updatedBy ?? null,
    deletedAt: overrides.deletedAt ?? null,
    dueSoonNotifiedAt: overrides.dueSoonNotifiedAt ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now
  } as CandidateTask;
}

function makeTaskCategory(overrides: Partial<TaskCategory>): TaskCategory {
  return {
    id: overrides.id!,
    name: overrides.name ?? "Category",
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now
  } as TaskCategory;
}

function makeTaskPriority(overrides: Partial<TaskPriority>): TaskPriority {
  return {
    id: overrides.id!,
    name: overrides.name ?? "medium",
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now
  } as TaskPriority;
}

function makeTaskDefinition(overrides: Partial<TaskDefinition>): TaskDefinition {
  return {
    id: overrides.id!,
    name: overrides.name ?? "Task Definition",
    description: overrides.description ?? null,
    archived: overrides.archived ?? false,
    createdBy: overrides.createdBy ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now
  } as TaskDefinition;
}

function makeTemplate(overrides: Partial<Template>): Template {
  return {
    id: overrides.id!,
    name: overrides.name ?? "Template",
    candidateTypeId: overrides.candidateTypeId!,
    description: overrides.description ?? null,
    isActive: overrides.isActive ?? true,
    archived: overrides.archived ?? false,
    createdBy: overrides.createdBy ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now
  } as Template;
}

function makeTemplateStage(overrides: Partial<TemplateStage>): TemplateStage {
  return {
    id: overrides.id!,
    templateId: overrides.templateId!,
    stageId: overrides.stageId!,
    orderIndex: overrides.orderIndex ?? 1,
    isActive: overrides.isActive ?? true,
    phase: overrides.phase ?? "pre_hire",
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now
  } as TemplateStage;
}

function makeTemplateTask(overrides: Partial<TemplateTask>): TemplateTask {
  return {
    id: overrides.id!,
    templateId: overrides.templateId!,
    taskDefId: overrides.taskDefId!,
    stageId: overrides.stageId!,
    templateStageId: overrides.templateStageId!,
    dueRuleType: overrides.dueRuleType ?? "days_after_start",
    dueRuleValue: overrides.dueRuleValue ?? 3,
    fixedDate: overrides.fixedDate ?? null,
    defaultAssigneeKind: overrides.defaultAssigneeKind ?? "user",
    defaultAssigneeUserId: overrides.defaultAssigneeUserId ?? null,
    defaultAssigneeRole: overrides.defaultAssigneeRole ?? null,
    defaultPriorityId: overrides.defaultPriorityId ?? null,
    defaultCategoryId: overrides.defaultCategoryId ?? null,
    isRequired: overrides.isRequired ?? true,
    archived: overrides.archived ?? false,
    createdBy: overrides.createdBy ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now
  } as TemplateTask;
}

function makeAuthProvider(overrides: Partial<AuthProvider>): AuthProvider {
  return {
    id: overrides.id!,
    name: overrides.name ?? "Provider",
    enabled: overrides.enabled ?? true,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now
  } as AuthProvider;
}

export async function seedAuthorizationFixtures(storage: MockServiceFactory): Promise<SeededAuthorizationFixtures> {
  storage.reset();

  const departments: Department[] = [
    makeDepartment({ id: ids.departments.alpha, name: "Office of Faculty Affairs" }),
    makeDepartment({ id: ids.departments.beta, name: "Graduate Medical Education" })
  ];
  departments.forEach((dept) => storage.upsertDepartment(dept));

  const divisions: Division[] = [
    makeDivision({ id: ids.divisions.alpha, departmentId: ids.departments.alpha, name: "Academic Operations" }),
    makeDivision({ id: ids.divisions.beta, departmentId: ids.departments.beta, name: "Clinical Programs" })
  ];
  divisions.forEach((division) => storage.upsertDivision(division));

  const taskCategory = makeTaskCategory({ id: ids.taskCategories.onboarding, name: "Onboarding" });
  storage.upsertTaskCategory(taskCategory);

  const priority = makeTaskPriority({ id: ids.taskPriorities.medium, name: "medium" as any });
  storage.upsertTaskPriority(priority);

  const taskDefinition = makeTaskDefinition({ id: ids.taskDefinitions.provisioning, name: "Provision Accounts", createdBy: ids.users.systemAdmin });
  storage.upsertTaskDefinition(taskDefinition);

  const template = makeTemplate({ id: ids.templates.onboarding, name: "Faculty Onboarding", candidateTypeId: ids.candidateTypes.faculty, createdBy: ids.users.systemAdmin });
  storage.upsertTemplate(template);

  const templateStage = makeTemplateStage({ id: ids.templateStages.offer, templateId: template.id, stageId: ids.hiringStages.offer, orderIndex: 1 });
  storage.upsertTemplateStage(templateStage);

  const templateTask = makeTemplateTask({
    id: ids.templateTasks.provisioning,
    templateId: template.id,
    taskDefId: taskDefinition.id,
    stageId: ids.hiringStages.offer,
    templateStageId: templateStage.id,
    defaultPriorityId: priority.id,
    defaultCategoryId: taskCategory.id,
    createdBy: ids.users.systemAdmin
  });
  storage.upsertTemplateTask(templateTask);

  const authProviders: AuthProvider[] = [
    makeAuthProvider({ id: "local", name: "Local Accounts", enabled: true }),
    makeAuthProvider({ id: "ldap", name: "LDAP", enabled: false })
  ];
  authProviders.forEach((provider) => storage.upsertAuthProvider(provider));

  storage.setSystemSetting("rate-limiting", { windowMs: 60000, max: 20 });

  const users: User[] = [
    makeUser({
      id: ids.users.systemAdmin,
      email: "system.admin@example.com",
      firstName: "System",
      lastName: "Admin",
      mentionKey: "system.admin",
      role: "system_admin",
      departmentId: ids.departments.alpha
    }),
    makeUser({
      id: ids.users.hrStaff,
      email: "hr.staff@example.com",
      firstName: "HR",
      lastName: "Staff",
      mentionKey: "hr.staff",
      role: "hr_staff",
      departmentId: ids.departments.alpha
    }),
    makeUser({
      id: ids.users.departmentAdmin,
      email: "dept.admin@example.com",
      firstName: "Dept",
      lastName: "Admin",
      mentionKey: "dept.admin",
      role: "department_admin",
      departmentId: ids.departments.alpha
    }),
    makeUser({
      id: ids.users.divisionLeader,
      email: "division.leader@example.com",
      firstName: "Division",
      lastName: "Leader",
      mentionKey: "division.leader",
      role: "division_leader",
      departmentId: ids.departments.alpha,
      divisionId: ids.divisions.alpha
    }),
    makeUser({
      id: ids.users.manager,
      email: "manager@example.com",
      firstName: "Team",
      lastName: "Manager",
      mentionKey: "team.manager",
      role: "manager",
      departmentId: ids.departments.alpha
    }),
    makeUser({
      id: ids.users.dualRole,
      email: "dual.role@example.com",
      firstName: "Dual",
      lastName: "Role",
      mentionKey: "dual.role",
      role: "hr_staff",
      departmentId: ids.departments.beta
    }),
    makeUser({
      id: ids.users.candidateUser,
      email: "candidate@example.com",
      firstName: "Cand",
      lastName: "User",
      mentionKey: "cand.user",
      role: "candidate"
    })
  ];

  users.forEach((user) => {
    const extras: { roles?: string[]; departmentScopes?: string[]; divisionScopes?: string[]; managedCandidateIds?: string[] } = {};
    if (user.id === ids.users.departmentAdmin) {
      extras.departmentScopes = [ids.departments.alpha];
    }
    if (user.id === ids.users.divisionLeader) {
      extras.divisionScopes = [ids.divisions.alpha];
    }
    if (user.id === ids.users.dualRole) {
      extras.roles = ["department_admin", "division_leader"];
      extras.departmentScopes = [ids.departments.beta];
      extras.divisionScopes = [ids.divisions.beta];
    }
    if (user.id === ids.users.manager) {
      extras.managedCandidateIds = [ids.candidates.managedOnly];
    }
    storage.upsertUser(user, extras);
  });

  const candidateAlpha = makeCandidate({
    id: ids.candidates.alphaPrimary,
    firstName: "Alice",
    lastName: "Alpha",
    email: "alice.alpha@example.com",
    candidateTypeId: ids.candidateTypes.faculty,
    departmentId: ids.departments.alpha,
    divisionId: ids.divisions.alpha,
    managerId: ids.users.manager,
    facultyRankId: ids.facultyRanks.instructor,
    primaryOwnerId: ids.users.hrStaff,
    linkedUserId: ids.users.candidateUser,
    currentStageId: ids.hiringStages.offer,
    templateAppliedFromId: ids.templates.onboarding,
    templateAppliedAt: now,
    templateNameSnapshot: "Faculty Onboarding"
  });

  const candidateBeta = makeCandidate({
    id: ids.candidates.betaCandidate,
    firstName: "Betty",
    lastName: "Beta",
    email: "betty.beta@example.com",
    candidateTypeId: ids.candidateTypes.faculty,
    departmentId: ids.departments.beta,
    divisionId: ids.divisions.beta,
    facultyRankId: ids.facultyRanks.instructor,
    primaryOwnerId: ids.users.hrStaff,
    currentStageId: ids.hiringStages.offer,
    templateAppliedFromId: ids.templates.onboarding,
    templateAppliedAt: now,
    templateNameSnapshot: "Faculty Onboarding"
  });

  const managedCandidate = makeCandidate({
    id: ids.candidates.managedOnly,
    firstName: "Miles",
    lastName: "Managed",
    email: "miles.managed@example.com",
    candidateTypeId: ids.candidateTypes.faculty,
    departmentId: ids.departments.beta,
    facultyRankId: ids.facultyRanks.instructor,
    primaryOwnerId: ids.users.hrStaff,
    currentStageId: ids.hiringStages.offer,
    templateAppliedFromId: ids.templates.onboarding,
    templateAppliedAt: now,
    templateNameSnapshot: "Faculty Onboarding"
  });

  storage.upsertCandidate(candidateAlpha);
  storage.upsertCandidate(candidateBeta);
  storage.upsertCandidate(managedCandidate);

  const tasks: CandidateTask[] = [
    makeTask({
      id: ids.candidateTasks.alphaTask,
      candidateId: candidateAlpha.id,
      taskDefId: taskDefinition.id,
      title: "Provision Network Accounts",
      description: "Create network accounts",
      stageId: ids.hiringStages.offer,
      assigneeUserId: ids.users.manager,
      categoryId: taskCategory.id,
      templateStageId: templateStage.id
    }),
    makeTask({
      id: ids.candidateTasks.betaTask,
      candidateId: candidateBeta.id,
      taskDefId: taskDefinition.id,
      title: "Beta Task",
      description: "Review documents",
      stageId: ids.hiringStages.offer,
      assigneeUserId: ids.users.hrStaff,
      categoryId: taskCategory.id,
      templateStageId: templateStage.id
    }),
    makeTask({
      id: ids.candidateTasks.managedTask,
      candidateId: managedCandidate.id,
      taskDefId: taskDefinition.id,
      title: "Managed Task",
      description: "Manager scoped task",
      stageId: ids.hiringStages.offer,
      assigneeUserId: ids.users.manager,
      categoryId: taskCategory.id,
      templateStageId: templateStage.id
    })
  ];

  for (const task of tasks) {
    storage.upsertCandidateTask(task);
  }

  storage.addFollower(candidateAlpha.id, ids.users.hrStaff);

  return {
    departments: ids.departments,
    divisions: ids.divisions,
    users: ids.users,
    candidates: ids.candidates,
    templates: ids.templates,
    tasks: ids.candidateTasks
  };
}
