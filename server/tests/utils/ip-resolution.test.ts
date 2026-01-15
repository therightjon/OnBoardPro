import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { Request } from "express";
import type { Socket } from "net";
import {
  parseTrustedProxies,
  isLoopback,
  isTrustedProxy,
  getDirectIp,
  resolveClientIpWithProxies,
} from "../../utils/ip-resolution";

/**
 * Creates a mock Express Request with configurable properties.
 */
function createMockRequest(options: {
  ip?: string;
  socketAddress?: string;
  xForwardedFor?: string | string[];
}): Request {
  const { ip, socketAddress, xForwardedFor } = options;
  
  const socket = socketAddress
    ? ({ remoteAddress: socketAddress } as Socket)
    : undefined;
  
  const headers: Record<string, string | string[] | undefined> = {};
  if (xForwardedFor !== undefined) {
    headers["x-forwarded-for"] = xForwardedFor;
  }
  
  return {
    ip,
    socket,
    headers,
  } as unknown as Request;
}

describe("IP Resolution Utility", () => {
  describe("parseTrustedProxies", () => {
    test("returns empty set when no config", () => {
      assert.equal(parseTrustedProxies(undefined).size, 0);
      assert.equal(parseTrustedProxies("").size, 0);
    });

    test("parses single IP", () => {
      const result = parseTrustedProxies("127.0.0.1");
      assert.ok(result.has("127.0.0.1"));
      assert.equal(result.size, 1);
    });

    test("parses multiple IPs", () => {
      const result = parseTrustedProxies("10.0.0.1, 10.0.0.2, 10.0.0.3");
      assert.ok(result.has("10.0.0.1"));
      assert.ok(result.has("10.0.0.2"));
      assert.ok(result.has("10.0.0.3"));
      assert.equal(result.size, 3);
    });

    test("normalizes to lowercase", () => {
      const result = parseTrustedProxies("LOOPBACK");
      assert.ok(result.has("loopback"));
    });

    test("trims whitespace", () => {
      const result = parseTrustedProxies("  127.0.0.1  ,  10.0.0.1  ");
      assert.ok(result.has("127.0.0.1"));
      assert.ok(result.has("10.0.0.1"));
    });
  });

  describe("isLoopback", () => {
    test("recognizes 127.0.0.1", () => {
      assert.ok(isLoopback("127.0.0.1"));
    });

    test("recognizes ::1", () => {
      assert.ok(isLoopback("::1"));
    });

    test("recognizes 127.x.x.x range", () => {
      assert.ok(isLoopback("127.0.0.5"));
      assert.ok(isLoopback("127.255.255.255"));
    });

    test("recognizes IPv4-mapped loopback", () => {
      assert.ok(isLoopback("::ffff:127.0.0.1"));
    });

    test("rejects non-loopback IPs", () => {
      assert.ok(!isLoopback("192.168.1.1"));
      assert.ok(!isLoopback("10.0.0.1"));
      assert.ok(!isLoopback("8.8.8.8"));
    });
  });

  describe("isTrustedProxy", () => {
    test("returns false for empty set", () => {
      assert.ok(!isTrustedProxy("127.0.0.1", new Set()));
    });

    test("matches exact IP", () => {
      const proxies = parseTrustedProxies("10.0.0.1");
      assert.ok(isTrustedProxy("10.0.0.1", proxies));
      assert.ok(!isTrustedProxy("10.0.0.2", proxies));
    });

    test("handles loopback special value", () => {
      const proxies = parseTrustedProxies("loopback");
      assert.ok(isTrustedProxy("127.0.0.1", proxies));
      assert.ok(isTrustedProxy("::1", proxies));
      assert.ok(!isTrustedProxy("10.0.0.1", proxies));
    });

    test("handles IPv4-mapped IPv6", () => {
      const proxies = parseTrustedProxies("192.168.1.1");
      assert.ok(isTrustedProxy("::ffff:192.168.1.1", proxies));
    });
  });

  describe("getDirectIp", () => {
    test("returns socket address when available", () => {
      const req = createMockRequest({ socketAddress: "192.168.1.100" });
      assert.equal(getDirectIp(req), "192.168.1.100");
    });

    test("strips IPv4-mapped IPv6 prefix", () => {
      const req = createMockRequest({ socketAddress: "::ffff:192.168.1.100" });
      assert.equal(getDirectIp(req), "192.168.1.100");
    });

    test("falls back to req.ip when no socket", () => {
      const req = createMockRequest({ ip: "10.20.30.40" });
      assert.equal(getDirectIp(req), "10.20.30.40");
    });

    test("returns 'unknown' when no IP available", () => {
      const req = createMockRequest({});
      assert.equal(getDirectIp(req), "unknown");
    });
  });

  describe("resolveClientIpWithProxies - No trusted proxies", () => {
    const emptyProxies = new Set<string>();

    test("returns socket address ignoring X-Forwarded-For", () => {
      const req = createMockRequest({
        socketAddress: "192.168.1.100",
        xForwardedFor: "10.0.0.1, 10.0.0.2",
      });
      
      const result = resolveClientIpWithProxies(req, emptyProxies);
      assert.equal(result, "192.168.1.100");
    });

    test("strips IPv4-mapped IPv6 prefix", () => {
      const req = createMockRequest({
        socketAddress: "::ffff:192.168.1.100",
      });
      
      const result = resolveClientIpWithProxies(req, emptyProxies);
      assert.equal(result, "192.168.1.100");
    });
  });

  describe("resolveClientIpWithProxies - With trusted proxies", () => {
    test("uses X-Forwarded-For when connection is from trusted proxy", () => {
      const proxies = parseTrustedProxies("127.0.0.1");
      
      const req = createMockRequest({
        socketAddress: "127.0.0.1",
        xForwardedFor: "203.0.113.50",
      });
      
      const result = resolveClientIpWithProxies(req, proxies);
      assert.equal(result, "203.0.113.50");
    });

    test("handles multiple IPs in X-Forwarded-For, returns rightmost untrusted", () => {
      const proxies = parseTrustedProxies("10.0.0.1, 10.0.0.2");
      
      // Client -> Proxy1 (10.0.0.1) -> Proxy2 (10.0.0.2) -> Server
      const req = createMockRequest({
        socketAddress: "10.0.0.2",
        xForwardedFor: "203.0.113.50, 10.0.0.1",
      });
      
      const result = resolveClientIpWithProxies(req, proxies);
      assert.equal(result, "203.0.113.50");
    });

    test("ignores X-Forwarded-For when connection is not from trusted proxy", () => {
      const proxies = parseTrustedProxies("127.0.0.1");
      
      // Direct connection from unknown IP trying to spoof
      const req = createMockRequest({
        socketAddress: "192.168.1.100",
        xForwardedFor: "1.2.3.4",
      });
      
      const result = resolveClientIpWithProxies(req, proxies);
      assert.equal(result, "192.168.1.100");
    });

    test("handles loopback special value", () => {
      const proxies = parseTrustedProxies("loopback");
      
      const req = createMockRequest({
        socketAddress: "127.0.0.1",
        xForwardedFor: "8.8.8.8",
      });
      
      const result = resolveClientIpWithProxies(req, proxies);
      assert.equal(result, "8.8.8.8");
    });

    test("handles ::1 as loopback", () => {
      const proxies = parseTrustedProxies("loopback");
      
      const req = createMockRequest({
        socketAddress: "::1",
        xForwardedFor: "198.51.100.25",
      });
      
      const result = resolveClientIpWithProxies(req, proxies);
      assert.equal(result, "198.51.100.25");
    });

    test("handles IPv4-mapped IPv6 in trusted proxies", () => {
      const proxies = parseTrustedProxies("192.168.1.1");
      
      const req = createMockRequest({
        socketAddress: "::ffff:192.168.1.1",
        xForwardedFor: "203.0.113.100",
      });
      
      const result = resolveClientIpWithProxies(req, proxies);
      assert.equal(result, "203.0.113.100");
    });

    test("returns leftmost IP when all IPs in chain are trusted", () => {
      const proxies = parseTrustedProxies("10.0.0.1, 10.0.0.2, 10.0.0.3");
      
      const req = createMockRequest({
        socketAddress: "10.0.0.1",
        xForwardedFor: "10.0.0.3, 10.0.0.2",
      });
      
      const result = resolveClientIpWithProxies(req, proxies);
      assert.equal(result, "10.0.0.3");
    });

    test("handles empty X-Forwarded-For header", () => {
      const proxies = parseTrustedProxies("127.0.0.1");
      
      const req = createMockRequest({
        socketAddress: "127.0.0.1",
        xForwardedFor: "",
      });
      
      const result = resolveClientIpWithProxies(req, proxies);
      assert.equal(result, "127.0.0.1");
    });

    test("handles missing X-Forwarded-For header from trusted proxy", () => {
      const proxies = parseTrustedProxies("127.0.0.1");
      
      const req = createMockRequest({
        socketAddress: "127.0.0.1",
      });
      
      const result = resolveClientIpWithProxies(req, proxies);
      assert.equal(result, "127.0.0.1");
    });
  });

  describe("IP Spoofing Prevention", () => {
    test("prevents rate limit bypass via X-Forwarded-For spoofing", () => {
      // No trusted proxies - attacker tries to spoof different IPs
      const emptyProxies = new Set<string>();
      
      // Attacker sends requests with different X-Forwarded-For headers
      const ips: string[] = [];
      for (let i = 0; i < 5; i++) {
        const req = createMockRequest({
          socketAddress: "198.51.100.1", // Attacker's real IP
          xForwardedFor: `192.168.1.${i}`, // Spoofed IPs
        });
        ips.push(resolveClientIpWithProxies(req, emptyProxies));
      }
      
      // All resolved IPs should be the same (attacker's real IP)
      assert.ok(ips.every((ip) => ip === "198.51.100.1"));
    });

    test("prevents bypass when attacker pretends to be behind proxy", () => {
      const proxies = parseTrustedProxies("10.0.0.1");
      
      // Attacker connects directly but adds fake X-Forwarded-For
      const req = createMockRequest({
        socketAddress: "198.51.100.1", // Attacker's real IP (not trusted)
        xForwardedFor: "1.2.3.4, 10.0.0.1", // Trying to look like proxy chain
      });
      
      const result = resolveClientIpWithProxies(req, proxies);
      // Should return attacker's real IP, not trust the header
      assert.equal(result, "198.51.100.1");
    });
  });
});
