/**
 * Date Utility Functions
 *
 * Provides utilities for date manipulation, normalization, and anchor resolution
 * used throughout the application for due date calculations and timeline management.
 */

import type { Candidate } from "@shared/schemas";

export type AnchorKey = 'loi' | 'loo' | 'start';
export type AnchorDates = Record<AnchorKey, Date | null>;

export const MS_PER_DAY = 1000 * 60 * 60 * 24;

export type DueComputationResult = {
  dueAt: Date | null;
  pendingAnchor: boolean;
  anchorType?: AnchorKey;
  missingAnchor?: AnchorKey;
};

/**
 * Normalize a date to UTC midnight (00:00:00.000)
 * This ensures consistent date handling across timezones
 */
export const normalizeToUtcDate = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

/**
 * Add days to a date, preserving UTC midnight normalization
 */
export function addDays(base: Date, amount: number): Date {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + amount));
}

/**
 * Convert input to a normalized UTC date or null if invalid
 */
export function ensureDate(input?: Date | string | null): Date | null {
  if (!input) return null;
  const date = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return normalizeToUtcDate(date);
}

/**
 * Resolve the Letter of Intent (LOI) anchor date for a candidate
 */
export function resolveLoiAnchor(candidate: Candidate): Date | null {
  return ensureDate(candidate.letterOfIntentDate);
}

/**
 * Resolve the Letter of Offer (LOO) anchor date for a candidate
 * Uses accepted date if available, falls back to issued date
 */
export function resolveLooAnchor(candidate: Candidate): Date | null {
  return (
    ensureDate((candidate as any).offerLetterAcceptedAt) ??
    ensureDate((candidate as any).offerLetterIssuedAt) ??
    ensureDate((candidate as any).looDate)
  );
}

/**
 * Resolve the start date anchor for a candidate
 */
export function resolveStartAnchor(candidate: Candidate): Date | null {
  return ensureDate(candidate.anticipatedStartDate);
}

/**
 * Compute a due date based on a rule type, value, and available anchors
 *
 * @param ruleType - The type of due date rule (e.g., "on_loo_date", "days_before_start")
 * @param ruleValue - The numeric value for the rule (e.g., number of days)
 * @param fixedDate - A fixed date if the rule type is "fixed_date"
 * @param anchors - Available anchor dates (LOO and start dates)
 * @returns Due date computation result with pending anchor information
 */
export function computeDueFromRule(
  ruleType: string | null | undefined,
  ruleValue: number | null | undefined,
  fixedDate: Date | string | null | undefined,
  anchors: AnchorDates
): DueComputationResult {
  const applyAnchor = (anchorKey: AnchorKey, offsetDays: number): DueComputationResult => {
    const anchor = anchors[anchorKey];
    if (!anchor) {
      return { dueAt: null, pendingAnchor: true, missingAnchor: anchorKey };
    }
    return { dueAt: addDays(anchor, offsetDays), pendingAnchor: false, anchorType: anchorKey };
  };

  switch (ruleType) {
    case "on_loi_date":
      return applyAnchor("loi", 0);
    case "days_before_loi":
      return applyAnchor("loi", -1 * (ruleValue ?? 0));
    case "days_after_loi":
      return applyAnchor("loi", ruleValue ?? 0);
    case "on_loo_date":
      return applyAnchor("loo", 0);
    case "days_before_loo":
      return applyAnchor("loo", -1 * (ruleValue ?? 0));
    case "days_after_loo":
      return applyAnchor("loo", ruleValue ?? 0);
    case "on_start_date":
      return applyAnchor("start", 0);
    case "days_before_start":
      return applyAnchor("start", -1 * (ruleValue ?? 0));
    case "days_after_start":
      return applyAnchor("start", ruleValue ?? 0);
    case "fixed_date": {
      const date = ensureDate(fixedDate);
      if (!date) {
        return { dueAt: null, pendingAnchor: true };
      }
      return { dueAt: date, pendingAnchor: false };
    }
    case "days_before_stage":
    case "days_after_stage":
      // Stage-relative rules will be determined dynamically later.
      return { dueAt: null, pendingAnchor: false };
    default:
      return { dueAt: null, pendingAnchor: false };
  }
}
