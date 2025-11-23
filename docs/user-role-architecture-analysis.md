# User Role Architecture Analysis & Recommendations

**Date:** November 23, 2025
**Status:** 🚨 Critical Issue - Architecture Mismatch Detected
**Priority:** High - Blocks Schema Consolidation

---

## Executive Summary

A critical architectural inconsistency exists in the user role management system. The client-side schemas expect multi-role capability via a `roles` array, while the database and server implementation use a single `role` field. This mismatch creates confusion, potential bugs, and blocks schema consolidation efforts.

**Impact:**
- ❌ Client forms may mislead users about multi-role capability
- ❌ Data structure mismatch between frontend and backend
- ❌ Blocks consolidation of 3 client schemas (userSchema, createUserSchema, editUserSchema)
- ⚠️ Authorization middleware uses single role only
- ⚠️ Potential for data loss if multi-role submissions are ignored

---

## Current State Analysis

### Database Schema

#### Primary Role (users table)
```sql
-- users.role column (PRIMARY role - single value)
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  mention_key TEXT UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL,  -- ENUM: system_admin | hr_staff | department_admin | division_leader | manager | candidate
  status TEXT NOT NULL,
  email_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Multi-Role Junction Table (userRoles)
```sql
-- userRoles table (ADDITIONAL roles - many-to-many relationship)
CREATE TABLE user_roles (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,  -- Same enum as users.role
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, role)
);
```

**Analysis:**
- ✅ Database SUPPORTS multi-role via `userRoles` junction table
- ✅ Users can have ONE primary role + MULTIPLE additional roles
- ❓ Current usage of `userRoles` table is UNKNOWN (may be unused)

---

### Server-Side Implementation

#### Authorization Middleware (`server/middleware/authorization.ts`)
```typescript
export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Uses SINGLE role from req.user.role
  next();
};

export function requireRole(roles: string[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Checks ONLY primary role (req.user.role)
    if (!roles.includes(req.user.role)) {
      reportAuthorizationFailure(req.user.id, req.path, req.user.role);
      return res.status(403).json({ message: "Forbidden" });
    }

    next();
  };
}
```

**Observations:**
- ⚠️ Authorization middleware ONLY checks `req.user.role` (primary role)
- ⚠️ Additional roles in `userRoles` table are IGNORED by auth system
- 🔴 Multi-role table exists but is NOT utilized in authorization logic

---

### Client-Side Implementation

#### User Schema (`client/src/app/(dashboard)/settings/page.tsx:68-86`)
```typescript
const userSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  passwordHash: z.string().optional(),
  role: z.string().min(1, "Role is required"),        // ← Single role (primary)
  status: z.string().min(1, "Status is required"),
  departmentId: z.string().min(1, "Department is required"),
  divisionId: z.string().min(1, "Division is required"),
  roles: z.array(z.string()).optional(),              // ← Role ARRAY!
});

const createUserSchema = userSchema.extend({
  passwordHash: z.string().min(6, "Password must be at least 6 characters"),
});

const editUserSchema = userSchema.extend({
  passwordHash: z.string().min(6, "Password must be at least 6 characters").or(z.literal("")),
});
```

**Critical Issues:**
1. 🔴 **Dual role fields**: Has BOTH `role` (string) AND `roles` (array)
2. 🔴 **Confusion**: Which is source of truth?
3. 🔴 **UI Mismatch**: Client may display multi-role selection that backend ignores
4. 🔴 **Data Loss Risk**: If UI collects `roles` array but API only processes `role`

---

### Shared Schema

#### User Schema (`shared/schemas/auth.schema.ts`)
```typescript
// Database table definition
export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  mentionKey: text("mention_key").unique(),
  passwordHash: text("password_hash"),
  role: appRoleEnum("role").notNull(),  // ← Single role ENUM
  status: userStatusEnum("status").notNull(),
  emailVerified: boolean("email_verified").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// Zod insert schema
