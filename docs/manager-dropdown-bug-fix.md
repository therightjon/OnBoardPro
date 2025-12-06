# Manager Dropdown Bug Fix - Context & Solutions

## Original Issue
When trying to update the manager on the edit candidate dialog, the dropdown was not displaying managers when selecting a division that has managers present.

## Root Causes Identified

### 1. Frontend: React Query Dependency Issue
**Problem:** `form.watch('divisionId')` was being called inside the `queryKey` and `queryFn` of the managers query. React Query doesn't recognize these inline watch calls as dependencies, so the query wouldn't re-run when the division changed.

**Fix:** 
- Added `const selectedDivisionId = form.watch("divisionId");` at component level
- Updated managers query to use `selectedDivisionId` in both `queryKey` and `queryFn`

### 2. Frontend: Uncontrolled Select Components
**Problem:** All `Select` components were using `defaultValue={field.value}` instead of `value={field.value}`, making them uncontrolled. This prevented them from visually updating when form state changed programmatically (e.g., when clearing division after department change).

**Fix:** Changed all `Select` components from `defaultValue` to `value`:
- Salutation Select
- Department Select
- Division Select
- Manager Select
- Faculty Rank Select

### 3. Backend: Incorrect Division Filtering Logic
**Problem:** The `getManagersByDepartment` method in `DivisionRepository.ts` had flawed either/or logic:
```typescript
// BEFORE (WRONG)
if (divisionId) {
  whereConditions.push(eq(users.divisionId, divisionId));
} else {
  whereConditions.push(eq(users.departmentId, departmentId));
}
```
This meant when a division was selected, it ONLY returned managers with that specific `divisionId`, excluding department-level managers (where `divisionId IS NULL`).

**Fix:** Changed to always filter by department, and when division is selected, include BOTH division-specific AND department-level managers:
```typescript
// AFTER (CORRECT)
let whereConditions = [
  eq(users.active, true),
  inArray(users.role, allowedRoles as any[]),
  eq(users.departmentId, departmentId)  // Always filter by department
];

if (divisionId) {
  whereConditions.push(
    or(
      eq(users.divisionId, divisionId),    // Division-specific managers
      isNull(users.divisionId)              // Department-level managers
    )!
  );
}
```

## Files Modified

### Frontend
- `/client/src/features/candidates/components/edit-candidate-dialog.tsx`
  - Added `selectedDivisionId` watch
  - Updated managers query dependencies
  - Changed all Select components from uncontrolled to controlled

### Backend
- `/server/repositories/organizational/DivisionRepository.ts`
  - Fixed `getManagersByDepartment` filtering logic
  - Added `isNull` import from drizzle-orm

## Expected Behavior After Fix

1. **No division selected:** Returns all managers in the department (both department-level and all division-level managers)
2. **Division selected:** Returns managers that are either:
   - Assigned to that specific division, OR
   - Assigned to the department but no specific division (department-level managers available across all divisions)
3. **Department changed:** Division and manager selects properly clear and reset
4. **Division changed:** Manager dropdown immediately updates with correct filtered list

## Key Insight
The data model allows managers to be assigned at the department level (`divisionId IS NULL`) or at the division level (`divisionId` has a value). Department-level managers should be available to all divisions within that department, which is why they must be included when filtering by division.
