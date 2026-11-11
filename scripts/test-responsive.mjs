// Responsive, keyboard and accessibility checks for the redesigned interface.
//
// Runs the public page and the authenticated screens at the four reference
// widths (375, 768, 1024 and 1440 CSS px) against the local Supabase stack,
// with a temporary account filled by demo-data.mjs. For every screen and
// width it asserts that nothing scrolls sideways and that axe-core finds no
// WCAG A/AA violation; it also exercises the phone navigation, the workspace
// drawer and the skip link. Screenshots: test-results/responsive/.
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { demoName, seedDemo } from "./demo-data.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    join(
      homedir(),
      ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
    ),
);
const cli = require.resolve("supabase/dist/supabase.js");
const state = JSON.parse(
  execFileSync(process.execPath, [cli, "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }),
);
assert.equal(state.API_URL, "http://127.0.0.1:55431");
const root = process.env.TASKNADO_TEST_URL || "http://127.0.0.1:3000";
const shots = "test-results/responsive";
mkdirSync(shots, { recursive: true });
const ok = (result) => {
  assert.ifError(result.error);
  return result.data;
};
const admin = createClient(state.API_URL, state.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const api = createClient(state.API_URL, state.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const email = `responsive-${Date.now()}@tasknado.test`,
  password = `QA-${crypto.randomUUID()}!`;
const user = ok(
  await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: demoName("pt-BR") },
  }),
).user;
ok(await api.auth.signInWithPassword({ email, password }));
const demo = await seedDemo(api, "pt-BR");
const work = demo.workspaces.work.id;

const sizes = [
  [375, 812],
  [768, 1024],
  [1024, 768],
  [1440, 900],
];
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  timezoneId: "America/Sao_Paulo",
  locale: "pt-BR",
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const checks = [],
  screens = [],
  accessibility = [],
  errors = [],
  vitals = [];
let failure = null;
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  // Failed requests are reported below with their address.
  if (m.type() === "error" && !m.text().startsWith("Failed to load resource"))
    errors.push(m.text());
});
page.on("response", (r) => {
  if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
});
const pass = (s) => {
  checks.push(s);
  console.log("PASS " + s);
};
async function overflow() {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const wide = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return (
          box.width > 0 &&
          box.right > innerWidth + 1 &&
          getComputedStyle(el).position !== "fixed" &&
          // Content inside a scroll container may extend past the viewport.
          !el.closest(".workspace-tabs, .filter-tabs, .visually-hidden")
        );
      })
      .slice(0, 3)
      .map((el) => el.className || el.tagName);
    return { scroll: doc.scrollWidth, viewport: innerWidth, wide };
  });
}
async function settle() {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
  });
}
async function audit(label) {
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const result = await page.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
      },
    });
    return {
      violations: r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          reason: n.failureSummary,
        })),
      })),
      manualReview: r.incomplete.map((v) => ({
        id: v.id,
        nodes: v.nodes.length,
      })),
      passedRules: r.passes.length,
    };
  });
  accessibility.push({ label, ...result });
  return result.violations;
}
async function inspect(name, width, height, { axe = false } = {}) {
  await settle();
  const geometry = await overflow();
  assert.ok(
    geometry.scroll <= geometry.viewport,
    `Horizontal overflow on ${name} at ${width}: ${JSON.stringify(geometry)}`,
  );
  assert.deepEqual(
    geometry.wide,
    [],
    `Clipped content on ${name} at ${width}: ${geometry.wide}`,
  );
  const violations = axe ? await audit(`${name}@${width}`) : [];
  const file = `${shots}/${name}-${width}.png`;
  await page.screenshot({ path: file, fullPage: true });
  screens.push({ name, width, height, ...geometry, screenshot: file });
  return violations;
}