export const insertUserSchema = createInsertSchema(users);
// Generated type has: role: "system_admin" | "hr_staff" | ...
```

**Analysis:**
- ✅ Shared schema correctly uses single `role` enum
- ✅ Aligns with database `users` table structure
- ❌ Client schema diverges with `roles` array addition

---

## Problem Statement

### The Mismatch

| Layer | Role Handling | Status |
|-------|---------------|--------|
| **Database (users table)** | Single `role` column (primary role) | ✅ Clear |
| **Database (userRoles table)** | Multiple roles via junction table | ⚠️ Exists but unused |
| **Server Authorization** | Uses single `req.user.role` only | ✅ Consistent with primary |
| **Shared Schema** | Single `role` field (enum) | ✅ Matches database |
| **Client Schema** | Has BOTH `role` (string) AND `roles` (array) | 🔴 **MISMATCH** |

### Consequences

1. **User Confusion**: UI may show multi-role selection that doesn't work
2. **Data Integrity**: Client collects data (roles array) that's ignored/lost
3. **Schema Consolidation Blocked**: Cannot safely consolidate client schemas with shared
4. **Authorization Gaps**: Additional roles in `userRoles` table aren't checked
5. **Maintenance Burden**: Dual schemas create technical debt

---

## Investigation Questions

Before proceeding with recommendations, these questions need answers:

### 1. Multi-Role Requirement
**Q:** Do users need multiple roles simultaneously?

**Examples:**
- User is both "hr_staff" AND "department_admin"?
- User has "manager" role for Dept A and "division_leader" for Division B?

**Current Reality:**
- ❌ Authorization middleware doesn't support this
- ❌ `userRoles` table exists but is unused
- ❌ Single `role` in users table is authoritative

### 2. Historical Context
**Q:** Why does `userRoles` table exist?

**Possibilities:**
- Legacy feature that was never fully implemented
- Planned feature that was partially completed
- Leftover from migration from another system
- Intentional design for future use

### 3. UI Behavior
**Q:** What does the user creation/edit form actually display?

**Need to verify:**
- Does UI show multi-select for roles?
- What happens when user selects multiple roles?
- Is the `roles` array ever populated?
- Does API accept/process `roles` array?

### 4. Current Production Data
**Q:** Are there ANY records in `userRoles` table?

```sql
-- Check if userRoles is used
SELECT COUNT(*) FROM user_roles;
SELECT * FROM user_roles LIMIT 5;
```

**If count = 0:** Table is unused, safe to deprecate
**If count > 0:** Need migration strategy

---

## Recommendations

### Option 1: Single Role Per User (RECOMMENDED)

**Approach:** Simplify to one role per user, deprecate multi-role capability

**Rationale:**
- ✅ Aligns with current authorization implementation
- ✅ Simplest architecture (KISS principle)
- ✅ Matches RBAC best practices (one role with granular permissions)
- ✅ Easier to audit and manage
- ✅ Current codebase already implements this

**Implementation Steps:**

1. **Remove `roles` array from client schemas**
   ```typescript
   // BEFORE
   const userSchema = z.object({
     role: z.string().min(1, "Role is required"),
     roles: z.array(z.string()).optional(),  // ← REMOVE THIS
     // ...
   });

   // AFTER
   const userSchema = insertUserSchema.pick({
     firstName: true,
     lastName: true,
     email: true,
     role: true,
     status: true,
     departmentId: true,
     divisionId: true,
   });
   ```

2. **Update UI forms**
   - Change multi-select to single-select for role
   - Remove any role array handling in submission logic
   - Update form labels to clarify single role

3. **Deprecate `userRoles` table**
   - Add migration to drop table (if count = 0)
   - If data exists, migrate to primary role or create backup

4. **Update API validation**
   - Ensure API rejects `roles` array if submitted
   - Use shared `insertUserSchema` for validation

**Migration Risks:** ⚠️ Low (if `userRoles` table is empty)

---

### Option 2: Full Multi-Role Support (COMPLEX)

**Approach:** Implement complete multi-role system across all layers

**Requires:**
1. ❌ Update authorization middleware to check both `users.role` AND `userRoles` table
2. ❌ Modify `req.user` to include `roles: string[]` array
3. ❌ Update all `requireRole()` calls to handle array checking
4. ❌ Create API endpoints for managing user roles (add/remove)
5. ❌ Implement role hierarchy/precedence logic
6. ❌ Update client UI to properly display/edit multiple roles
7. ❌ Write comprehensive tests for multi-role scenarios

**Challenges:**
- 🔴 High complexity, significant development effort
- 🔴 Performance impact (extra DB query on every auth check)
- 🔴 Role conflict resolution (what if user has conflicting permissions?)
- 🔴 Audit complexity (which role was used for action?)

**When to choose:**
- User explicitly requires multi-role capability
- Current authorization model is insufficient for business needs
- Willing to invest 2-3 weeks of development time

**Migration Risks:** 🔴 High (touching critical auth system)

---

### Option 3: Role Hierarchies (MIDDLE GROUND)

**Approach:** Keep single role, add permission inheritance

**Concept:**
```typescript
// Instead of multiple roles, roles inherit permissions
const roleHierarchy = {
  system_admin: ["all_permissions"],
  hr_staff: ["manage_users", "manage_candidates", "view_reports"],
  department_admin: ["manage_department_users", "view_department_reports"],
  manager: ["view_team", "manage_team_tasks"],
  candidate: ["view_own_profile"],
};

