import { test, describe, mock } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response, NextFunction } from "express";
import { sessionIdleTimeout } from "../../middleware/session-timeout";

// Use the default timeout values from env.ts
// SESSION_IDLE_TIMEOUT_HOURS: 2 (default)
// SESSION_ABSOLUTE_TIMEOUT_HOURS: 24 (default)
const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const ABSOLUTE_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/**
 * Creates a mock Express Request with session data.
 */
function createMockRequest(sessionData: Record<string, unknown> = {}): Request {
  const session = {
    ...sessionData,
    destroy: mock.fn((cb: (err?: Error) => void) => cb()),
  };
  return { session } as unknown as Request;
}

/**
 * Creates a mock Express Response.
 */
function createMockResponse(): Response & { statusCode?: number; jsonData?: unknown } {
  const res = {
    statusCode: undefined as number | undefined,
    jsonData: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.jsonData = data;
      return this;
    },
  };
  return res as unknown as Response & { statusCode?: number; jsonData?: unknown };
}

describe("Session Timeout Middleware", () => {
  describe("no session", () => {
    test("calls next() when no session exists", async () => {
      const req = { session: undefined } as unknown as Request;
      const res = createMockResponse();
      let nextCalled = false;
      const next: NextFunction = () => { nextCalled = true; };

      sessionIdleTimeout(req, res, next);

      assert.ok(nextCalled, "next() should be called");
    });
  });

  describe("absolute timeout", () => {
    test("destroys session when absolute timeout exceeded", async () => {
      const beyondAbsoluteTimeout = Date.now() - ABSOLUTE_TIMEOUT_MS - 1000;
      const req = createMockRequest({
        createdAt: beyondAbsoluteTimeout,
        lastActivity: Date.now(), // Recent activity
      });
      const res = createMockResponse();
      let nextCalled = false;
      const next: NextFunction = () => { nextCalled = true; };

      sessionIdleTimeout(req, res, next);

      assert.ok(!nextCalled, "next() should NOT be called when session expired");
      assert.equal(res.statusCode, 401);
      assert.deepEqual(res.jsonData, { message: "Session expired. Please log in again." });
    });

    test("allows session within absolute timeout", async () => {
      const withinAbsoluteTimeout = Date.now() - ABSOLUTE_TIMEOUT_MS + (60 * 60 * 1000); // 1 hour before limit
      const req = createMockRequest({
        createdAt: withinAbsoluteTimeout,
        lastActivity: Date.now() - 1000, // Recent activity
      });
      const res = createMockResponse();
      let nextCalled = false;
      const next: NextFunction = () => { nextCalled = true; };

      sessionIdleTimeout(req, res, next);

      assert.ok(nextCalled, "next() should be called for valid session");
    });

    test("session without createdAt passes absolute timeout check", async () => {
      // Existing sessions without createdAt should not be immediately invalidated
      const req = createMockRequest({
        lastActivity: Date.now() - 1000,
      });
      const res = createMockResponse();
      let nextCalled = false;
      const next: NextFunction = () => { nextCalled = true; };

      sessionIdleTimeout(req, res, next);

      assert.ok(nextCalled, "next() should be called for sessions without createdAt");
    });
  });

  describe("idle timeout", () => {
    test("destroys session when idle timeout exceeded", async () => {
      const beyondIdleTimeout = Date.now() - IDLE_TIMEOUT_MS - 1000;
      const req = createMockRequest({
        createdAt: Date.now() - (1 * 60 * 60 * 1000), // Created 1 hour ago
        lastActivity: beyondIdleTimeout,
      });
      const res = createMockResponse();
      let nextCalled = false;
      const next: NextFunction = () => { nextCalled = true; };

      sessionIdleTimeout(req, res, next);

      assert.ok(!nextCalled, "next() should NOT be called when idle timeout exceeded");
      assert.equal(res.statusCode, 401);
      assert.deepEqual(res.jsonData, { message: "Session expired due to inactivity" });
    });

    test("allows session within idle timeout", async () => {
      const withinIdleTimeout = Date.now() - IDLE_TIMEOUT_MS + (30 * 60 * 1000); // 30 mins before limit
      const req = createMockRequest({
        createdAt: Date.now() - (1 * 60 * 60 * 1000),
        lastActivity: withinIdleTimeout,
      });
      const res = createMockResponse();
      let nextCalled = false;
      const next: NextFunction = () => { nextCalled = true; };

      sessionIdleTimeout(req, res, next);

      assert.ok(nextCalled, "next() should be called for active session");
    });

    test("updates lastActivity on valid request", async () => {
      const withinIdleTimeout = Date.now() - IDLE_TIMEOUT_MS + (30 * 60 * 1000);
      const req = createMockRequest({
        createdAt: Date.now() - (1 * 60 * 60 * 1000),
        lastActivity: withinIdleTimeout,
      });
      const res = createMockResponse();
      const next: NextFunction = () => {};

      const beforeCall = Date.now();
      sessionIdleTimeout(req, res, next);
      const afterCall = Date.now();

      const session = req.session as unknown as { lastActivity: number };
      assert.ok(
        session.lastActivity >= beforeCall && session.lastActivity <= afterCall,
        "lastActivity should be updated to current time"
      );
    });
  });

  describe("priority", () => {
    test("absolute timeout takes priority over idle timeout", async () => {
      // Session created beyond absolute timeout, but was active recently
      const req = createMockRequest({
        createdAt: Date.now() - ABSOLUTE_TIMEOUT_MS - 1000,
        lastActivity: Date.now() - (1 * 60 * 1000), // Active 1 minute ago
      });
      const res = createMockResponse();
      let nextCalled = false;
      const next: NextFunction = () => { nextCalled = true; };

      sessionIdleTimeout(req, res, next);

      assert.ok(!nextCalled, "Session should be expired even with recent activity");
      assert.equal(res.statusCode, 401);
      assert.deepEqual(res.jsonData, { message: "Session expired. Please log in again." });
    });
  });

  describe("edge cases", () => {
    test("handles brand new session without timestamps", async () => {
      const req = createMockRequest({});
      const res = createMockResponse();
      let nextCalled = false;
      const next: NextFunction = () => { nextCalled = true; };

      sessionIdleTimeout(req, res, next);

      assert.ok(nextCalled, "next() should be called for brand new session");
    });

    test("handles session at exact idle timeout boundary", async () => {
      // Exactly at the boundary should expire (> not >=)
      const exactlyAtIdleTimeout = Date.now() - IDLE_TIMEOUT_MS - 1; // Just over
      const req = createMockRequest({
        createdAt: Date.now() - (1 * 60 * 60 * 1000),
        lastActivity: exactlyAtIdleTimeout,
      });
      const res = createMockResponse();
      let nextCalled = false;
      const next: NextFunction = () => { nextCalled = true; };

      sessionIdleTimeout(req, res, next);

      assert.ok(!nextCalled, "Session just past idle timeout should expire");
    });

    test("handles session just before absolute timeout", async () => {
      const justUnderAbsoluteTimeout = Date.now() - ABSOLUTE_TIMEOUT_MS + 1000;
      const req = createMockRequest({
        createdAt: justUnderAbsoluteTimeout,
        lastActivity: Date.now(),
      });
      const res = createMockResponse();
      let nextCalled = false;
      const next: NextFunction = () => { nextCalled = true; };

      sessionIdleTimeout(req, res, next);

      assert.ok(nextCalled, "Session just under absolute timeout should be valid");
    });
  });
});
