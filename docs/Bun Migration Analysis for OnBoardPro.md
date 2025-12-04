# Bun Migration Analysis for OnBoardPro

## 1. High-Level Assessment

### Overall Compatibility: **MODERATE-HIGH (7/10)**

This project is a good candidate for Bun migration with some caveats. The stack consists of:

| Component | Bun Compatibility |
|-----------|-------------------|
| Express.js server | ✅ Excellent |
| Drizzle ORM + PostgreSQL | ✅ Excellent |
| React + Vite frontend | ✅ Excellent |
| Passport.js authentication | ⚠️ Good (some edge cases) |
| `pg` PostgreSQL client | ✅ Excellent |
| `bcrypt` / `scrypt` | ⚠️ Native addon concerns |
| Session management (`express-session` + `connect-pg-simple`) | ✅ Good |
| Background jobs (setInterval-based) | ✅ Excellent |

### Most Affected Areas

1. **Runtime APIs**: Minimal impact - Express/Drizzle work well
2. **Native Modules**: `bcrypt` is a **critical risk** (uses `node-gyp`)
3. **Tooling**: Major simplification opportunity (Bun replaces tsx, vitest, npm)
4. **Tests**: vitest → Bun test runner migration needed
5. **Deployment**: Docker base image change required

---

## 2. Pros of Migrating to Bun

### Performance Benefits

```
┌─────────────────────────────────────────────────────────────┐
│ Metric              │ Node.js        │ Bun (expected)       │
├─────────────────────┼────────────────┼──────────────────────┤
│ Cold start          │ ~800ms         │ ~150ms (5x faster)   │
│ HTTP throughput     │ Baseline       │ 2-4x faster          │
│ Package install     │ ~30s           │ ~5s (6x faster)      │
│ TypeScript compile  │ tsx/ts-node    │ Native (instant)     │
│ Test execution      │ vitest         │ Native (faster)      │
└─────────────────────────────────────────────────────────────┘
```

**Specific gains for OnBoardPro:**
- Background jobs (`scan-deadlines.ts`, `notification-email.ts`) start faster
- API response latency improves for `/api/candidates` and other endpoints
- Development iteration speed increases significantly

### Tooling Simplification

**Before (Node.js):**
```json
{
  "devDependencies": {
    "tsx": "...",           // TypeScript execution
    "vitest": "...",        // Test runner
    "vite": "...",          // Build tool
    "@types/node": "..."    // Type definitions
  }
}
```

**After (Bun):**
```json
{
  "devDependencies": {
    "vite": "..."           // Still needed for React HMR
    // Everything else built into Bun
  }
}
```

**Commands simplification:**
```bash
# Before
npx tsx scripts/runMigration.ts
npm run test

# After
bun scripts/runMigration.ts
bun test
```

### Developer Experience Benefits

1. **Instant TypeScript** - No compilation step for `server/index.ts`
2. **Built-in `.env` loading** - Can remove `dotenv` dependency
3. **Faster CI/CD** - Package installs and test runs ~5x faster
4. **Unified toolchain** - One tool for run/test/install/bundle

---

## 3. Cons and Risks

### Critical: Native Module Compatibility

**`bcrypt` is used for password hashing:**

Looking at the auth service pattern in `server/features/auth/services/auth.service.ts`, the codebase uses password hashing. If `bcrypt` (native addon) is used:

```typescript
// RISK: bcrypt uses node-gyp native compilation
import bcrypt from 'bcrypt';
await bcrypt.hash(password, 10);
```

**Mitigation options:**

```typescript
// Option 1: Use Bun's native password API
const hash = await Bun.password.hash(password, {
  algorithm: "bcrypt",
  cost: 10
});
const valid = await Bun.password.verify(password, hash);

// Option 2: Use bcryptjs (pure JS, slower but compatible)
import bcryptjs from 'bcryptjs';
```

### Partially Supported APIs

| API/Feature | Status in Bun | Impact on OnBoardPro |
|-------------|---------------|----------------------|
| `crypto.scrypt` | ✅ Supported | Used in `server/utils/secret.ts` |
| `process.memoryUsage()` | ✅ Supported | Used in `server/routes/health.ts` |
| `cluster` module | ⚠️ Partial | Not used - OK |
| `worker_threads` | ⚠️ Partial | Not used - OK |
| `vm` module | ❌ Limited | Not used - OK |

