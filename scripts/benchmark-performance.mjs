// Synthetic, disposable accounts on the existing LOOPBACK stack. Never production.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
const state = JSON.parse(execFileSync(process.execPath, [require.resolve("supabase/dist/supabase.js"), "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
assert.equal(state.API_URL, "http://127.0.0.1:55431");
const root = process.env.TASKNADO_TEST_URL || "http://127.0.0.1:3109";
assert.match(root, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const label = process.argv[2] || "after";
assert.match(label, /^[a-z0-9-]+$/);
const admin = createClient(state.API_URL, state.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const ok = (r) => { assert.ifError(r.error); return r.data; };
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
await context.addInitScript(() => {
  window.__perf = { lcp: 0, cls: 0, events: [], longTasks: [] };
  for (const [type, receive] of [
    ["largest-contentful-paint", (e) => { window.__perf.lcp = e.startTime; }],
    ["layout-shift", (e) => { if (!e.hadRecentInput) window.__perf.cls += e.value; }],
    ["event", (e) => { if (e.interactionId) window.__perf.events.push(e.duration); }],
    ["longtask", (e) => window.__perf.longTasks.push(e.duration)],
  ]) { try { new PerformanceObserver((l) => l.getEntries().forEach(receive)).observe({ type, buffered: true, durationThreshold: 16 }); } catch {} }
});
const page = await context.newPage();
page.setDefaultTimeout(120000);
const cdp = await context.newCDPSession(page);
await cdp.send("Performance.enable");
const requests = [], errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("requestfinished", r => { if (r.url().includes("/rest/v1/")) requests.push({ path: new URL(r.url()).pathname, ms: r.timing().responseEnd, bytes: null }); });
page.on("response", async r => { if (r.url().includes("/rest/v1/")) { try { const b = await r.body(); const request = requests.findLast(x => x.path === new URL(r.url()).pathname && x.bytes === null); if (request) request.bytes = b.length; } catch {} } });
const report = { label, recordedAt: new Date().toISOString(), environment: "local production Next build, Edge headless, local Supabase; synthetic data only", scenarios: [], errors };
let userId;
const settle = () => page.waitForLoadState("networkidle", { timeout: 120000 });
async function measure(name, action, ready) {
  const begin = requests.length;
  const metricsBefore = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(x => [x.name, x.value]));
  const start = performance.now();
  await action();
  if (ready) await ready();
  const visibleMs = performance.now() - start;
  await page.waitForTimeout(600);
  await settle();
  const metrics = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(x => [x.name, x.value]));
  return { name, visibleMs: Math.round(visibleMs), settledMs: Math.round(performance.now() - start), requests: requests.slice(begin), dom: await page.locator("*").count(), heapBytes: metrics.JSHeapUsedSize, taskMs: Math.round((metrics.TaskDuration >= metricsBefore.TaskDuration ? metrics.TaskDuration - metricsBefore.TaskDuration : metrics.TaskDuration) * 1000) };
}
try {
  report.public = await measure("public", () => page.goto(root), () => page.locator("#auth-email").waitFor());
  report.public.browser = await page.evaluate(() => ({ ...window.__perf, ttfb: performance.getEntriesByType("navigation")[0].responseStart, loadMs: performance.getEntriesByType("navigation")[0].loadEventEnd, jsBytes: performance.getEntriesByType("resource").filter(r => r.name.includes(".js")).reduce((n, r) => n + r.encodedBodySize, 0) }));
  const email = `performance-${crypto.randomUUID()}@tasknado.test`, password = `QA-${crypto.randomUUID()}!`;
  userId = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user.id;
  const fixtures = [];
  for (const size of [100, 1000, 10000]) {
    const w = ok(await admin.from("workspaces").insert({ owner_id: userId, name: `Benchmark ${size}`, category: "work" }).select("id").single());
    const ids = [];
    for (let offset = 0; offset < size; offset += 500) {
      const rows = Array.from({ length: Math.min(500, size - offset) }, (_, i) => ({ owner_id: userId, workspace_id: w.id, title: `Activity ${String(offset + i).padStart(5, "0")} ${i % 20 === 0 ? "needle" : "routine"}`, description: "Synthetic benchmark text. ".repeat(16) }));
      ids.push(...ok(await admin.from("activities").insert(rows).select("id")).map(x => x.id));
    }
    const events = ids.filter((_, i) => i % 10 === 0).map(id => ({ owner_id: userId, activity_id: id, type: "observation", content: "Synthetic observation needle", request_id: crypto.randomUUID() }));
    for (let offset = 0; offset < events.length; offset += 500) ok(await admin.from("activity_events").insert(events.slice(offset, offset + 500)));
    const notes = ok(await admin.from("notes").insert(Array.from({ length: Math.max(2, size / 20) }, (_, i) => ({ owner_id: userId, workspace_id: w.id, title: `Benchmark note ${i}` }))).select("id"));
    ok(await admin.from("note_entries").insert(notes.map(n => ({ owner_id: userId, note_id: n.id, content: "Synthetic long note. ".repeat(1000) }))));
    ok(await admin.from("workspace_observations").insert(Array.from({ length: Math.max(2, size / 100) }, () => ({ owner_id: userId, workspace_id: w.id, content: "Synthetic general observation needle" }))));
    fixtures.push({ size, workspace: w.id, activity: ids[0], note: notes[0].id });
  }
  report.login = await measure("login", async () => {
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar na minha conta", exact: true }).click();
  }, () => page.locator(".stats-grid").waitFor());
  for (const fixture of fixtures) {
    const url = `/workspaces/${fixture.workspace}`;
    // A real client navigation through the Next Link keeps the session cache alive.
    const navigate = async path => {
      await page.evaluate(path => { const a = document.createElement("a"); a.id = "benchmark-navigation"; a.href = path; document.body.append(a); }, path);
      // The app router is reached through the UI for warm transitions below; cold scope entry is a full document navigation.
      await page.goto(root + path);
    };
    const scenario = { size: fixture.size, measurements: [] };
    scenario.measurements.push(await measure("workspace-cold", () => navigate(url), async () => { await page.waitForURL(root + url); await page.locator(".activity-row").first().waitFor(); }));
    scenario.measurements.push(await measure("activities", () => page.locator(".workspace-tabs").getByRole("link", { name: "Tarefas", exact: true }).click(), async () => { await page.waitForURL(root + url + "/activities"); await page.locator(".activity-row").first().waitFor(); }));
    scenario.measurements.push(await measure("detail", () => page.locator(".activity-row").first().click(), () => page.locator(".detail-grid").first().waitFor()));
    scenario.measurements.push(await measure("activities-return", () => page.locator(".workspace-tabs").getByRole("link", { name: "Tarefas", exact: true }).click(), async () => { await page.waitForURL(root + url + "/activities"); await page.locator(".activity-row").first().waitFor(); }));
    scenario.measurements.push(await measure("notes", () => page.locator(".workspace-tabs").getByRole("link", { name: "Notas", exact: true }).click(), async () => { await page.waitForURL(root + url + "/notes"); await page.locator(".notes-layout").waitFor(); }));
    scenario.measurements.push(await measure("note-open", () => page.locator(".note-list-item").first().click(), () => page.locator(".note-entry textarea").first().waitFor()));
    scenario.measurements.push(await measure("dashboard-return", () => page.locator(".workspace-tabs").getByRole("link", { name: "Visão geral", exact: true }).click(), async () => { await page.waitForURL(root + url); await page.locator(".stats-grid").waitFor(); }));
    scenario.browser = await page.evaluate(() => window.__perf);
    report.scenarios.push(scenario);
    console.log(`Measured ${fixture.size} activities`);
  }
} finally {
  if (userId) ok(await admin.auth.admin.deleteUser(userId));
  await browser.close();
  mkdirSync("test-results/performance", { recursive: true });
  writeFileSync(`test-results/performance/${label}.json`, JSON.stringify(report, null, 2));
}
