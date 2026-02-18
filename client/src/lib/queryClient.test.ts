import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest, getQueryFn } from "./queryClient";
import { clearCsrfTokenCache, getCsrfToken } from "./csrf";

vi.mock("./csrf", () => ({
  getCsrfToken: vi.fn(async () => "test-csrf-token"),
  clearCsrfTokenCache: vi.fn(),
}));

describe("queryClient CSRF/session handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    expect(clearCsrfTokenCache).toHaveBeenCalledTimes(1);
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
      apiRequest("POST", "/api/login", { email: "user@example.com", password: "secret" }),
    ).rejects.toMatchObject({ status: 401 });

    expect(getCsrfToken).toHaveBeenCalledTimes(1);
    expect(clearCsrfTokenCache).toHaveBeenCalledTimes(1);
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
});
