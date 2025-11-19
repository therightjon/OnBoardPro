/**
 * Business Day Utility Functions
 *
 * Provides utilities for calculating business days (excluding weekends)
 * used for timeline estimation and due date calculations.
 */

/**
 * Check if a given date falls on a weekend (Saturday or Sunday)
 */
function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

/**
 * Add a specified number of business days to a start date
 * Skips weekends when counting business days
 *
 * @param startDate - The starting date
 * @param businessDays - Number of business days to add
 * @returns New date after adding business days
 */
export function addBusinessDays(startDate: Date, businessDays: number): Date {
  let result = new Date(startDate);
  let remainingDays = businessDays;

  while (remainingDays > 0) {
    result.setDate(result.getDate() + 1);

    // Only count non-weekend days
    if (!isWeekend(result)) {
      remainingDays--;
    }
  }

  return result;
}

/**
 * Count the number of business days between two dates
 * Excludes weekends from the count
 *
 * @param startDate - The start date
 * @param endDate - The end date
 * @returns Number of business days between the dates
 */
export function countBusinessDays(startDate: Date, endDate: Date): number {
  let count = 0;
  let current = new Date(startDate);

  while (current <= endDate) {
    if (!isWeekend(current)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}
