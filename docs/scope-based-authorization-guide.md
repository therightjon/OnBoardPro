# Scope-Based Authorization Guide

## Overview

This guide documents the OnBoardPro authorization architecture, which uses **single role per user** combined with **scope-based access control** to provide flexible, secure authorization.

## Architecture Principles

### Single Role Per User

Each user has exactly ONE role that defines their authority level and what actions they can perform:

- `system_admin` - Full system access
- `hr_staff` - HR operations across all departments
- `department_admin` - Administrative access within specific departments
- `division_leader` - Leadership access within specific divisions
- `manager` - Manager access for assigned candidates
- `candidate` - Limited self-service access

**Key Insight:** The role defines **WHAT** a user can do, not **WHERE** they can do it.

### Scopes Define Access Boundaries

Scopes define **WHERE** a user can exercise their role permissions:

- **Department Scopes** (`userDepartmentScopes` table) - Grant access to specific departments
- **Division Scopes** (`userDivisionScopes` table) - Grant access to specific divisions

**Examples:**
- An `hr_staff` user with department scopes for "Engineering" and "Sales" can perform HR operations in those departments only
- A `department_admin` with a department scope for "Marketing" can administer users and settings within Marketing
- A `manager` is automatically scoped to their assigned candidates

## Database Schema

### User Role (Single)

```typescript
// users table
{
  id: uuid,
  role: enum('system_admin', 'hr_staff', 'department_admin', 'division_leader', 'manager', 'candidate'),
  departmentId: uuid, // Primary department affiliation
  divisionId: uuid,   // Primary division affiliation
  // ... other fields
}
```

### Department Scopes (Multiple)

```typescript
// userDepartmentScopes table
{
  id: uuid,
  userId: uuid,           // References users.id
  departmentId: uuid,     // References departments.id
  grantedBy: uuid,        // Who granted this scope
  grantedAt: timestamp,
  // ... other fields
}
```

### Division Scopes (Multiple)

```typescript
// userDivisionScopes table
{
  id: uuid,
  userId: uuid,         // References users.id
  divisionId: uuid,     // References divisions.id
  grantedBy: uuid,      // Who granted this scope
  grantedAt: timestamp,
  // ... other fields
}
```

## Authorization Patterns

### Pattern 1: Role-Based Authorization

Check if a user has a specific role:

```typescript
// Server-side middleware/utils
function requireRole(role: UserRole) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

// Usage
router.post("/api/users", requireRole("system_admin"), createUser);
```

### Pattern 2: Scope-Based Authorization

Check if a user has access to a specific department or division:

```typescript
// Check department access
async function hasDepartmentAccess(userId: string, departmentId: string): Promise<boolean> {
  // System admins have access to all departments
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId)
  });

  if (user.role === "system_admin") {
    return true;
  }

  // Check if user has explicit department scope
  const scope = await db.query.userDepartmentScopes.findFirst({
    where: and(
      eq(userDepartmentScopes.userId, userId),
      eq(userDepartmentScopes.departmentId, departmentId)
    )
  });

  return !!scope;
}

// Usage in route handler
router.get("/api/departments/:id/candidates", async (req, res) => {
  const { id: departmentId } = req.params;
  const userId = req.user.id;

  if (!await hasDepartmentAccess(userId, departmentId)) {
    return res.status(403).json({ error: "No access to this department" });
  }

  // Fetch candidates...
});
```

### Pattern 3: Combined Role + Scope Authorization

Check both role AND scope:

```typescript
// Middleware to check role + department scope
function requireDepartmentAccess(requiredRole: UserRole) {
  return async (req, res, next) => {
    const { departmentId } = req.params;
    const user = req.user;

    // Check role
    if (user.role !== requiredRole && user.role !== "system_admin") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    // System admins bypass scope checks
    if (user.role === "system_admin") {
      return next();
    }

    // Check department scope
    const hasAccess = await hasDepartmentAccess(user.id, departmentId);
    if (!hasAccess) {
      return res.status(403).json({ error: "No access to this department" });
    }

    next();
  };
}

// Usage
router.post(
  "/api/departments/:departmentId/settings",
  requireDepartmentAccess("department_admin"),
  updateDepartmentSettings
);
```

## Common Use Cases

### Use Case 1: HR Staff with Multiple Department Access

**Scenario:** Sara is an HR staff member who needs to manage candidates in both Engineering and Sales departments.

