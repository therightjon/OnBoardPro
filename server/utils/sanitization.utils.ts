/**
 * Sanitizes candidate data for candidate users by removing sensitive internal fields
 * and only returning fields that candidates should have access to
 * @param candidate - The candidate object to sanitize
 * @returns Sanitized candidate object with only allowed fields
 */
export function sanitizeCandidateForCandidateUser(candidate: any) {
  if (!candidate) return candidate;
  const {
    id,
    salutation,
    firstName,
    lastName,
    email,
    status,
    anticipatedStartDate,
    offerLetterIssuedAt,
    offerLetterAcceptedAt,
    department,
    division,
    candidateType,
    currentStage,
    createdAt,
    updatedAt
  } = candidate;
  return {
    id,
    salutation,
    firstName,
    lastName,
    email,
    status,
    anticipatedStartDate,
    offerLetterIssuedAt,
    offerLetterAcceptedAt,
    department: department ? { id: department.id, name: department.name } : null,
    division: division ? { id: division.id, name: division.name } : null,
    candidateType,
    currentStage,
    createdAt,
    updatedAt
  };
}

/**
 * Sanitizes task data for candidate users by removing sensitive internal fields
 * and only returning fields that candidates should have access to
 * @param task - The task object to sanitize
 * @returns Sanitized task object with only allowed fields
 */
export function sanitizeTaskForCandidateUser(task: any) {
  if (!task) return task;
  const allowed = [
    "id",
    "candidateId",
    "title",
    "status",
    "dueAt",
    "pendingAnchor",
    "phaseSnapshot",
    "dueRuleType",
    "dueRuleValue",
    "fixedDate"
  ];
  return Object.fromEntries(
    allowed
      .map((key) => [key, key in task ? task[key] ?? task[key] : undefined] as const)
      .filter(([, value]) => value !== undefined)
  );
}
