import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  contentSecurityPolicy,
  staticSecurityHeaders,
} from "./security-headers";

describe("browser security policy", () => {
  it("restricts scripts and network destinations in production", () => {
    const policy = contentSecurityPolicy(
      "random-nonce",
      "https://project.supabase.co/path",
    );
    expect(policy).toContain(
      "script-src 'self' 'nonce-random-nonce' 'strict-dynamic';",
    );
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).toContain(
      "connect-src 'self' https://project.supabase.co wss://project.supabase.co;",
    );
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("frame-src 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("form-action 'self'");
  });
  it("never widens script or default sources beyond the nonce and own origin", () => {
    const policy = contentSecurityPolicy("n", "https://project.supabase.co");
    const directive = (name: string) =>
      policy.split("; ").find((part) => part.startsWith(name + " "));
    expect(directive("default-src")).toBe("default-src 'self'");
    expect(directive("script-src")).toBe(
      "script-src 'self' 'nonce-n' 'strict-dynamic'",
    );
    // No wildcard or bare scheme anywhere; data: only for images.
    for (const part of policy.split("; ")) {
      expect(part).not.toMatch(/(^|\s)(\*|https?:)(\s|$)/);
      if (!part.startsWith("img-src ")) expect(part).not.toContain("data:");
    }
    expect(directive("img-src")).toBe(
      "img-src 'self' data: blob: https://project.supabase.co",
    );
  });
  it("permits isolated local Supabase and development debugging only explicitly", () => {
    expect(
      contentSecurityPolicy("n", "http://127.0.0.1:55431", true),
    ).toContain("'unsafe-eval'");
    expect(() => contentSecurityPolicy("n", "http://example.com")).toThrow();
    expect(() => contentSecurityPolicy("n", "javascript:alert(1)")).toThrow();
  });
});
describe("request-independent headers", () => {
  const header = (key: string) =>
    staticSecurityHeaders.find((item) => item.key === key)?.value;
  it("isolates the origin and disables unused browser capabilities", () => {
    expect(header("X-Content-Type-Options")).toBe("nosniff");
    expect(header("X-Frame-Options")).toBe("DENY");
    expect(header("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(header("Cross-Origin-Resource-Policy")).toBe("same-origin");
    expect(header("Strict-Transport-Security")).toMatch(/^max-age=\d{8,}$/);
    for (const feature of ["camera", "microphone", "geolocation", "payment"])
      expect(header("Permissions-Policy")).toContain(`${feature}=()`);
    expect(new Set(staticSecurityHeaders.map((item) => item.key)).size).toBe(
      staticSecurityHeaders.length,
    );
  });
  it("repeats for CDN-served files the values Next.js sends for pages", () => {
    const rules = readFileSync("netlify.toml", "utf8");
    for (const key of [
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Cross-Origin-Resource-Policy",
      "X-Permitted-Cross-Domain-Policies",
    ])
      expect(rules).toContain(`${key} = "${header(key)}"`);
    // A second X-Frame-Options or CSP on a page would conflict with the
    // per-request values, so the CDN rules must not set them.
    expect(rules).not.toMatch(/X-Frame-Options|Content-Security-Policy/);
  });
});
