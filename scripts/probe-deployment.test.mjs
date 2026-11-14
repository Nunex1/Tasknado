import { describe, expect, it } from "vitest";
import {
  assessAuth,
  assessPage,
  isPublicKey,
  supabaseOrigin,
} from "./probe-deployment.mjs";
import {
  contentSecurityPolicy,
  staticSecurityHeaders,
} from "../src/lib/security-headers";

// The headers this repository produces for a page, as a deployment serves them.
function page(overrides = {}) {
  const headers = new Headers({
    "content-security-policy": contentSecurityPolicy(
      "OTYzNTlkNzAtYzk0ZC00Mzg3LWExOGUt",
      "https://project.supabase.co",
    ),
    "cache-control": "private, no-store",
  });
  for (const { key, value } of staticSecurityHeaders) headers.set(key, value);
  for (const [key, value] of Object.entries(overrides))
    if (value === null) headers.delete(key);
    else headers.set(key, value);
  return headers;
}

describe("deployment probe", () => {
  it("accepts exactly the headers the application is configured to send", () => {
    expect(assessPage(page())).toEqual([]);
    expect(supabaseOrigin(page().get("content-security-policy"))).toBe(
      "https://project.supabase.co",
    );
  });

  it("names each missing or weakened protection", () => {
    const csp = page().get("content-security-policy");
    const cases = [
      [{ "content-security-policy": null }, "csp_nonce"],
      [
        {
          "content-security-policy": csp.replace(
            "'strict-dynamic'",
            "'unsafe-inline'",
          ),
        },
        "csp_script_widened",
      ],
      [
        {
          "content-security-policy": csp.replace(
            "default-src 'self'",
            "default-src *",
          ),
        },
        "csp_default_src",
      ],
      [
        {
          "content-security-policy": csp.replace(
            "frame-ancestors 'none'",
            "frame-ancestors *",
          ),
        },
        "csp_frame_ancestors",
      ],
      [{ "strict-transport-security": "max-age=300" }, "hsts"],
      [{ "strict-transport-security": null }, "hsts"],
      [{ "x-content-type-options": null }, "nosniff"],
      [{ "x-frame-options": "SAMEORIGIN" }, "frame_options"],
      [{ "cross-origin-opener-policy": null }, "opener_policy"],
      [{ "permissions-policy": null }, "permissions_policy"],
      [{ "cache-control": "public, max-age=3600" }, "page_cacheable"],
      [{ "x-powered-by": "Next.js" }, "powered_by"],
    ];
    for (const [overrides, code] of cases)
      expect(assessPage(page(overrides)), code).toContain(code);
  });

  it("flags hosted Auth settings that differ from the reviewed ones", () => {
    const reviewed = {
      mailer_autoconfirm: false,
      external: { email: true, google: false, anonymous_users: false },
    };
    expect(assessAuth(reviewed)).toEqual([]);
    expect(assessAuth({ ...reviewed, mailer_autoconfirm: true })).toEqual([
      "auth_email_unconfirmed",
    ]);
    expect(
      assessAuth({ ...reviewed, external: { email: true, google: true } }),
    ).toEqual(["auth_providers_changed"]);
    expect(
      assessAuth({
        ...reviewed,
        external: { email: true, anonymous_users: true },
      }),
    ).toEqual(["auth_providers_changed"]);
    expect(assessAuth(undefined)).toEqual([
      "auth_email_unconfirmed",
      "auth_providers_changed",
    ]);
  });

  it("only ever sends a browser-safe key", () => {
    const jwt = (role) =>
      [
        "e30",
        Buffer.from(JSON.stringify({ role })).toString("base64url"),
        "x",
      ].join(".");
    expect(isPublicKey("sb_publishable_abc")).toBe(true);
    expect(isPublicKey(jwt("anon"))).toBe(true);
    expect(isPublicKey(jwt("service_role"))).toBe(false);
    expect(isPublicKey("sb_secret_abc")).toBe(false);
    expect(isPublicKey("anything-else")).toBe(false);
  });
});
