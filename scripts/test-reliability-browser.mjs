// Real Auth/PostgREST + PostgreSQL faults, only in the isolated security stack.
// No fulfilled/mock HTTP responses. All temporary DDL and accounts are restored.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { securityStack } from "./security-stack.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    join(
      homedir(),
      ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
    ),
);
const state = securityStack();
assert.equal(state.API_URL, "http://127.0.0.1:56431");
const root = process.env.TASKNADO_TEST_URL || "http://127.0.0.1:3109";
assert.match(root, /^http:\/\/127\.0\.0\.1:\d+$/);
const sql = (source) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_tasknado_security",
      "psql",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    {
      input: source,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
const admin = createClient(state.API_URL, state.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const api = createClient(state.API_URL, state.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ok = (r) => {
  assert.ifError(r.error);
  return r.data;
};
const until = async (fn) => {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  assert.fail("Condition timed out");
};
const checks = [];
const pass = (s) => {
  checks.push(s);
  console.log("PASS " + s);
};
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let owner,
  renamed = false,
  revoked = false;
const routines = [
  ["activity_page", "uuid,jsonb,text,jsonb,integer"],
  ["activity_total", "uuid,jsonb"],
  ["activity_summary", "uuid"],
];
mkdirSync("test-results/reliability", { recursive: true });
try {
  const email = `reliability-${crypto.randomUUID()}@tasknado.test`,
    password = `QA-${crypto.randomUUID()}!`;
  owner = ok(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
  ).user.id;
  ok(await api.auth.signInWithPassword({ email, password }));
  const workspace = ok(
    await api
      .from("workspaces")
      .insert({ name: "Reliability fixture", category: "work" })
      .select("id")
      .single(),
  );
  ok(
    await api
      .from("activities")
      .insert({ workspace_id: workspace.id, title: "Preserved fixture" }),
  );
  const before = ok(
    await api.from("activities").select("id,title,created_at"),
  ).map((x) => JSON.stringify(x));
  await page.goto(root);
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Entrar na minha conta", exact: true })
    .click();
  await until(
    async () =>
      await page
        .locator(".stats-grid strong")
        .allTextContents()
        .then((x) => x.join(",") === "1,0,0"),
  );
  pass("Authenticated reads return genuine counts without Realtime");
  sql(
    "BEGIN;" +
      routines
        .map(
          ([name, args]) =>
            `ALTER FUNCTION public.${name}(${args}) RENAME TO reliability_test_${name};`,
        )
        .join("") +
      "NOTIFY pgrst,'reload schema'; COMMIT;",
  );
  renamed = true;
  await until(
    async () =>
      (await api.rpc("activity_summary", {})).error?.code === "PGRST202",
  );
  await page.reload();
  await until(
    async () =>
      await page
        .getByRole("alert")
        .allTextContents()
        .then((x) =>
          x.some((s) => s.includes("Serviço temporariamente indisponível")),
        ),
  );
  assert.equal(await page.locator(".stats-grid strong").count(), 0);
  assert.equal(await page.locator(".focus-empty,.empty").count(), 0);
  assert.ok(
    (await page.locator(".focus-panel .count").allTextContents()).every(
      (x) => x === "—",
    ),
  );
  await page.screenshot({
    path: "test-results/reliability/missing-rpc-desktop.png",
    fullPage: true,
  });
  pass(
    "Real missing SQL functions yield PGRST202/404, never zero or empty dashboard",
  );
  await page
    .getByLabel("Idioma da interface", { exact: true })
    .selectOption("en-US");
  await until(
    async () =>
      await page
        .getByRole("alert")
        .allTextContents()
        .then((x) =>
          x.some((s) => s.includes("Service temporarily unavailable")),
        ),
  );
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "test-results/reliability/missing-rpc-mobile-en-dark.png",
    fullPage: true,
  });
  pass("Failure state remains localized and readable on mobile/dark theme");
  await page.goto(`${root}/activities`);
  await until(async () => (await page.getByRole("alert").count()) > 0);
  assert.equal(await page.locator(".empty").count(), 0);
  await page.goto(`${root}/workspaces/${workspace.id}/matrix`);
  await until(
    async () =>
      (await page.locator(".matrix-quadrant [role=alert]").count()) === 5,
  );
  assert.equal(
    await page.getByText("No tasks in this quadrant", { exact: true }).count(),
    0,
  );
  assert.ok(
    (await page.locator(".matrix-quadrant .count").allTextContents()).every(
      (x) => x === "—",
    ),
  );
  pass("Activities and all matrix quadrants reject false empty states");
  await page.goto(root);
  sql(
    "BEGIN;" +
      routines
        .map(
          ([name, args]) =>
            `ALTER FUNCTION public.reliability_test_${name}(${args}) RENAME TO ${name};`,
        )
        .join("") +
      "NOTIFY pgrst,'reload schema'; COMMIT;",
  );
  renamed = false;
  await until(async () => !(await api.rpc("activity_summary", {})).error);
  await page.reload();
  await until(
    async () =>
      await page
        .locator(".stats-grid strong")
        .allTextContents()
        .then((x) => x.join(",") === "1,0,0"),
  );
  pass("Restoring actual SQL functions recovers genuine data");
  sql(
    "REVOKE EXECUTE ON FUNCTION public.activity_summary(uuid) FROM authenticated; NOTIFY pgrst,'reload schema';",
  );
  revoked = true;
  await until(
    async () => (await api.rpc("activity_summary", {})).status === 403,
  );
  await page.reload();
  await until(
    async () =>
      (await page.locator('[data-read-state="unauthorized"]').count()) > 0,
  );
  assert.equal(await page.locator(".stats-grid strong").count(), 0);
  pass("Actual PostgreSQL permission denial is distinguished from empty data");
  sql(
    "GRANT EXECUTE ON FUNCTION public.activity_summary(uuid) TO authenticated; NOTIFY pgrst,'reload schema';",
  );
  revoked = false;
  await until(async () => !(await api.rpc("activity_summary", {})).error);
  await context.setOffline(true);
  await page.reload().catch(() => {});
  await context.setOffline(false);
  await page.goto(root);
  await until(
    async () => (await page.locator(".stats-grid strong").count()) === 3,
  );
  assert.deepEqual(
    ok(await api.from("activities").select("id,title,created_at")).map((x) =>
      JSON.stringify(x),
    ),
    before,
  );
  pass("Network recovery preserves original records");
  assert.deepEqual(errors, []);
} finally {
  if (renamed)
    sql(
      "BEGIN;" +
        routines
          .map(
            ([name, args]) =>
              `ALTER FUNCTION public.reliability_test_${name}(${args}) RENAME TO ${name};`,
          )
          .join("") +
        "NOTIFY pgrst,'reload schema'; COMMIT;",
    );
  if (revoked)
    sql(
      "GRANT EXECUTE ON FUNCTION public.activity_summary(uuid) TO authenticated; NOTIFY pgrst,'reload schema';",
    );
  if (owner) ok(await admin.auth.admin.deleteUser(owner));
  await browser.close();
  writeFileSync(
    "test-results/reliability/browser.json",
    JSON.stringify(
      {
        environment:
          "isolated loopback security stack; real PostgreSQL/Auth/PostgREST; no Realtime",
        checks,
        errors,
      },
      null,
      2,
    ),
  );
}