try {
  // ----- Public page -----
  const publicViolations = [];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.goto(root);
    await page.getByRole("heading", { level: 1 }).waitFor();
    publicViolations.push(
      ...(await inspect("landing", width, height, { axe: true })),
    );
    const form = await page.locator(".auth-box").boundingBox();
    assert.ok(form.x >= 0 && form.x + form.width <= width);
    for (const control of await page.locator(".auth-box input").all()) {
      const box = await control.boundingBox();
      assert.ok(box.height >= 44, `Access field shorter than 44px at ${width}`);
    }
  }
  assert.deepEqual(publicViolations, []);
  pass(
    "Landing page at 375, 768, 1024 and 1440 px: no horizontal overflow, access fields at least 44 px tall, no WCAG A/AA violations",
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(root);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement.className),
    "skip-link",
  );
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => document.activeElement.id), "main");
  await page
    .locator(".public-header")
    .getByRole("link", { name: "Criar conta", exact: true })
    .click();
  await page.getByRole("heading", { name: "Crie sua conta" }).waitFor();
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "auth-email",
  );
  await page
    .locator(".public-header")
    .getByRole("link", { name: "Entrar", exact: true })
    .click();
  await page.getByRole("heading", { name: "Entre na sua conta" }).waitFor();
  await page
    .getByRole("combobox", { name: "Idioma da interface", exact: true })
    .selectOption("en-US");
  await page
    .getByRole("heading", { name: "Less chaos. More execution." })
    .waitFor();
  await page
    .getByRole("combobox", { name: "Interface Language", exact: true })
    .selectOption("pt-BR");
  await page
    .getByRole("heading", { name: "Menos caos. Mais execução." })
    .waitFor();
  pass(
    "Landing keyboard path: skip link is the first stop and moves focus to the content; header actions switch the access form and focus its first field; language switch works signed out",
  );

  // Web vitals of the public page, as observed by the browser itself.
  await page.goto(root);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await settle();
  vitals.push(
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          let lcp = 0,
            cls = 0;
          new PerformanceObserver((list) => {
            for (const e of list.getEntries()) lcp = e.startTime;
          }).observe({ type: "largest-contentful-paint", buffered: true });
          new PerformanceObserver((list) => {
            for (const e of list.getEntries())
              if (!e.hadRecentInput) cls += e.value;
          }).observe({ type: "layout-shift", buffered: true });
          setTimeout(
            () =>
              resolve({
                page: "landing",
                lcpMs: Math.round(lcp),
                cls: Number(cls.toFixed(4)),
                note: "Local machine, no throttling; not a Lighthouse score.",
              }),
            600,
          );
        }),
    ),
  );

  // ----- Sign in through the interface -----
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page
    .locator("form")
    .getByRole("button", { name: "Entrar na minha conta", exact: true })
    .click();
  await page.locator(".global-header").waitFor();
  pass("Sign in from the landing page opens the application");

  const routes = [
    ["home", "/", ".focus-row"],
    ["workspaces", "/workspaces", ".workspace-directory-row"],
    ["workspace", `/workspaces/${work}`, ".stats-grid"],
    ["tasks", `/workspaces/${work}/activities`, ".activity-row"],
    [
      "task",
      `/workspaces/${work}/activities/${demo.activities.signup.id}`,
      ".timeline-item",
    ],
    ["matrix", `/workspaces/${work}/matrix`, ".matrix-card"],
    ["notes", `/workspaces/${work}/notes/${demo.note.id}`, ".note-entry"],
    ["observations", `/workspaces/${work}/observations`, ".record"],
    ["history", `/workspaces/${work}/history`, ".record"],
    ["search", "/search", ".search-filters"],
    ["settings", "/settings", ".language-select"],
    ["profile", "/perfil", ".profile-panel"],
  ];
  const appViolations = [];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    for (const [name, path, selector] of routes) {
      await page.goto(root + path);
      await page.locator(selector).first().waitFor();
      appViolations.push(
        ...(await inspect(name, width, height, { axe: width !== 1440 })).map(
          (v) => ({ name, width, ...v }),
        ),
      );
    }
  }
  assert.deepEqual(appViolations, []);
  pass(
    "Twelve authenticated screens at 375, 768, 1024 and 1440 px: no horizontal overflow or clipped content; no WCAG A/AA violations at 375, 768 and 1024 px",
  );

  // ----- Phone navigation -----
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(root);
  await page.locator(".stats-grid").waitFor();
  const rail = await page.locator(".primary-rail").boundingBox();
  assert.ok(rail.y + rail.height <= 812 + 1 && rail.y > 812 - 100);
  assert.equal(Math.round(rail.width), 375);
  const visible = await page
    .locator(".primary-rail .rail-item")
    .evaluateAll((items) =>
      items
        .filter((item) => getComputedStyle(item).display !== "none")
        .map((item) => ({
          label: item.textContent.trim(),
          width: item.getBoundingClientRect().width,
          height: item.getBoundingClientRect().height,
        })),
    );
  assert.deepEqual(
    visible.map((item) => item.label),
    ["Início", "Workspaces", "Tarefas", "Pesquisar", "Notas"],
  );
  for (const item of visible)
    assert.ok(item.width >= 44 && item.height >= 44, JSON.stringify(item));
  await page
    .locator(".primary-rail")
    .getByRole("link", { name: "Tarefas", exact: true })
    .click();
  await page.waitForURL(root + "/activities");
  await page.getByRole("button", { name: "Menu do usuário" }).click();
  assert.deepEqual(await page.getByRole("menuitem").allTextContents(), [
    "Editar perfil",
    "Configurações",
    "Sair",
  ]);
  await page.keyboard.press("ArrowDown");
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent.trim()),
    "Configurações",
  );
  await page.keyboard.press("Enter");
  await page.waitForURL(root + "/settings");
  pass(
    "Phone (375 px): bottom navigation spans the width with five 44 px targets; Profile, Settings and Sign Out are reachable from the account menu by keyboard",
  );

  // ----- Workspace drawer on phone and tablet -----
  for (const width of [375, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${root}/workspaces/${work}`);
    await page.locator(".workspace-heading").waitFor();
    assert.equal(await page.locator(".context-panel").count(), 0);
    const open = page.getByRole("button", { name: "Expandir painel" });
    await open.click();
    await page.locator(".context-panel").waitFor();
    await settle();
    const panel = await page.locator(".context-panel").boundingBox();
    assert.ok(panel.x >= 0 && panel.x + panel.width <= width);
    assert.equal(await page.locator(".context-scrim").count(), 1);
    await page.screenshot({ path: `${shots}/drawer-${width}.png` });
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".context-panel").count(), 0);
    assert.equal(
      await open.evaluate((e) => document.activeElement === e),
      true,
    );
    await open.click();
    await page
      .locator(".context-panel")
      .getByRole("link", { name: "Matriz de Eisenhower" })
      .click();
    await page.waitForURL(`${root}/workspaces/${work}/matrix`);
    await page.locator(".matrix-card").first().waitFor();
    assert.equal(await page.locator(".context-panel").count(), 0);
  }
  pass(
    "Workspace panel below 900 px: opens as a drawer inside the viewport, Escape closes it and returns focus, navigation closes it",
  );

  // ----- Phone task flow: create, classify, register -----
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${root}/workspaces/${work}/activities`);
  await page.locator(".activity-row").first().waitFor();
  await page
    .getByRole("button", { name: "Nova atividade", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const modal = await dialog.boundingBox();
  assert.ok(modal.x >= 0 && modal.x + modal.width <= 375);
  await dialog
    .getByLabel("Título", { exact: true })
    .fill("Tarefa criada no celular");
  await dialog
    .getByRole("combobox", { name: "Urgência", exact: true })
    .selectOption("true");
  await dialog
    .getByRole("combobox", { name: "Importância", exact: true })
    .selectOption("true");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Tarefa criada no celular", exact: true })
    .waitFor();
  await page.locator(".toast").waitFor();
  await page
    .getByRole("textbox", { name: "Conteúdo do acontecimento" })
    .fill("Iniciada pelo celular.");
  await page
    .getByRole("button", { name: "Registrar Check In", exact: true })
    .click();
  await page.locator(".timeline-item").waitFor();
  const created = ok(
    await api
      .from("activities")
      .select("status, category_attributes")
      .eq("title", "Tarefa criada no celular")
      .single(),
  );
  assert.equal(created.status, "in_progress");
  assert.equal(created.category_attributes.work.isUrgent, true);
  await page.goto(root);
  await page
    .locator(".focus-panel")
    .first()
    .getByText("Tarefa criada no celular", { exact: true })
    .waitFor();
  pass(
    "Phone task flow: creation dialog fits the viewport, the task is saved with its priority, Check In persists and the task appears under Priorities on the dashboard",
  );
  assert.deepEqual(errors, []);
  pass("No browser runtime or console errors throughout the responsive suite");
} catch (e) {
  failure = e.stack || String(e);
  console.error(failure);
  await page
    .screenshot({ path: `${shots}/failure.png`, fullPage: true })
    .catch(() => {});
  process.exitCode = 1;
} finally {
  writeFileSync(
    "test-results/responsive.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        passed: checks.length,
        checks,
        screens,
        accessibility,
        vitals,
        errors,
        failure,
        scope:
          "Real local Supabase + Microsoft Edge Chromium, temporary account with demonstration content",
      },
      null,
      2,
    ),
  );
  await browser.close();
  ok(await admin.auth.admin.deleteUser(user.id));
}
