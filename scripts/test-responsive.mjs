// Responsive, theme, navigation and accessibility checks for the interface.
//
// Runs the public page and the authenticated screens at the four reference
// widths (375, 768, 1024 and 1440 CSS px) against the local Supabase stack,
// with a temporary account filled by demo-data.mjs and a second account that
// must stay invisible to the first. It asserts that nothing scrolls sideways,
// that axe-core finds no WCAG A/AA violation in the light and in the dark
// theme, and walks the test matrix of the mobile-first specification: phone
// drawer, workspace switching, task creation and editing, Light/Dark/System
// with persistence, tablet and desktop navigation, and data isolation.
// Screenshots: test-results/responsive/.
import { localStack } from "./security-stack.mjs";
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
// Development stack by default; TASKNADO_TEST_STACK=security selects the
// isolated stack that carries every migration. Loopback only, either way.
const state = localStack();
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
const university = demo.workspaces.university;

// A second account whose data the first one must never see.
const strangerEmail = `stranger-${Date.now()}@tasknado.test`;
const strangerMark = `alheio-${crypto.randomUUID().slice(0, 8)}`;
const stranger = ok(
  await admin.auth.admin.createUser({
    email: strangerEmail,
    password,
    email_confirm: true,
  }),
).user;
const strangerApi = createClient(state.API_URL, state.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
ok(
  await strangerApi.auth.signInWithPassword({ email: strangerEmail, password }),
);
const strangerWorkspace = ok(
  await strangerApi
    .from("workspaces")
    .insert({ name: `Workspace ${strangerMark}`, category: "work" })
    .select()
    .single(),
);
const strangerActivity = ok(
  await strangerApi
    .from("activities")
    .insert({
      title: `Tarefa ${strangerMark}`,
      workspace_id: strangerWorkspace.id,
    })
    .select()
    .single(),
);

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
// Records the moment data-theme first appears on <html>: with the inline
// script in <head> that is before <body> exists, hence before any paint.
await context.addInitScript(() => {
  window.__themeEarly = null;
  // <html> does not exist yet when this runs, so the document is observed.
  new MutationObserver(() => {
    const theme = document.documentElement?.getAttribute("data-theme");
    if (window.__themeEarly === null && theme)
      window.__themeEarly = { theme, beforeBody: document.body === null };
  }).observe(document, {
    attributes: true,
    subtree: true,
    attributeFilter: ["data-theme"],
  });
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
const background = () =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const themeOf = () =>
  page.evaluate(() => document.documentElement.getAttribute("data-theme"));
const dark = "rgb(11, 18, 32)",
  white = "rgb(255, 255, 255)";
const focusIn = (selector) =>
  page.evaluate((s) => !!document.activeElement?.closest(s), selector);
async function openDrawer() {
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Menu de navegação" });
  await drawer.waitFor();
  await settle();
  return drawer;
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

  // ----- Dark theme, as the system preference (no stored choice) -----
  await page.emulateMedia({ colorScheme: "dark" });
  const darkViolations = [];
  for (const [width, height] of [
    [375, 812],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    for (const [name, path, selector] of routes) {
      await page.goto(root + path);
      await page.locator(selector).first().waitFor();
      assert.equal(await themeOf(), null);
      assert.equal(await background(), dark);
      darkViolations.push(
        ...(await inspect(`dark-${name}`, width, height, { axe: true })).map(
          (v) => ({ name, width, ...v }),
        ),
      );
    }
  }
  assert.deepEqual(darkViolations, []);
  assert.ok(
    (await (await page.request.get(root)).text()).includes("tasknado.theme"),
    "The server HTML must carry the inline theme script",
  );
  pass(
    "Dark theme following the system preference: twelve authenticated screens at 375 and 1440 px keep the dark surface, do not overflow and report no WCAG A/AA violations (contrast included)",
  );
  await page.emulateMedia({ colorScheme: "light" });

  // ----- Phone: navigation hidden by default, drawer on demand -----
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${root}/workspaces/${work}/activities`);
  await page.locator(".activity-row").first().waitFor();
  await settle();
  assert.equal(await page.locator(".primary-rail").count(), 0);
  assert.equal(await page.locator(".context-panel").count(), 0);
  assert.equal(await page.locator(".nav-drawer").count(), 0);
  const content = await page.locator(".main-content").boundingBox();
  assert.equal(content.x, 0);
  assert.equal(Math.round(content.width), 375);
  assert.equal((await page.locator(".global-header").boundingBox()).height, 56);
  assert.deepEqual(
    await page
      .locator(".header-title")
      .evaluate((e) => [...e.children].map((c) => c.textContent)),
    ["Lançamento do app", "Tarefas"],
  );
  for (const control of await page
    .locator(".global-header")
    .locator("button, a")
    .all()) {
    const box = await control.boundingBox();
    assert.ok(
      box.width >= 40 && box.height >= 40,
      `Header control smaller than 40px: ${JSON.stringify(box)}`,
    );
  }
  await page.evaluate(() => window.scrollTo(0, 240));
  const menuButton = page.getByRole("button", {
    name: "Abrir menu",
    exact: true,
  });
  // How long the browser took to answer the tap that opens the drawer.
  await page.evaluate(() => {
    window.__interaction = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        window.__interaction = Math.max(window.__interaction, entry.duration);
    }).observe({ type: "event", durationThreshold: 16, buffered: false });
  });
  let drawer = await openDrawer();
  await page.waitForTimeout(300);
  vitals.push({
    page: "phone drawer open (375 px)",
    interactionMs: await page.evaluate(() => window.__interaction),
    note: "Longest event duration reported by the Event Timing API for this one tap; below 16 ms is reported as 0. Local machine, not a field INP.",
  });
  const drawerBox = await drawer.boundingBox();
  assert.ok(drawerBox.x === 0 && drawerBox.width <= 375 - 44);
  assert.equal(Math.round(drawerBox.height), 812);
  assert.equal(await page.evaluate(() => scrollY), 240);
  assert.equal((await page.locator(".main-content").boundingBox()).x, 0);
  assert.equal(await focusIn(".nav-drawer"), true);
  // Everything behind the drawer leaves the accessibility tree. (The live
  // region that announces workspace changes stays exposed on purpose.)
  for (const region of [".global-header", ".desktop-content"])
    assert.equal(
      await page
        .locator(region)
        .evaluate((e) => !!e.closest('[aria-hidden="true"]')),
      true,
      `${region} must be hidden from assistive technology behind the drawer`,
    );
  assert.equal(
    await page.evaluate(() => getComputedStyle(document.body).overflow),
    "hidden",
  );
  const geometry = await overflow();
  assert.ok(geometry.scroll <= geometry.viewport, JSON.stringify(geometry));
  for (const target of await drawer.locator("a, button, label").all()) {
    const box = await target.boundingBox();
    assert.ok(box.height >= 44, `Drawer target shorter than 44px`);
  }
  assert.deepEqual(await audit("drawer@375"), []);
  await page.screenshot({ path: `${shots}/drawer-375.png` });
  // Focus stays inside while tabbing through every control and around.
  const stops = await drawer.locator("a, button, input").count();
  for (let i = 0; i < stops + 2; i++) {
    await page.keyboard.press("Tab");
    assert.equal(await focusIn(".nav-drawer"), true, `Focus left at tab ${i}`);
  }
  await page.keyboard.press("Escape");
  await drawer.waitFor({ state: "detached" });
  // Focus goes back on the next task after the dialog unmounts.
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "Abrir menu",
  );
  assert.equal(
    await menuButton.evaluate((e) => document.activeElement === e),
    true,
  );
  assert.equal(await page.evaluate(() => scrollY), 240);
  drawer = await openDrawer();
  await page.mouse.click(360, 400); // outside the panel
  await drawer.waitFor({ state: "detached" });
  drawer = await openDrawer();
  await drawer
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("link", { name: "Notas", exact: true })
    .click();
  await page.waitForURL(root + "/notes");
  await drawer.waitFor({ state: "detached" });
  assert.equal(
    await page.locator(".header-title strong").textContent(),
    "Notas",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  drawer = await openDrawer();
  assert.equal(
    await drawer.evaluate((e) => getComputedStyle(e).animationName),
    "none",
  );
  await page.keyboard.press("Escape");
  await drawer.waitFor({ state: "detached" });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  pass(
    "Phone (375 px): no navigation on screen until asked for and content at full width; the drawer opens over the page without moving or scrolling it, traps focus, hides the page from assistive technology, has 44 px targets and no WCAG A/AA violations; Escape, a tap outside and choosing a destination close it; focus returns to the menu button; reduced motion removes the animation",
  );

  // ----- Phone: switching workspace -----
  const titlesOf = async (workspaceId) =>
    ok(
      await api
        .from("activities")
        .select("title")
        .eq("workspace_id", workspaceId)
        .eq("archived", false),
    )
      .map((row) => row.title)
      .sort();
  const shownTitles = async () =>
    (
      await page
        .locator(".activity-row .activity-title strong")
        .allTextContents()
    )
      .map((title) => title.trim())
      .sort();
  await page.goto(`${root}/workspaces/${work}/activities`);
  await page.locator(".activity-row").first().waitFor();
  assert.deepEqual(await shownTitles(), await titlesOf(work));
  const activityRequests = [];
  const recordRequest = (request) => {
    const url = decodeURIComponent(request.url());
    if (url.includes("/rest/v1/activities?")) activityRequests.push(url);
  };
  page.on("request", recordRequest);
  drawer = await openDrawer();
  const chooser = drawer.getByRole("button", { name: /Trocar workspace/ });
  assert.equal(await chooser.getAttribute("aria-expanded"), "false");
  assert.match(await chooser.textContent(), /Lançamento do app/);
  await chooser.click();
  assert.equal(await chooser.getAttribute("aria-expanded"), "true");
  const offered = await drawer
    .locator(".workspace-option span")
    .allTextContents();
  assert.deepEqual(offered, [
    "Todos os workspaces",
    "Lançamento do app",
    "Faculdade",
    "Estudos de design",
    "Vida pessoal",
    "Criar workspace",
  ]);
  assert.equal(
    await drawer
      .locator('.workspace-option[aria-current="true"]')
      .textContent(),
    "Lançamento do app",
  );
  await page.screenshot({ path: `${shots}/drawer-workspaces-375.png` });
  await drawer.getByRole("link", { name: "Faculdade", exact: true }).click();
  await page.waitForURL(`${root}/workspaces/${university.id}/activities`);
  await drawer.waitFor({ state: "detached" });
  await page
    .locator(".header-title strong")
    .filter({ hasText: "Faculdade" })
    .waitFor();
  await page.locator(".activity-row").first().waitFor();
  await settle();
  const universityTitles = await titlesOf(university.id);
  assert.ok(universityTitles.length > 0);
  assert.deepEqual(await shownTitles(), universityTitles);
  assert.equal(
    (await page.locator(".section-heading .count").textContent()).trim(),
    String(universityTitles.length),
  );
  assert.equal(
    (await page.locator('.desktop-app > [role="status"]').textContent()).trim(),
    "Workspace ativo: Faculdade",
  );
  // The scope is applied by the query, not by hiding rows afterwards.
  const scoped = activityRequests.filter((url) => !/[?&]id=eq./.test(url));
  assert.ok(scoped.length > 0);
  for (const url of scoped)
    assert.ok(
      url.includes(`workspace_id=eq.${university.id}`) ||
        url.includes(`workspace_id=eq.${work}`),
      `Unscoped activities request inside a workspace: ${url}`,
    );
  page.off("request", recordRequest);
  drawer = await openDrawer();
  assert.match(
    await drawer
      .getByRole("button", { name: /Trocar workspace/ })
      .textContent(),
    /Faculdade/,
  );
  await drawer.getByRole("button", { name: /Trocar workspace/ }).click();
  await drawer
    .getByRole("link", { name: "Todos os workspaces", exact: true })
    .click();
  await page.waitForURL(root + "/activities");
  await drawer.waitFor({ state: "detached" });
  await page.locator(".activity-row").first().waitFor();
  await settle();
  assert.ok((await shownTitles()).length > universityTitles.length);
  pass(
    "Workspace switching on the phone: the drawer lists exactly the account's workspaces, marks the active one, keeps the current module on the target, updates the header, the list, the counter and a live announcement, and the list equals what the API returns for that workspace; activity requests carry the workspace filter",
  );

  // ----- Phone: create and edit a task -----
  await page.goto(`${root}/workspaces/${work}/activities`);
  await page.locator(".activity-row").first().waitFor();
  assert.equal(
    await page.locator(".table-head").isVisible(),
    false,
    "Phones show cards, not table columns",
  );
  await page
    .locator(".global-header")
    .getByRole("button", { name: "Nova atividade", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await settle();
  const sheet = await dialog.boundingBox();
  assert.equal(sheet.x, 0);
  assert.equal(Math.round(sheet.width), 375);
  assert.equal(Math.round(sheet.y + sheet.height), 812);
  const save = dialog.getByRole("button", { name: "Salvar", exact: true });
  const saveBox = await save.boundingBox();
  assert.ok(saveBox.y + saveBox.height <= 812 && saveBox.height >= 44);
  assert.deepEqual(await audit("sheet@375"), []);
  await page.screenshot({ path: `${shots}/sheet-375.png` });
  // A required field left empty is reported on the field itself.
  await save.click();
  assert.equal(
    await dialog
      .getByLabel("Título", { exact: true })
      .evaluate((e) => e.validationMessage),
    "Campo obrigatório.",
  );
  await dialog
    .getByLabel("Título", { exact: true })
    .fill("Tarefa criada no celular");
  await dialog
    .getByRole("combobox", { name: "Urgência", exact: true })
    .selectOption("true");
  await dialog
    .getByRole("combobox", { name: "Importância", exact: true })
    .selectOption("true");
  await save.click();
  await page
    .getByRole("heading", { name: "Tarefa criada no celular", exact: true })
    .waitFor();
  await page.locator(".toast").waitFor();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await dialog.waitFor();
  await dialog
    .getByLabel("Título", { exact: true })
    .fill("Tarefa editada no celular");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Tarefa editada no celular", exact: true })
    .waitFor();
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
      .select("status, category_attributes, workspace_id")
      .eq("title", "Tarefa editada no celular")
      .single(),
  );
  assert.equal(created.status, "in_progress");
  assert.equal(created.workspace_id, work);
  assert.equal(created.category_attributes.work.isUrgent, true);
  await page.goto(root);
  await page
    .locator(".focus-panel")
    .first()
    .getByText("Tarefa editada no celular", { exact: true })
    .waitFor();
  pass(
    "Phone task flow: the header action opens the form as a bottom sheet with Save in reach, an empty required field is reported on the field, the task is created with its priority, edited, checked in and listed under Priorities",
  );

  // ----- Phone: Dark mode, reload, persistence -----
  await page.goto(`${root}/workspaces/${work}/activities?status=in_progress`);
  await page.locator(".activity-row").first().waitFor();
  const filtered = await shownTitles();
  assert.equal(await themeOf(), null);
  assert.equal(await background(), white);
  drawer = await openDrawer();
  await drawer.getByRole("radio", { name: "Escuro", exact: true }).check();
  assert.equal(await themeOf(), "dark");
  assert.equal(await background(), dark);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("tasknado.theme")),
    "dark",
  );
  assert.deepEqual(
    await page
      .locator('meta[name="theme-color"]')
      .evaluateAll((metas) => metas.map((meta) => meta.content)),
    ["#0b1220", "#0b1220"],
  );
  assert.deepEqual(await audit("drawer-dark@375"), []);
  await page.screenshot({ path: `${shots}/drawer-dark-375.png` });
  await page.keyboard.press("Escape");
  await drawer.waitFor({ state: "detached" });
  // Changing the theme changes nothing else.
  assert.equal(
    page.url(),
    `${root}/workspaces/${work}/activities?status=in_progress`,
  );
  assert.deepEqual(await shownTitles(), filtered);
  await page.reload();
  await page.locator(".activity-row").first().waitFor();
  assert.deepEqual(
    await page.evaluate(() => window.__themeEarly),
    { theme: "dark", beforeBody: true },
    "The stored theme must be on <html> before <body> is parsed",
  );
  assert.equal(await themeOf(), "dark");
  assert.equal(await background(), dark);
  assert.deepEqual(await shownTitles(), filtered);
  const geometryDark = await overflow();
  assert.ok(geometryDark.scroll <= geometryDark.viewport);
  drawer = await openDrawer();
  await drawer
    .getByRole("navigation", { name: "Navegação do Workspace" })
    .getByRole("link", { name: "Notas", exact: true })
    .click();
  await page.waitForURL(`${root}/workspaces/${work}/notes`);
  assert.equal(await themeOf(), "dark");
  // Closing and reopening the browser: a new context from the saved storage.
  const reopened = await browser.newContext({
    viewport: { width: 375, height: 812 },
    storageState: await context.storageState(),
    locale: "pt-BR",
  });
  const second = await reopened.newPage();
  await second.goto(`${root}/workspaces/${work}`);
  await second.locator(".stats-grid").waitFor();
  assert.equal(
    await second.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    ),
    "dark",
  );
  assert.equal(
    await second.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    ),
    dark,
  );
  await reopened.close();
  // System: nothing stored on <html>; the device decides, live.
  drawer = await openDrawer();
  await drawer.getByRole("radio", { name: "Sistema", exact: true }).check();
  await page.keyboard.press("Escape");
  await drawer.waitFor({ state: "detached" });
  assert.equal(await themeOf(), null);
  await page.emulateMedia({ colorScheme: "dark" });
  assert.equal(await background(), dark);
  await page.emulateMedia({ colorScheme: "light" });
  assert.equal(await background(), white);
  pass(
    "Themes on the phone: Dark applies at once without changing the address, the filter or the list; after a reload the choice is on <html> before <body> is parsed; it follows through navigation and into a new browser context; System stores no override and follows the device live",
  );

  // ----- Tablet (768 px) -----
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto(`${root}/workspaces/${work}`);
  await page.locator(".stats-grid").waitFor();
  await settle();
  const rail = await page.locator(".primary-rail").boundingBox();
  assert.ok(rail.x === 0 && rail.width < 100 && rail.height > 900);
  assert.equal(await page.locator(".nav-drawer").count(), 0);
  assert.equal(
    await page.getByRole("button", { name: "Abrir menu" }).count(),
    0,
  );
  assert.equal(await page.locator(".context-panel").count(), 0);
  const columns = new Set(
    await page
      .locator(".stats-grid .stat")
      .evaluateAll((cards) =>
        cards.map((card) => Math.round(card.getBoundingClientRect().x)),
      ),
  );
  assert.equal(columns.size, 3, "Indicators sit side by side on a tablet");
  const open = page.getByRole("button", { name: "Expandir painel" });
  await open.click();
  await page.locator(".context-panel").waitFor();
  await settle();
  const panel = await page.locator(".context-panel").boundingBox();
  assert.ok(panel.x >= rail.width - 1 && panel.x + panel.width <= 768);
  assert.equal(await page.locator(".context-scrim").count(), 1);
  await page.screenshot({ path: `${shots}/drawer-768.png` });
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".context-panel").count(), 0);
  assert.equal(await open.evaluate((e) => document.activeElement === e), true);
  await open.click();
  await page
    .locator(".context-panel")
    .getByRole("link", { name: "Tarefas", exact: true })
    .click();
  await page.waitForURL(`${root}/workspaces/${work}/activities`);
  await page.locator(".activity-row").first().waitFor();
  assert.equal(await page.locator(".context-panel").count(), 0);
  // Forms: a centred dialog here, with usable fields.
  await page
    .locator(".main-content")
    .getByRole("button", { name: "Nova atividade", exact: true })
    .click();
  await dialog.waitFor();
  await settle();
  const centred = await dialog.boundingBox();
  assert.ok(centred.x > 100 && centred.x + centred.width < 768 - 100);
  assert.ok(centred.y > 0 && centred.y + centred.height < 1024);
  await dialog.getByLabel("Título", { exact: true }).fill("Rascunho no tablet");
  await dialog
    .getByRole("combobox", { name: "Possui uma data programada?" })
    .selectOption({ index: 1 });
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
  // Workspace and theme from the header.
  const switcher = page.locator(".workspace-switch");
  await switcher.click();
  await page
    .locator(".workspace-popover")
    .getByRole("link", { name: "Faculdade", exact: true })
    .click();
  await page.waitForURL(`${root}/workspaces/${university.id}/activities`);
  await page.locator(".activity-row").first().waitFor();
  await settle();
  assert.deepEqual(await shownTitles(), universityTitles);
  assert.match(await switcher.textContent(), /Faculdade/);
  await page.getByRole("button", { name: "Menu do usuário" }).click();
  await page.getByRole("menuitemradio", { name: "Escuro" }).click();
  assert.equal(await themeOf(), "dark");
  assert.equal(await background(), dark);
  assert.equal(
    await page
      .getByRole("menuitemradio", { name: "Escuro" })
      .getAttribute("aria-checked"),
    "true",
  );
  assert.deepEqual(await audit("account-menu-dark@768"), []);
  await page.screenshot({ path: `${shots}/account-menu-dark-768.png` });
  await page.getByRole("menuitemradio", { name: "Sistema" }).click();
  assert.equal(await themeOf(), null);
  await page.keyboard.press("Escape");
  assert.deepEqual(await shownTitles(), universityTitles);
  pass(
    "Tablet (768 px): icon rail instead of the drawer, indicators in three columns, the workspace panel opens over the content and closes with Escape or navigation, forms open as a centred dialog, the header switches workspace and the account menu switches theme",
  );

  // ----- Desktop (1440 px) -----
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${root}/workspaces/${work}/activities`);
  await page.locator(".activity-row").first().waitFor();
  await settle();
  const side = await page.locator(".context-panel").boundingBox();
  const main = await page.locator(".main-content").boundingBox();
  assert.ok(main.x >= side.x + side.width, "The panel sits beside the content");
  await page.getByRole("button", { name: "Recolher painel" }).click();
  assert.equal(await page.locator(".context-panel").count(), 0);
  await page.getByRole("button", { name: "Expandir painel" }).click();
  await page.locator(".context-panel").waitFor();
  assert.equal(await page.locator(".table-head").isVisible(), true);
  assert.equal(
    await page
      .locator(".activity-row")
      .first()
      .evaluate((row) => getComputedStyle(row).display),
    "grid",
  );
  assert.equal(
    await page
      .locator(".table-head span")
      .evaluateAll(
        (cells) =>
          cells.filter(
            (cell) =>
              cell.offsetParent !== null &&
              cell.parentElement.classList.contains("table-head"),
          ).length,
      ),
    6,
  );
  // Workspace switcher by keyboard alone.
  await switcher.focus();
  await page.keyboard.press("Enter");
  await page.locator(".workspace-popover").waitFor();
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent),
    "Lançamento do app",
  );
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".workspace-popover").count(), 0);
  assert.equal(
    await switcher.evaluate((e) => document.activeElement === e),
    true,
  );
  await page.keyboard.press("ArrowDown");
  await page.locator(".workspace-popover").waitFor();
  await page.keyboard.press("ArrowDown");
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent),
    "Faculdade",
  );
  await page.keyboard.press("Enter");
  await page.waitForURL(`${root}/workspaces/${university.id}/activities`);
  await page.locator(".activity-row").first().waitFor();
  await settle();
  assert.deepEqual(await shownTitles(), universityTitles);
  assert.equal(
    await page.locator(".context-workspace.selected").textContent(),
    "Faculdade",
  );
  // The matrix does not exist outside the Work category: fall back.
  await page.goto(`${root}/workspaces/${work}/matrix`);
  await page.locator(".matrix-card").first().waitFor();
  await switcher.click();
  await page
    .locator(".workspace-popover")
    .getByRole("link", { name: "Faculdade", exact: true })
    .click();
  await page.waitForURL(`${root}/workspaces/${university.id}`);
  // Account menu by keyboard: theme options are part of the arrow order.
  const account = page.getByRole("button", { name: "Menu do usuário" });
  await account.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menu").waitFor();
  const order = [];
  for (let i = 0; i < 6; i++) {
    order.push(
      await page.evaluate(() => document.activeElement.textContent.trim()),
    );
    await page.keyboard.press("ArrowDown");
  }
  assert.deepEqual(order, [
    "Editar perfil",
    "Configurações",
    "Claro",
    "Escuro",
    "Sistema",
    "Sair",
  ]);
  await page.keyboard.press("Escape");
  // The three appearance modes, from Settings.
  await page.goto(`${root}/settings`);
  const appearance = page
    .locator(".settings-panel")
    .getByRole("radiogroup", { name: "Aparência" });
  await appearance.waitFor();
  await appearance.getByRole("radio", { name: "Escuro" }).check();
  assert.equal(await themeOf(), "dark");
  assert.equal(await background(), dark);
  // The whole page changes in one repaint, with no colour fading behind.
  assert.equal(
    await page.evaluate(
      () =>
        document.getAnimations().filter((a) => a instanceof CSSTransition)
          .length,
    ),
    0,
    "No transition may run while the theme changes",
  );
  await settle();
  await page.screenshot({ path: `${shots}/settings-dark-1440.png` });
  await appearance.getByRole("radio", { name: "Claro" }).check();
  assert.equal(await themeOf(), "light");
  await page.emulateMedia({ colorScheme: "dark" });
  assert.equal(await background(), white, "Light wins over a dark system");
  await page.reload();
  await appearance.waitFor();
  assert.deepEqual(await page.evaluate(() => window.__themeEarly), {
    theme: "light",
    beforeBody: true,
  });
  assert.equal(await background(), white);
  // Radios answer to the arrow keys, as a radio group should.
  await appearance.getByRole("radio", { name: "Claro" }).focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await themeOf(), "dark");
  await page.keyboard.press("ArrowRight");
  assert.equal(await themeOf(), null);
  assert.equal(await background(), dark, "System follows the dark device");
  await page.emulateMedia({ colorScheme: "light" });
  assert.equal(await background(), white);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("tasknado.theme")),
    "system",
  );
  // Keyboard reaches the application in a sensible order.
  await page.goto(`${root}/workspaces/${work}/activities`);
  await page.locator(".activity-row").first().waitFor();
  const tabOrder = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    tabOrder.push(
      await page.evaluate(() => {
        const el = document.activeElement;
        return (
          el.getAttribute("aria-label") || el.textContent.trim() || el.className
        );
      }),
    );
  }
  assert.equal(tabOrder[0], "Ir para o conteúdo");
  assert.ok(tabOrder.some((label) => label.startsWith("Trocar workspace")));
  assert.ok(tabOrder.includes("Busca global"));
  pass(
    "Desktop (1440 px): the workspace panel sits beside the content and collapses; tasks are a six-column table; the workspace switcher and the account menu work by keyboard alone; Light, Dark and System apply from Settings, Light overrides a dark device and survives a reload, System follows it",
  );

  // ----- Isolation -----
  assert.ok(
    !offered.some((name) => name.includes(strangerMark)),
    "Another account's workspace must not be offered",
  );
  await page.goto(`${root}/workspaces`);
  await page.locator(".workspace-directory-row").first().waitFor();
  assert.equal(await page.getByText(strangerMark).count(), 0);
  const bodies = [];
  const capture = async (response) => {
    if (response.url().includes("/rest/v1/"))
      bodies.push(await response.text().catch(() => ""));
  };
  page.on("response", capture);
  await page.goto(
    `${root}/workspaces/${strangerWorkspace.id}/activities/${strangerActivity.id}`,
  );
  await page.getByText("Workspace indisponível.", { exact: true }).waitFor();
  await settle();
  page.off("response", capture);
  assert.ok(bodies.length > 0);
  assert.ok(
    !bodies.some((body) => body.includes(strangerMark)),
    "No response may carry another account's data",
  );
  assert.equal(await page.getByText(strangerMark).count(), 0);
  assert.equal(await page.locator(".activity-row").count(), 0);
  // The same answers straight from the API, with the first account's session.
  assert.deepEqual(
    ok(
      await api.from("workspaces").select("id").eq("id", strangerWorkspace.id),
    ),
    [],
  );
  assert.deepEqual(
    ok(
      await api
        .from("activities")
        .update({ title: "invadida" })
        .eq("id", strangerActivity.id)
        .select(),
    ),
    [],
  );
  assert.ok(
    (
      await api.from("activities").insert({
        title: "intrusa",
        workspace_id: strangerWorkspace.id,
      })
    ).error,
    "Inserting into another account's workspace must be refused",
  );
  assert.equal(
    ok(
      await strangerApi
        .from("activities")
        .select("title")
        .eq("workspace_id", strangerWorkspace.id),
    )
      .map((row) => row.title)
      .join(),
    `Tarefa ${strangerMark}`,
  );
  // Inside one account, a workspace never shows another workspace's tasks.
  const workTitles = await titlesOf(work);
  assert.ok(!universityTitles.some((title) => workTitles.includes(title)));
  pass(
    "Isolation: another account's workspace is not listed or offered, its address answers 'unavailable' and no response carries its data; reads, updates and inserts against it are refused by the database; each workspace lists only its own tasks",
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
  ok(await admin.auth.admin.deleteUser(stranger.id));
}