**Implementation:**
1. Set Sara's role to `hr_staff`
2. Create department scopes:
   - userDepartmentScopes: { userId: sara.id, departmentId: engineering.id }
   - userDepartmentScopes: { userId: sara.id, departmentId: sales.id }

**Authorization Check:**
```typescript
// Sara can access candidates in Engineering
await hasDepartmentAccess(sara.id, engineering.id) // ✅ true

// Sara CANNOT access candidates in Marketing
await hasDepartmentAccess(sara.id, marketing.id) // ❌ false
```

### Use Case 2: Department Admin with Division Scopes

**Scenario:** John is a department admin for Engineering who needs access to specific divisions within Engineering.

**Implementation:**
1. Set John's role to `department_admin`
2. Set John's primary department: `departmentId: engineering.id`
3. Create division scopes:
   - userDivisionScopes: { userId: john.id, divisionId: backend.id }
   - userDivisionScopes: { userId: john.id, divisionId: frontend.id }

**Authorization Check:**
```typescript
// John can access Backend division
await hasDivisionAccess(john.id, backend.id) // ✅ true

// John can access Frontend division
await hasDivisionAccess(john.id, frontend.id) // ✅ true

// John CANNOT access Mobile division
await hasDivisionAccess(john.id, mobile.id) // ❌ false
```

### Use Case 3: Manager with Candidate Access

**Scenario:** Alice is a manager who needs access to only their assigned candidates.

**Implementation:**
1. Set Alice's role to `manager`
2. Assign candidates to Alice via `candidates.managerId`
3. No additional scopes needed - access is automatically scoped to assigned candidates

**Authorization Check:**
```typescript
// Check if manager can access candidate
function canAccessCandidate(userId: string, candidateId: string): Promise<boolean> {
  const candidate = await db.query.candidates.findFirst({
    where: eq(candidates.id, candidateId)
  });

  return candidate.managerId === userId;
}
```

## Client-Side Authorization

### Hiding UI Elements Based on Role

```typescript
import { useAuth } from "@/features/auth/hooks/use-auth";

function AdminPanel() {
  const { user } = useAuth();

  // Show admin features only to system_admin and department_admin
  if (!["system_admin", "department_admin"].includes(user.role)) {
    return null;
  }

  return (
    <div>
      {/* Admin features */}
    </div>
  );
}
```

### Checking Department Access on Client

```typescript
import { useQuery } from "@tanstack/react-query";

function useDepartmentAccess(departmentId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["departmentAccess", departmentId],
    queryFn: async () => {
      const response = await fetch(`/api/departments/${departmentId}/access`);
      return response.json();
    },
    enabled: !!user && !!departmentId
  });
}

// Usage
function DepartmentSettings({ departmentId }: Props) {
  const { data: hasAccess, isLoading } = useDepartmentAccess(departmentId);

  if (isLoading) return <div>Loading...</div>;
  if (!hasAccess) return <div>No access</div>;

  return (
    <div>
      {/* Department settings */}
    </div>
  );
}
```

## Managing Scopes

### Granting Department Scope

```typescript
// POST /api/users/:userId/department-scopes
async function grantDepartmentScope(req, res) {
  const { userId } = req.params;
  const { departmentId } = req.body;
  const grantedBy = req.user.id;

  // Only system_admin can grant department scopes
  if (req.user.role !== "system_admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  await db.insert(userDepartmentScopes).values({
    userId,
    departmentId,
    grantedBy,
    grantedAt: new Date()
  });

  res.json({ success: true });
}
```

### Revoking Department Scope

```typescript
// DELETE /api/users/:userId/department-scopes/:departmentId
async function revokeDepartmentScope(req, res) {
  const { userId, departmentId } = req.params;

  // Only system_admin can revoke department scopes
  if (req.user.role !== "system_admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  await db.delete(userDepartmentScopes)
    .where(and(
      eq(userDepartmentScopes.userId, userId),
      eq(userDepartmentScopes.departmentId, departmentId)
    ));

  res.json({ success: true });
}
```

### Listing User Scopes

```typescript
// GET /api/users/:userId/scopes
async function getUserScopes(req, res) {
  const { userId } = req.params;

  const [departmentScopes, divisionScopes] = await Promise.all([
    db.query.userDepartmentScopes.findMany({
      where: eq(userDepartmentScopes.userId, userId),
      with: { department: true }
    }),
    db.query.userDivisionScopes.findMany({
      where: eq(userDivisionScopes.userId, userId),
      with: { division: true }
    })
  ]);

  res.json({
    departments: departmentScopes,
    divisions: divisionScopes
  });
}
```