// Check permissions instead of roles
function hasPermission(user: User, permission: string): boolean {
  const permissions = roleHierarchy[user.role] || [];
  return permissions.includes(permission) || permissions.includes("all_permissions");
}
```

**Benefits:**
- ✅ Single role per user (simpler)
- ✅ Flexible permission system
- ✅ Can add granular permissions without changing DB
- ✅ Easier to audit than multi-role

**Implementation:**
1. Define permission sets for each role
2. Create `hasPermission(user, permission)` helper
3. Replace role checks with permission checks gradually
4. Keep single role in database

**Migration Risks:** ⚠️ Medium (requires refactoring auth checks)

---

### Option 4: Department/Division Scopes (ALREADY EXISTS!)

**Approach:** Leverage existing scope tables instead of multiple roles

**Observation:** You already have:
```typescript
// Existing tables in your schema
export const userDepartmentScopes = pgTable("user_department_scopes", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  departmentId: uuid("department_id").notNull(),
  // ...
});

export const userDivisionScopes = pgTable("user_division_scopes", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  divisionId: uuid("division_id").notNull(),
  // ...
});
```

**Recommendation:** Use these for access control instead of multi-role

**Example:**
```typescript
// Instead of: user has roles ["manager", "department_admin"]
// Use: user has role "manager" with scopes for Dept A, Dept B, Div 1