### Package Compatibility Concerns

Checking against `package.json` dependencies:

```
✅ express           - Full support
✅ drizzle-orm       - Full support  
✅ pg                - Full support
✅ helmet            - Full support
✅ compression       - Full support
✅ passport          - Full support (see edge cases below)
✅ zod               - Full support
✅ connect-pg-simple - Full support
⚠️ bcrypt            - Native addon (see mitigation above)
✅ @tanstack/react-query - Full support
✅ wouter            - Full support
```

### ESM/CJS Resolution Differences

The codebase uses ESM (`"type": "module"`). Bun handles this well, but watch for:

```typescript
// filepath: server/config/database.config.ts
import pg from 'pg';
const { Pool } = pg;  // CJS default export pattern

// Bun might need:
import { Pool } from 'pg';  // Direct named import (test this)
```

### Tooling Gaps

| Tool | Node.js | Bun | Gap |
|------|---------|-----|-----|
| Debugging | Chrome DevTools, VS Code | Limited | ⚠️ Moderate |
| Profiling | `--prof`, clinic.js | `bun:prof` (basic) | ⚠️ Moderate |
| APM (DataDog, etc.) | Full support | Limited | ⚠️ High for production |
| Source maps | Excellent | Good | Minor |

---

## 4. Edge Cases and Hidden Pitfalls

### File System Assumptions

```typescript
// filepath: server/vite.ts
import path from "path";
import fs from "fs";

// This pattern works in Bun:
const distPath = path.resolve(import.meta.dirname, "public");
if (!fs.existsSync(distPath)) { ... }

// But watch for:
import.meta.dirname  // ✅ Supported in Bun
import.meta.url      // ✅ Supported
__dirname            // ⚠️ Only in CJS mode
```

### Environment Variable Loading

```typescript
// Current: relies on dotenv
import { z } from 'zod';

// Bun: Built-in .env loading, but behavior differs:
// - Bun loads .env automatically
// - Bun.env vs process.env (both work, Bun.env is typed)
```

**Recommendation:** Test that `.env` loading works identically, especially for:
- `DATABASE_URL`
- `SESSION_SECRET`
- `LDAP_*` variables

### Express + Helmet + Compression Stack

```typescript
import helmet from "helmet";
import compression from "compression";

app.use(helmet({ ... }));
app.use(compression());
```

These work in Bun, but **performance characteristics differ**:
- Bun's HTTP server is faster than Node's `http` module
- `compression` middleware might be less necessary (measure this)

### Passport.js Session Serialization

```typescript
// Passport session handling in auth.service.ts
// Edge case: Session serialization timing

passport.serializeUser((user, done) => {
  // Bun's event loop timing might differ subtly
  // Test login/logout flows thoroughly
});
```

### Vite Dev Server Integration

```typescript
import { createServer as createViteServer } from "vite";

const vite = await createViteServer({
  server: {
    middlewareMode: true,
    hmr: { server },  // ⚠️ HMR websocket handling
  }
});
```

**Risk:** Vite's HMR uses WebSockets. Bun's WebSocket implementation is excellent, but test:
- React component hot reload
- CSS hot reload
- Full page refresh fallback

### Background Job Timing

```typescript
setInterval(async () => {
  await processDeadlines();
}, 60000);
```

Bun's timer implementation is compatible, but:
- Verify timer accuracy under load
- Check for drift in long-running processes

---

## 5. Recommended Migration Plan

### Phase 1: Spike (1-2 days)

**Objective:** Validate core functionality without full commitment

```bash
# Step 1: Install Bun
curl -fsSL https://bun.sh/install | bash

# Step 2: Test basic execution
bun run server/index.ts

# Step 3: Test database connection
bun run scripts/smokeRecompute.ts
```

**Checklist:**
- [ ] Server starts without errors
- [ ] Database connection works
- [ ] Health endpoint responds (`/health`)
- [ ] Basic API request succeeds

### Phase 2: Dependency Audit (1 day)

