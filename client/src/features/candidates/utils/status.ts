export type CandidateLifecycleStatus =
  | "draft"
  | "active"
  | "on_hold"
  | "completed"
  | "canceled"
  | "offer_declined"
  | "archived";

export type ResolvedCandidateStatusKey = CandidateLifecycleStatus | "unknown";

export type CandidateStatusTone = "primary" | "success" | "warning" | "danger" | "muted" | "info";

export type CandidateStatusLike = {
  status?: string | null;
  archived?: boolean | null;
};

export type ResolvedCandidateStatus = {
  status: ResolvedCandidateStatusKey;
  label: string;
  tone: CandidateStatusTone;
  badgeClass: string;
  isArchived: boolean;
  isCanceled: boolean;
  isOfferDeclined: boolean;
  isCompleted: boolean;
};

export type CandidateTaskLike = {
  status?: string | null;
};

export const CANDIDATE_STATUS_PRIORITY: CandidateLifecycleStatus[] = [
  "archived",
  "canceled",
  "offer_declined",
  "completed",
  "on_hold",
  "active",
  "draft"
];

const STATUS_LABELS: Record<ResolvedCandidateStatusKey, string> = {
  archived: "Archived",
  canceled: "Canceled",
  offer_declined: "Offer Declined",
  completed: "Completed",
  on_hold: "On Hold",
  active: "Active",
  draft: "Draft",
  unknown: "Unknown"
};

const STATUS_BADGE_CLASSES: Record<ResolvedCandidateStatusKey, string> = {
  active: "bg-accent/10 text-accent",
  draft: "bg-chart-3/10 text-chart-3",
  completed: "bg-chart-5/10 text-chart-5",
  on_hold: "bg-chart-4/10 text-chart-4",
  canceled: "bg-destructive/10 text-destructive",
  offer_declined: "bg-destructive/10 text-destructive",
  archived: "bg-muted text-muted-foreground",
  unknown: "bg-muted text-muted-foreground"
};

const STATUS_TONES: Record<ResolvedCandidateStatusKey, CandidateStatusTone> = {
  active: "primary",
  draft: "muted",
  completed: "success",
  on_hold: "warning",
  canceled: "danger",
  offer_declined: "danger",
  archived: "muted",
  unknown: "muted"
};

export const normalizeCandidateStatus = (status?: string | null): ResolvedCandidateStatusKey => {
  const key = (status ?? "").toString().trim().toLowerCase();
  if ((CANDIDATE_STATUS_PRIORITY as string[]).includes(key)) {
    return key as CandidateLifecycleStatus;
  }
  return "unknown";
};

export const candidateStatusBadgeClass = (status: ResolvedCandidateStatusKey) =>
  STATUS_BADGE_CLASSES[status] ?? STATUS_BADGE_CLASSES.unknown;

export function resolveCandidateStatus(
  candidate?: CandidateStatusLike | null
): ResolvedCandidateStatus {
  const normalized = normalizeCandidateStatus(candidate?.status);

  const resolved: ResolvedCandidateStatusKey =
    candidate?.archived || normalized === "archived"
      ? "archived"
      : normalized === "canceled"
        ? "canceled"
        : normalized === "offer_declined"
          ? "offer_declined"
          : normalized === "completed"
            ? "completed"
          : normalized === "on_hold"
            ? "on_hold"
            : normalized === "active"
              ? "active"
                : normalized === "draft"
                  ? "draft"
                  : "unknown";

  return {
    status: resolved,
    label: STATUS_LABELS[resolved],
    badgeClass: STATUS_BADGE_CLASSES[resolved],
    tone: STATUS_TONES[resolved],
    isArchived: resolved === "archived",
    isCanceled: resolved === "canceled",
    isOfferDeclined: resolved === "offer_declined",
    isCompleted: resolved === "completed"
  };
}

export type CandidateTaskSummary = {
  total: number;
  completed: number;
  canceled: number;
  open: number;
  allDone: boolean;
  allClosed: boolean;
};

export const summarizeCandidateTasks = (tasks: CandidateTaskLike[] = []): CandidateTaskSummary => {
  const normalized = tasks.map((t) => (t?.status ?? "").toString().toLowerCase());
  const completed = normalized.filter((s) => s === "done").length;
  const canceled = normalized.filter((s) => s === "canceled").length;
  const total = normalized.length;
  const open = total - completed - canceled;
  const allDone = total > 0 && completed === total;
  const allClosed = total > 0 && completed + canceled === total;
  return { total, completed, canceled, open, allDone, allClosed };
};

export const isCandidateFullyOnboarded = (
  candidate: CandidateStatusLike | null | undefined,
  tasks: CandidateTaskLike[]
) => {
  const status = normalizeCandidateStatus(candidate?.status);
  const summary = summarizeCandidateTasks(tasks);
  return status === "completed" && summary.allDone;
};