## Migration from Multi-Role (Historical)

### Why Single Role?

The system was originally designed to support multiple roles per user (via `userRoles` junction table), but this was replaced with single role + scopes for the following reasons:

1. **Role Segregation** - Prevents conflicting roles (e.g., candidate + admin)
2. **Clearer Authorization** - Simpler permission checks
3. **Better Performance** - No JOIN on every request
4. **Scope Tables Provide Flexibility** - Department and division scopes already solve the multi-access use case

### What Was Removed

1. `userRoles` junction table - Still exists in database but is unused
2. Client-side `roles: z.array(z.string())` validation - Removed from user forms
3. Multi-role UI components - Removed from settings page

### What Remains Different

**Invitations** still support multiple roles because they represent role *options* for the invitee to choose from, not multiple active roles:

```typescript
// invitations table
{
  roles: text("roles").array().notNull(), // User chooses ONE during acceptance
}

// When invitation is accepted, only ONE role is assigned to the user
```

## Best Practices

### 1. Always Use Role + Scope Together

Don't just check role - also verify scope:

```typescript
// ❌ BAD - Only checks role
if (user.role === "hr_staff") {
  // Allow access to all departments
}

// ✅ GOOD - Checks role AND scope
if (user.role === "hr_staff" && await hasDepartmentAccess(user.id, departmentId)) {
  // Allow access only to scoped departments
}
```

### 2. System Admins Bypass Scope Checks

Always exempt system admins from scope restrictions:

```typescript
// ✅ GOOD
if (user.role === "system_admin") {
  return true; // Full access
}

// Check scopes for other roles
return await hasDepartmentAccess(user.id, departmentId);
```

### 3. Use Middleware for Consistent Checks

Create reusable middleware instead of duplicating authorization logic:

```typescript
// ✅ GOOD - Reusable middleware
router.get("/api/departments/:id/data",
  requireDepartmentAccess("hr_staff"),
  getData
);

// ❌ BAD - Duplicated logic in every handler
router.get("/api/departments/:id/data", async (req, res) => {
  if (req.user.role !== "hr_staff") { /* ... */ }
  if (!await hasDepartmentAccess(/* ... */)) { /* ... */ }
  // ... handler logic
});
```

### 4. Document Scope Requirements

Clearly document which scopes are required for each operation:

```typescript
/**
 * Update department settings
 *
 * @requires role: system_admin OR department_admin
 * @requires scope: department (if department_admin)
 */
async function updateDepartmentSettings(req, res) {
  // ...
}
```

### 5. Audit Scope Changes

Always log when scopes are granted or revoked:

```typescript
async function grantDepartmentScope(userId, departmentId, grantedBy) {
  await db.insert(userDepartmentScopes).values({
    userId,
    departmentId,
    grantedBy,
    grantedAt: new Date()
  });

  // Audit log
  await createAuditLog({
    action: "GRANT_DEPARTMENT_SCOPE",
    performedBy: grantedBy,
    targetUser: userId,
    details: { departmentId }
  });
}
```

## Troubleshooting

### User Can't Access Expected Resources

**Check:**
1. User has correct role: `SELECT role FROM users WHERE id = ?`
2. User has required scopes: `SELECT * FROM userDepartmentScopes WHERE userId = ?`
3. Resource belongs to scoped department/division
4. System admin bypass is working correctly

### Scope Checks Failing

**Verify:**
1. Scope table records exist
2. Foreign key references are correct
3. System admin role is being checked first
4. Database indexes are optimized for scope queries

### Performance Issues with Scope Checks

**Optimize:**
1. Add database indexes on userId and departmentId/divisionId columns
2. Cache scope lookups in Redis or memory
3. Use batch scope checks when processing multiple resources
4. Consider denormalizing frequently accessed scopes

## Future Enhancements

### Potential Improvements

1. **Scope Caching** - Cache scope lookups to reduce database queries
2. **Scope Inheritance** - Division scopes could auto-grant parent department scope
3. **Temporary Scopes** - Time-limited access with expiration
4. **Scope Hierarchy** - More granular permission levels within scopes
5. **Scope Groups** - Named collections of scopes for easier management

---

**Last Updated:** 2025-11-23
**Related Documents:**
- [User Role Architecture Analysis](./user-role-architecture-analysis.md)
- Database Schema: `shared/schemas/auth.schema.ts`
- Authorization Middleware: `server/middleware/auth.ts`