```typescript
// filepath: scripts/bun-compat-check.ts
import { $ } from "bun";

async function checkCompatibility() {
  // Test native modules
  try {
    const bcrypt = await import("bcrypt");
    console.log("bcrypt: ✅");
  } catch (e) {
    console.log("bcrypt: ❌ - Need to migrate to Bun.password or bcryptjs");
  }

  // Test pg connection
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query("SELECT 1");
  console.log("pg: ✅");
  
  // Test crypto
  const crypto = await import("crypto");
  const hash = crypto.scryptSync("test", "salt", 64);
  console.log("crypto.scrypt: ✅");
}

checkCompatibility();
```

### Phase 3: Test Suite Migration (2-3 days)

```typescript
import { describe, test, expect } from "bun:test";

describe("Bun compatibility", () => {
  test("express app starts", async () => {
    const { app } = await import("../index");
    expect(app).toBeDefined();
  });

  test("drizzle queries work", async () => {
    const { db } = await import("../db/connection");
    const result = await db.execute(sql`SELECT 1 as one`);
    expect(result.rows[0].one).toBe(1);
  });

  test("password hashing works", async () => {
    const hash = await Bun.password.hash("test123", { algorithm: "bcrypt" });
    const valid = await Bun.password.verify("test123", hash);
    expect(valid).toBe(true);
  });
});
```

### Phase 4: Docker Migration (1 day)

```dockerfile
FROM oven/bun:1.1-alpine

WORKDIR /app

# Copy package files
COPY package.json bun.lockb ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build frontend
RUN bun run build

EXPOSE 5000

CMD ["bun", "run", "server/index.ts"]
```

### Phase 5: Gradual Rollout

1. **Development first** - Run dev environment on Bun for 1 week
2. **Staging** - Deploy to staging, monitor for 1 week
3. **Production canary** - 10% traffic to Bun instance
4. **Full migration** - If metrics are good after 1 week

---

## Go / No-Go Criteria

### ✅ GO if:

| Criterion | Test |
|-----------|------|
| All tests pass | `bun test` exits 0 |
| API response times equal or better | Benchmark `/api/candidates` |
| Memory usage stable | Monitor for 24h under load |
| No bcrypt issues | Either native Bun.password or bcryptjs works |
| Vite HMR works | Frontend hot reload functional |
| CI/CD faster | GitHub Actions time reduced |

### ❌ NO-GO if:

| Criterion | Risk |
|-----------|------|
| APM/monitoring integration fails | Production observability gap |
| Session handling breaks | Authentication failures |
| Database connection pooling issues | `pg` Pool behavior differs |
| Memory leaks in long-running process | Background jobs affected |
| Source maps broken | Debugging impossible |

---

## Concrete Migration Diff

Here's what the key files would look like post-migration:

**package.json changes:**
```json
{
  "name": "onboardpro",
  "type": "module",
  "scripts": {
    "dev": "bun run --watch server/index.ts",
    "build": "vite build",
    "start": "bun run server/index.ts",
    "test": "bun test",
    "db:push": "drizzle-kit push",
    "migration": "bun run scripts/runMigration.ts"
  },
  "devDependencies": {
    // Remove: tsx, vitest, @types/node (optional)
    "vite": "^7.1.6",
    "@vitejs/plugin-react-swc": "^3.0.0",
    "drizzle-kit": "^0.20.0"
  }
}
```

**Password utilities (Bun-native):**
```typescript
/**
 * Password hashing utilities - Bun-native implementation
 */
export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: 10
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}
```

---

## Summary

| Aspect | Verdict |
|--------|---------|
| **Should you migrate?** | **Yes, with careful testing** |
| **Biggest win** | 5x faster startup, simpler toolchain |
| **Biggest risk** | Native module compatibility (bcrypt) |
| **Estimated effort** | 1-2 weeks for full migration |
| **Recommended approach** | Spike first, then gradual rollout |

The OnBoardPro codebase is well-structured for migration. The main work is:
1. Replacing `bcrypt` with `Bun.password` or `bcryptjs`
2. Migrating tests from vitest to `bun:test`
3. Updating Docker configuration
4. Validating Vite HMR integration