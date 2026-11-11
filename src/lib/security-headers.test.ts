import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "./security-headers";

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
  });
  it("permits isolated local Supabase and development debugging only explicitly", () => {
    expect(
      contentSecurityPolicy("n", "http://127.0.0.1:55431", true),
    ).toContain("'unsafe-eval'");
    expect(() => contentSecurityPolicy("n", "http://example.com")).toThrow();
    expect(() => contentSecurityPolicy("n", "javascript:alert(1)")).toThrow();
  });
});
