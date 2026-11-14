// External, read-only probe of a deployed Tasknado. It sends a handful of
// anonymous GET requests, the same any visitor's browser sends, and reports
// availability problems and configuration drift as fixed codes. It never
// signs in, writes, or uses a privileged credential.
//
//   TASKNADO_SITE_URL=https://example.netlify.app node scripts/probe-deployment.mjs
//
// Optional: TASKNADO_SUPABASE_PUBLISHABLE_KEY (the public browser key) also
// checks the hosted Auth settings and that anonymous API access is refused.
import { fileURLToPath } from "node:url";

/** Problems in the headers of an HTML page response. */
export function assessPage(headers) {
  const problems = [];
  const get = (name) => headers.get(name) ?? "";
  const csp = get("content-security-policy");
  const directive = (name) =>
    csp
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(name + " ")) ?? "";
  const script = directive("script-src");
  if (!/'nonce-[A-Za-z0-9+/=_-]{16,}'/.test(script)) problems.push("csp_nonce");
  if (!script.includes("'strict-dynamic'")) problems.push("csp_strict_dynamic");
  if (/'unsafe-(inline|eval)'|(^|\s)(\*|https?:)(\s|$)/.test(script))
    problems.push("csp_script_widened");
  if (directive("default-src") !== "default-src 'self'")
    problems.push("csp_default_src");
  for (const [name, code] of [
    ["object-src", "csp_object_src"],
    ["base-uri", "csp_base_uri"],
    ["frame-ancestors", "csp_frame_ancestors"],
  ])
    if (directive(name) !== `${name} 'none'`) problems.push(code);
  const hsts = /max-age=(\d+)/.exec(get("strict-transport-security"));
  if (!hsts || Number(hsts[1]) < 31536000) problems.push("hsts");
  if (get("x-content-type-options").toLowerCase() !== "nosniff")
    problems.push("nosniff");
  if (get("x-frame-options").toUpperCase() !== "DENY")
    problems.push("frame_options");
  if (!/no-referrer|strict-origin/.test(get("referrer-policy")))
    problems.push("referrer_policy");
  if (get("cross-origin-opener-policy") !== "same-origin")
    problems.push("opener_policy");
  if (!/camera=\(\)/.test(get("permissions-policy")))
    problems.push("permissions_policy");
  if (!/no-store/.test(get("cache-control"))) problems.push("page_cacheable");
  if (get("x-powered-by")) problems.push("powered_by");
  return problems;
}

/** Problems in the public Auth settings document of the Supabase project. */
export function assessAuth(settings) {
  const problems = [];
  if (settings?.mailer_autoconfirm !== false)
    problems.push("auth_email_unconfirmed");
  const enabled = Object.entries(settings?.external ?? {})
    .filter(([, on]) => on)
    .map(([name]) => name);
  if (enabled.length !== 1 || enabled[0] !== "email")
    problems.push("auth_providers_changed");
  return problems;
}

/** True only for keys that are designed to be shipped to browsers. */
export function isPublicKey(key) {
  if (key.startsWith("sb_publishable_")) return true;
  try {
    const payload = JSON.parse(
      Buffer.from(key.split(".")[1], "base64url").toString("utf8"),
    );
    return payload.role === "anon";
  } catch {
    return false;
  }
}

export function supabaseOrigin(csp) {
  return (
    /connect-src [^;]*?(https:\/\/[a-z0-9.-]+)/i.exec(csp ?? "")?.[1] ?? null
  );
}

async function probe(site, key) {
  const problems = [];
  const request = (url, init) =>
    fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
      ...init,
    });
  let page;
  try {
    page = await request(site);
    if (page.status !== 200) problems.push("site_unavailable");
    else problems.push(...assessPage(page.headers));
    const again = await request(site);
    const nonce = (response) =>
      /'nonce-([^']+)'/.exec(
        response.headers.get("content-security-policy") ?? "",
      )?.[1];
    if (nonce(page) && nonce(page) === nonce(again))
      problems.push("csp_nonce_reused");
  } catch {
    return ["site_unreachable"];
  }
  try {
    const plain = await request(site.replace(/^https:/, "http:"));
    const location = plain.headers.get("location") ?? "";
    if (![301, 308].includes(plain.status) || !location.startsWith("https://"))
      problems.push("http_not_redirected");
  } catch {
    problems.push("http_not_redirected");
  }
  try {
    const asset = await request(new URL("/brand/favicon-32.png", site));
    if (asset.status !== 200) problems.push("static_unavailable");
    else if (
      (asset.headers.get("x-content-type-options") ?? "").toLowerCase() !==
      "nosniff"
    )
      problems.push("static_nosniff");
  } catch {
    problems.push("static_unavailable");
  }
  const api = supabaseOrigin(page.headers.get("content-security-policy"));
  if (!api) problems.push("supabase_origin_missing");
  else if (key) {
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    try {
      const settings = await request(`${api}/auth/v1/settings`, { headers });
      if (settings.status !== 200) problems.push("auth_unavailable");
      else problems.push(...assessAuth(await settings.json()));
      // The anonymous role must not reach any application table.
      const rows = await request(
        `${api}/rest/v1/workspaces?select=id&limit=1`,
        {
          headers,
        },
      );
      if (rows.status >= 500) problems.push("api_unavailable");
      else if (![401, 403].includes(rows.status))
        problems.push("anonymous_api_access");
    } catch {
      problems.push("api_unreachable");
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const site = process.env.TASKNADO_SITE_URL ?? "";
  if (!/^https:\/\/[a-z0-9.-]+\/?$/i.test(site))
    throw Error("TASKNADO_SITE_URL must be an https origin");
  const key = process.env.TASKNADO_SUPABASE_PUBLISHABLE_KEY || undefined;
  // Refuse anything that is not a browser-safe key.
  if (key && !isPublicKey(key))
    throw Error("Use only the public browser key for the probe");
  const problems = await probe(site.replace(/\/$/, "") + "/", key);
  console.log(
    JSON.stringify({
      event: "deployment_probe",
      apiChecked: Boolean(key),
      problems,
    }),
  );
  if (problems.length) process.exitCode = 1;
}
