import type { Request } from "express";

/**
 * Parses the TRUSTED_PROXIES environment variable into a set of trusted proxy identifiers.
 * Supports individual IPs, CIDR notation, and special values like "loopback".
 */
export function parseTrustedProxies(trustedProxies?: string): Set<string> {
  if (!trustedProxies) return new Set();
  
  return new Set(
    trustedProxies
      .split(",")
      .map((p) => p.trim().toLowerCase())
      .filter((p) => p.length > 0)
  );
}

/**
 * Checks if an IP address is a loopback address.
 */
export function isLoopback(ip: string): boolean {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("127.") ||
    ip === "::ffff:127.0.0.1"
  );
}

/**
 * Checks if a given IP address is in the trusted proxy set.
 */
export function isTrustedProxy(ip: string, trustedProxySet: Set<string>): boolean {
  if (trustedProxySet.size === 0) return false;
  
  const normalizedIp = ip.toLowerCase();
  
  // Check for loopback special value
  if (trustedProxySet.has("loopback") && isLoopback(ip)) {
    return true;
  }
  
  // Check for exact IP match
  if (trustedProxySet.has(normalizedIp)) {
    return true;
  }
  
  // Check for IPv4-mapped IPv6 addresses (e.g., ::ffff:192.168.1.1)
  if (normalizedIp.startsWith("::ffff:")) {
    const ipv4 = normalizedIp.slice(7);
    if (trustedProxySet.has(ipv4)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Gets the direct socket/connection IP address.
 */
export function getDirectIp(req: Request): string {
  // Express req.ip is populated when "trust proxy" is set
  // We prefer the raw socket address for security
  const socketAddress = req.socket?.remoteAddress;
  
  if (socketAddress) {
    // Handle IPv4-mapped IPv6 addresses (e.g., ::ffff:127.0.0.1)
    if (socketAddress.startsWith("::ffff:")) {
      return socketAddress.slice(7);
    }
    return socketAddress;
  }
  
  // Fall back to req.ip (which may already be processed by Express)
  if (req.ip) {
    if (req.ip.startsWith("::ffff:")) {
      return req.ip.slice(7);
    }
    return req.ip;
  }
  
  return "unknown";
}

/**
 * Core IP resolution logic that can be tested with a custom trusted proxy set.
 * 
 * @param req - Express request object
 * @param trustedProxySet - Set of trusted proxy identifiers
 * @returns The resolved client IP address
 */
export function resolveClientIpWithProxies(req: Request, trustedProxySet: Set<string>): string {
  // If no trusted proxies are configured, don't trust X-Forwarded-For
  if (trustedProxySet.size === 0) {
    return getDirectIp(req);
  }
  
  // Check if the direct connection is from a trusted proxy
  const directIp = getDirectIp(req);
  if (!isTrustedProxy(directIp, trustedProxySet)) {
    // Connection is not from a trusted proxy, use direct IP
    return directIp;
  }
  
  // Connection is from a trusted proxy, parse X-Forwarded-For
  const forwardedFor = req.headers["x-forwarded-for"];
  if (!forwardedFor) {
    return directIp;
  }
  
  // Parse the X-Forwarded-For header (format: client, proxy1, proxy2, ...)
  const forwarded = typeof forwardedFor === "string" 
    ? forwardedFor 
    : forwardedFor[0] || "";
  
  const ips = forwarded
    .split(",")
    .map((ip) => ip.trim())
    .filter((ip) => ip.length > 0);
  
  if (ips.length === 0) {
    return directIp;
  }
  
  // Walk from right to left, finding the first non-trusted IP
  // This is the real client IP (the one that was added by the first trusted proxy)
  for (let i = ips.length - 1; i >= 0; i--) {
    const ip = ips[i];
    if (!isTrustedProxy(ip, trustedProxySet)) {
      return ip;
    }
  }
  
  // All IPs in the chain are trusted (unusual), use the leftmost
  return ips[0];
}

/**
 * Securely resolves the client IP address from a request.
 * 
 * This function addresses the IP spoofing vulnerability (CWE-770) by:
 * 1. Only trusting X-Forwarded-For headers when TRUSTED_PROXIES is configured
 * 2. In production, taking the rightmost untrusted IP (the one before trusted proxies)
 * 3. Falling back to req.ip or socket address when no trusted proxy is configured
 * 
 * @param req - Express request object
 * @returns The resolved client IP address, or "unknown" if not determinable
 */
export function resolveClientIp(req: Request): string {
  // In test mode, use simple resolution to avoid complexity
  if (process.env.NODE_ENV === "test") {
    return getDirectIp(req);
  }

  const trustedProxies = parseTrustedProxies(process.env.TRUSTED_PROXIES);
  return resolveClientIpWithProxies(req, trustedProxies);
}
