export type AuthorizationContext = {
  userId: string | null;
  roles: Set<string>;
  departmentIds: Set<string>;
  divisionIds: Set<string>;
  managedCandidateIds: Set<string>;
  privileged: boolean;
  isCandidate: boolean;
};

export type DecodedCursor = {
  next?: string | null;
  prev?: string | null;
  [key: string]: any;
};

export type CandidateScopeFilters = {
  departmentIds?: string[];
  divisionIds?: string[];
  managerIds?: string[];
  candidateIds?: string[];
  linkedUserIds?: string[];
};

export type DivisionActiveCandidateSummary = {
  divisionId: string;
  divisionName?: string;
  departmentId: string;
  departmentName?: string;
  activeCandidateCount: number;
};

export type TemplateExpansionTask = {
  id: string;
  candidateId: string;
  assigneeUserId: string | null;
  assigneeKind: "user" | "role";
  assigneeRole: string | null;
  title: string;
  status: string;
  dueAt: Date | null;
  pendingAnchor: boolean;
};

export type TemplateExpansionResult = {
  createdCount: number;
  createdTasks: TemplateExpansionTask[];
};
