import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest, getQueryFn, _resetSessionExpiredFlag } from "./queryClient";
import { clearCsrfTokenCache, getCsrfToken } from "./csrf";

vi.mock("./csrf", () => ({
  getCsrfToken: vi.fn(async () => "test-csrf-token"),
  clearCsrfTokenCache: vi.fn(),
}));

// Mock window.location.replace to prevent navigation during tests
const locationReplaceMock = vi.fn();
Object.defineProperty(window, "location", {
  writable: true,
  value: { ...window.location, replace: locationReplaceMock },
});

describe("queryClient CSRF/session handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetSessionExpiredFlag();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    _resetSessionExpiredFlag();
  });

  it("clears CSRF cache when query receives 401 and on401=returnNull", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("", { status: 401, statusText: "Unauthorized" }),
    );

    const queryFn = getQueryFn<unknown>({ on401: "returnNull" });
    const result = await queryFn({ queryKey: ["/api/user"] } as any);

    expect(result).toBeNull();
    expect(clearCsrfTokenCache).toHaveBeenCalledTimes(1);
  });

  it("clears CSRF cache when query receives 401 and on401=throw", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Unauthorized" }), {
        status: 401,
        statusText: "Unauthorized",
        headers: { "content-type": "application/json" },
      }),
    );

    const queryFn = getQueryFn<unknown>({ on401: "throw" });

    await expect(queryFn({ queryKey: ["/api/user"] } as any)).rejects.toThrow(
      "Unauthorized",
    );
    // Called twice: once in getQueryFn and once in handleSessionExpired
    expect(clearCsrfTokenCache).toHaveBeenCalled();
  });

  it("clears CSRF cache when mutation request receives 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Unauthorized" }), {
        status: 401,
        statusText: "Unauthorized",
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      apiRequest("POST", "/api/candidates", { name: "Test" }),
    ).rejects.toMatchObject({ status: 401 });

    expect(getCsrfToken).toHaveBeenCalledTimes(1);
    // Called twice: once in apiRequest and once in handleSessionExpired
    expect(clearCsrfTokenCache).toHaveBeenCalled();
  });

  it("keeps clearing CSRF cache when mutation request receives 403", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Invalid CSRF token" }), {
        status: 403,
        statusText: "Forbidden",
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      apiRequest("POST", "/api/login", { email: "user@example.com", password: "secret" }),
    ).rejects.toMatchObject({ status: 403 });

    expect(getCsrfToken).toHaveBeenCalledTimes(1);
    expect(clearCsrfTokenCache).toHaveBeenCalledTimes(1);
  });

  it("triggers session-expired redirect when apiRequest receives 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Session expired" }), {
        status: 401,
        statusText: "Unauthorized",
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      apiRequest("GET", "/api/candidates"),
    ).rejects.toMatchObject({ status: 401 });

    // handleSessionExpired defers via queueMicrotask, so flush it
    await new Promise((r) => setTimeout(r, 0));
    expect(locationReplaceMock).toHaveBeenCalledWith("/auth?expired=1");
  });

  it("triggers session-expired redirect when getQueryFn on401=throw receives 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Unauthorized" }), {
        status: 401,
        statusText: "Unauthorized",
        headers: { "content-type": "application/json" },
      }),
    );

    const queryFn = getQueryFn<unknown>({ on401: "throw" });
    await expect(queryFn({ queryKey: ["/api/candidates"] } as any)).rejects.toThrow();

    await new Promise((r) => setTimeout(r, 0));
    expect(locationReplaceMock).toHaveBeenCalledWith("/auth?expired=1");
  });

  it("does NOT redirect when getQueryFn on401=returnNull receives 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("", { status: 401, statusText: "Unauthorized" }),
    );

    const queryFn = getQueryFn<unknown>({ on401: "returnNull" });
    const result = await queryFn({ queryKey: ["/api/user"] } as any);

    expect(result).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(locationReplaceMock).not.toHaveBeenCalled();
  });

  it("only redirects once when multiple 401s fire (debounce)", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Unauthorized" }), {
          status: 401,
          statusText: "Unauthorized",
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Unauthorized" }), {
          status: 401,
          statusText: "Unauthorized",
          headers: { "content-type": "application/json" },
        }),
      );

    await Promise.allSettled([
      apiRequest("GET", "/api/candidates"),
      apiRequest("GET", "/api/tasks/mine"),
    ]);

    await new Promise((r) => setTimeout(r, 0));
    expect(locationReplaceMock).toHaveBeenCalledTimes(1);
  });
});