// Check if user can access department
function canAccessDepartment(user: User, departmentId: string): boolean {
  if (user.role === "system_admin") return true;
  return userDepartmentScopes.some(scope =>
    scope.userId === user.id && scope.departmentId === departmentId
  );
}
```

**Benefits:**
- ✅ Already implemented in your schema
- ✅ More flexible than roles
- ✅ One role + multiple scopes = powerful RBAC
- ✅ No need for multi-role complexity

---

## Recommended Implementation Plan

### Phase 1: Immediate Fix (Option 1 - Simplify)

**Goal:** Remove client-side `roles` array, align with server

**Actions:**
1. ✅ Remove `roles: z.array(z.string()).optional()` from `userSchema`
2. ✅ Change `role: z.string()` to use `appRoleEnum` from shared schemas
3. ✅ Update UI forms to single-select for role
4. ✅ Consolidate client schemas with shared schemas
5. ✅ Test user creation/edit flows

**Timeline:** 2-3 hours
**Risk:** Low
**Impact:** Immediate clarity, unlocks schema consolidation

---

### Phase 2: Verify & Clean (Check Production Data)

**Goal:** Determine if `userRoles` table is used

**Actions:**
1. ✅ Query production database: `SELECT COUNT(*) FROM user_roles;`
2. ✅ If count = 0:
   - Create migration to drop `userRoles` table
   - Remove from schema files
3. ⚠️ If count > 0:
   - Analyze data (are these real multi-role assignments?)
   - Plan migration to consolidate or preserve

**Timeline:** 1 hour
**Risk:** Low (read-only analysis)

---

### Phase 3: Long-Term (Optional - Enhance)

**Goal:** Improve authorization flexibility

**Option A:** Implement permission-based auth (Option 3)
- Define permission sets per role
- Gradually migrate role checks to permission checks

**Option B:** Leverage scope tables (Option 4)
- Document existing scope system
- Add helper functions for scope-based auth
- Use scopes instead of considering multi-role

**Timeline:** 1-2 weeks
**Risk:** Medium
**Impact:** More flexible authorization without multi-role complexity

---

## Decision Matrix

| Criterion | Option 1 (Single Role) | Option 2 (Multi-Role) | Option 3 (Permissions) | Option 4 (Scopes) |
|-----------|------------------------|----------------------|------------------------|-------------------|
| **Complexity** | ⭐ Low | ⭐⭐⭐⭐⭐ Very High | ⭐⭐⭐ Medium | ⭐⭐ Low-Medium |
| **Development Time** | 2-3 hours | 2-3 weeks | 1-2 weeks | 3-5 days |
| **Risk** | Low | High | Medium | Low-Medium |
| **Flexibility** | Low | High | High | High |
| **Matches Current Code** | ✅ Yes | ❌ No | ⚠️ Partial | ✅ Yes |
| **Maintenance** | Easy | Complex | Moderate | Easy |
| **Auditing** | Easy | Complex | Moderate | Easy |
| **Performance** | Fast | Slower | Fast | Fast |
| **RBAC Best Practice** | ✅ Yes | ⚠️ Debatable | ✅ Yes | ✅ Yes |

---

## Final Recommendation

### **Choose Option 1 (Single Role) + Option 4 (Leverage Scopes)**

**Rationale:**
1. **Immediate:** Remove `roles` array from client (Option 1)
   - Aligns with current implementation
   - Unlocks schema consolidation
   - Low risk, quick win

2. **Long-term:** Document and enhance scope-based auth (Option 4)
   - You already have `userDepartmentScopes` and `userDivisionScopes`
   - More powerful than multi-role for access control
   - Aligns with existing architecture

**Combined Approach:**
```typescript
// User has ONE role (authority level)
user.role = "manager"

// User has MULTIPLE scopes (access boundaries)
user.departmentScopes = ["dept-123", "dept-456"]
user.divisionScopes = ["div-789"]

// Authorization check
function canManageDepartment(user: User, deptId: string): boolean {
  if (user.role === "system_admin") return true;
  if (user.role === "department_admin" && user.departmentScopes.includes(deptId)) return true;
  return false;
}
```

**Benefits:**
- ✅ Simple (one role per user)
- ✅ Flexible (scopes provide granularity)
- ✅ Already implemented (tables exist)
- ✅ Fast (no complex role resolution)
- ✅ Auditable (clear authority + scope)

---

## Next Steps

1. **Decision Required:** Confirm approach with stakeholders
2. **Data Verification:** Check `user_roles` table contents
3. **Implementation:** Execute Phase 1 (remove roles array)
4. **Documentation:** Update architecture docs
5. **Testing:** Verify user creation/edit flows
6. **Migration:** Drop `userRoles` table if unused

---

## References

**Related Files:**
- `client/src/app/(dashboard)/settings/page.tsx` (lines 68-95)
- `shared/schemas/auth.schema.ts` (users table definition)
- `server/middleware/authorization.ts` (requireRole implementation)
- `server/db/storage.ts` (user queries)

**Related Issues:**
- Schema consolidation analysis (Task 2)
- RBAC architecture review

**Decision Deadline:** Before next schema consolidation work

---

**Status:** 📋 Awaiting Decision
**Owner:** Architecture Team
**Reviewers:** Backend Lead, Frontend Lead, Product Manager
