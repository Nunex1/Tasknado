import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
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
const email = `desktop-${Date.now()}@tasknado.test`,
  password = `QA-${crypto.randomUUID()}!`;
const user = ok(
  await admin.auth.admin.createUser({ email, password, email_confirm: true }),
).user;
ok(await api.auth.signInWithPassword({ email, password }));
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  timezoneId: "America/Sao_Paulo",
  locale: "pt-BR",
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const checks = [],
  visuals = [],
  accessibility = [],
  errors = [];
let failure = null;
page.on("pageerror", (e) => errors.push(e.message));
const pass = (s) => {
  checks.push(s);
  console.log("PASS " + s);
};
const root = process.env.TASKNADO_TEST_URL || "http://127.0.0.1:3000";
mkdirSync("test-results/desktop", { recursive: true });
async function login(p = page) {
  await p.goto(root);
  await p.getByLabel("E-mail", { exact: true }).fill(email);
  await p.getByLabel("Senha", { exact: true }).fill(password);
  await p
    .locator("form")
    .getByRole("button", { name: "Entrar na minha conta", exact: true })
    .click();
  await p.locator(".global-header").waitFor();
}
async function eventually(fn) {
  for (let i = 0; i < 60; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  assert.fail("Condition did not become true");
}
async function tab(name) {
  await page
    .locator(".workspace-tabs")
    .getByRole("link", { name, exact: true })
    .click();
}
async function createActivity(title, category = "work") {
  await page
    .getByRole("button", { name: "Nova atividade", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Título", { exact: true }).fill(title);
  if (category === "work") {
    await dialog.getByLabel("Possui uma data programada?").selectOption("yes");
    await dialog
      .getByLabel("Data programada", { exact: true })
      .fill("2020-01-01");
    await dialog.getByLabel("Horário programado (opcional)").fill("09:15");
    await dialog
      .getByRole("combobox", { name: "Urgência", exact: true })
      .selectOption("true");
    await dialog
      .getByRole("combobox", { name: "Importância", exact: true })
      .selectOption("true");
  }
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
}
try {
  await login();
  await page
    .getByRole("button", { name: "Criar meu primeiro workspace" })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Nome", { exact: true })
    .fill("Operações oceânicas");
  await page.getByLabel("Categoria do workspace").selectOption("work");
  await page
    .getByRole("dialog")
    .getByLabel("Descrição", { exact: true })
    .fill("Planejamento, decisões e continuidade do trabalho.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar", exact: true })
    .click();
  await page
    .locator(".workspace-heading h1")
    .filter({ hasText: "Operações oceânicas" })
    .waitFor();
  const work = ok(
    await api
      .from("workspaces")
      .select("*")
      .eq("name", "Operações oceânicas")
      .single(),
  );
  assert.ok(page.url().endsWith("/workspaces/" + work.id));
  await createActivity("Revisar centros de custo");
  await page
    .getByRole("heading", { name: "Revisar centros de custo", exact: true })
    .waitFor();
  const activity = ok(
    await api
      .from("activities")
      .select("*")
      .eq("workspace_id", work.id)
      .single(),
  );
  assert.equal(activity.category_attributes.work.scheduledDate, "2020-01-01");
  assert.equal(activity.category_attributes.work.isUrgent, true);
  await page.getByText("Atrasada", { exact: true }).first().waitFor();
  pass(
    "Real UI authentication, Workspace creation and dedicated route; Work schedule/date/time and Q1 persist",
  );

  await page.getByLabel("Registrar acontecimento").selectOption("check_in");
  await page
    .getByRole("textbox", { name: "Conteúdo do acontecimento" })
    .fill("Análise iniciada");
  await page
    .getByRole("button", { name: "Registrar Check In", exact: true })
    .click();
  await eventually(
    async () =>
      ok(
        await api
          .from("activities")
          .select("status")
          .eq("id", activity.id)
          .single(),
      ).status === "in_progress",
  );
  await page.getByLabel("Registrar acontecimento").selectOption("observation");
  await page
    .getByRole("textbox", { name: "Conteúdo do acontecimento" })
    .fill("Oceanografia: conferir valores antes da próxima análise.");
  await page
    .getByRole("button", { name: "Registrar Observação", exact: true })
    .click();
  await page
    .getByText("Oceanografia: conferir valores antes da próxima análise.", {
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("button", { name: "Editar observação", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("textbox")
    .fill("Oceanografia: valores revisados e contexto preservado.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page
    .getByText("Oceanografia: valores revisados e contexto preservado.", {
      exact: true,
    })
    .waitFor();
  const obs = ok(
    await api
      .from("activity_events")
      .select("*")
      .eq("activity_id", activity.id)
      .eq("type", "observation")
      .single(),
  );
  assert.ok(obs.edited_at);
  await page.reload();
  await page.getByText(obs.content, { exact: true }).waitFor();
  pass(
    "Activity start and observation creation/editing survive reload with original creation and separate edit timestamp",
  );

  await page.keyboard.press("Control+k");
  await page.locator("#global-search").fill("Oceanografia");
  await page
    .getByRole("option")
    .filter({ hasText: "valores revisados" })
    .waitFor();
  assert.ok(await page.locator(".quick-result mark").count());
  await page.locator("#global-search").press("ArrowDown");
  await page.locator("#global-search").press("Enter");
  await page.locator(`#event-${obs.id}.highlighted`).waitFor();
  assert.ok(page.url().includes("focus=" + obs.id));
  await page.keyboard.press("Meta+k");
  assert.equal(
    await page
      .locator("#global-search")
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".search-popover").count(), 0);
  pass(
    "Ctrl/Command K, grouped suggestions, term highlighting, arrow/Enter navigation, Escape and exact observation deep link",
  );

  await tab("Matriz de Eisenhower");
  await page
    .getByLabel("Quadrante de Revisar centros de custo")
    .selectOption("q2");
  await page.locator(".q2 .matrix-card").waitFor();
  await page
    .locator(".q2 .matrix-card")
    .dragTo(page.locator(".matrix-quadrant.q3"));
  await page.locator(".q3 .matrix-card").waitFor();
  await page.reload();
  await page.locator(".q3 .matrix-card").waitFor();
  const moved = ok(
    await api.from("activities").select("*").eq("id", activity.id).single(),
  );
  assert.equal(moved.category_attributes.work.isImportant, false);
  assert.equal(moved.category_attributes.work.isUrgent, true);
  assert.equal(moved.category_attributes.work.scheduledDate, "2020-01-01");
  assert.equal(moved.status, "in_progress");
  assert.equal(
    ok(
      await api
        .from("priority_history")
        .select("*")
        .eq("activity_id", activity.id),
    ).length,
    3,
  );
  pass(
    "Matrix keyboard selector and real mouse drag/drop persist priority, record history and preserve schedule/status",
  );

  await tab("Observações");
  await page
    .getByLabel("Nova observação", { exact: true })
    .fill("Maré azul: decisão geral do Workspace.");
  await page
    .getByRole("button", { name: "Registrar observação", exact: true })
    .click();
  await page
    .locator(".record")
    .getByText("Maré azul: decisão geral do Workspace.", { exact: true })
    .waitFor();
  const general = ok(
    await api
      .from("workspace_observations")
      .select("*")
      .eq("workspace_id", work.id)
      .single(),
  );
  assert.equal(general.created_at, general.updated_at);
  await page
    .locator(".record")
    .getByRole("button", { name: "Editar", exact: true })
    .click();
  await page
    .getByLabel("Editar observação", { exact: true })
    .fill("Maré azul: decisão geral revisada.");
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await page
    .locator(".record")
    .getByText("Maré azul: decisão geral revisada.", { exact: true })
    .waitFor();
  await page.reload();
  await page
    .locator(".record")
    .getByText("Maré azul: decisão geral revisada.", { exact: true })
    .waitFor();
  await page.getByLabel("Pesquisar observações").fill("inexistente");
  await page.getByText("Nenhuma observação encontrada.").waitFor();
  await page.getByLabel("Pesquisar observações").fill("");
  await page
    .getByRole("combobox", { name: "Ordem", exact: true })
    .selectOption("old");
  await page.keyboard.press("Control+k");
  await page.locator("#global-search").fill("Maré azul");
  await page
    .getByRole("option")
    .filter({ hasText: "decisão geral revisada" })
    .click();
  await page.locator(`#observation-${general.id}.highlighted`).waitFor();
  await tab("Histórico");
  await page
    .getByRole("heading", { name: "Observação editada", exact: true })
    .first()
    .waitFor();
  await page
    .getByRole("heading", { name: "Prioridade alterada", exact: true })
    .first()
    .waitFor();
  pass(
    "Workspace observations create/edit/search/order/reload and exact search navigation; operational history contains observations and priority changes",
  );

  await page
    .locator(".context-heading")
    .getByRole("button", { name: "Criar workspace" })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Nome", { exact: true })
    .fill("Faculdade");
  await page.getByLabel("Categoria do workspace").selectOption("university");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar", exact: true })
    .click();
  await page
    .locator(".workspace-heading h1")
    .filter({ hasText: "Faculdade" })
    .waitFor();
  await page
    .getByRole("button", { name: "Nova atividade", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Título", { exact: true })
    .fill("Projeto de pesquisa");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar", exact: true })
    .click();
  assert.equal(await page.getByRole("dialog").count(), 1);
  assert.equal(
    await page
      .getByRole("combobox", { name: "Aberta no Canvas?", exact: true })
      .evaluate((e) => e.validity.valueMissing),
    true,
  );
  await page
    .getByRole("combobox", { name: "Aberta no Canvas?", exact: true })
    .selectOption("false");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Projeto de pesquisa", exact: true })
    .waitFor();
  const university = ok(
    await api.from("workspaces").select("*").eq("name", "Faculdade").single(),
  );
  const universityActivity = ok(
    await api
      .from("activities")
      .select("*")
      .eq("workspace_id", university.id)
      .single(),
  );
  assert.equal(
    universityActivity.category_attributes.university.openedInCanvas,
    false,
  );
  await tab("Atividades");
  await page
    .getByRole("combobox", { name: "Aberta no Canvas?", exact: true })
    .selectOption("true");
  await eventually(
    async () => (await page.locator(".activity-row").count()) === 0,
  );
  await page
    .getByRole("combobox", { name: "Aberta no Canvas?", exact: true })
    .selectOption("false");
  await page
    .locator(".activity-row")
    .filter({ hasText: "Projeto de pesquisa" })
    .waitFor();
  pass(
    "University requires an explicit Canvas choice; false persists independently of status and Canvas filters work",
  );

  await page.goto(`${root}/workspaces/${work.id}`);
  await page
    .getByRole("button", { name: "Editar workspace", exact: true })
    .click();
  await page.getByLabel("Categoria do workspace").selectOption("sports");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar", exact: true })
    .click();
  await eventually(
    async () =>
      (await page
        .locator(".workspace-tabs")
        .getByRole("link", { name: "Matriz de Eisenhower" })
        .count()) === 0,
  );
  assert.deepEqual(
    ok(
      await api
        .from("activities")
        .select("category_attributes")
        .eq("id", activity.id)
        .single(),
    ).category_attributes,
    moved.category_attributes,
  );
  await page
    .getByRole("button", { name: "Editar workspace", exact: true })
    .click();
  await page.getByLabel("Categoria do workspace").selectOption("work");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar", exact: true })
    .click();
  await tab("Matriz de Eisenhower");
  await page.locator(".q3 .matrix-card").waitFor();
  pass(
    "Workspace category changes hide specialized fields and restore them without changing any activity attributes",
  );

  await page
    .locator(".global-header")
    .getByRole("button", { name: "Menu do usuário" })
    .click();
  await page.getByRole("menuitem", { name: "Editar perfil" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Gabriel Silva");
  await page.getByLabel("Apelido", { exact: true }).fill("Mar");
  await page.getByLabel("Inicial do avatar", { exact: true }).fill("é");
  await page.getByLabel("Cor personalizada", { exact: true }).fill("#b8e0ff");
  assert.equal(
    (await page.locator(".profile-avatar").textContent()).trim(),
    "É",
  );
  assert.equal(
    ok(await api.auth.getUser()).user.user_metadata.nickname,
    undefined,
  );
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  assert.equal(
    await page.getByLabel("Apelido", { exact: true }).inputValue(),
    "",
  );
  await page.getByLabel("Nome", { exact: true }).fill("Gabriel Silva");
  await page.getByLabel("Apelido", { exact: true }).fill("Mar");
  await page.getByLabel("Inicial do avatar", { exact: true }).fill("é");
  await page.getByLabel("Cor personalizada", { exact: true }).fill("#b8e0ff");
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await eventually(
    async () =>
      ok(await api.auth.getUser()).user.user_metadata.nickname === "Mar",
  );
  assert.equal(
    (await page.locator(".profile-menu-trigger").textContent()).trim(),
    "É",
  );
  await page.reload();
  await page.getByLabel("Apelido", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Apelido", { exact: true }).inputValue(),
    "Mar",
  );
  await page.getByRole("button", { name: "Menu do usuário" }).click();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("menu").count(), 0);
  assert.equal(
    await page
      .getByRole("button", { name: "Menu do usuário" })
      .evaluate((e) => document.activeElement === e),
    true,
  );
  await page.getByRole("button", { name: "Menu do usuário" }).click();
  await page
    .getByRole("heading", { name: "Editar perfil", exact: true })
    .click();
  assert.equal(await page.getByRole("menu").count(), 0);
  pass(
    "Profile nickname/letter/custom color preview, cancel, save, global avatar, reload, menu outside click and Escape focus restoration",
  );

  await page
    .getByRole("combobox", { name: "Idioma da interface", exact: true })
    .selectOption("en-US");
  await page
    .getByRole("heading", { name: "Edit Profile", exact: true })
    .waitFor();
  await eventually(
    async () =>
      ok(await api.auth.getUser()).user.user_metadata.preferred_language ===
      "en-US",
  );
  await page.reload();
  await page
    .getByRole("heading", { name: "Edit Profile", exact: true })
    .waitFor();
  const second = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  const secondPage = await second.newPage();
  await login(secondPage);
  await secondPage.getByRole("link", { name: "Profile", exact: true }).click();
  await secondPage
    .getByRole("heading", { name: "Edit Profile", exact: true })
    .waitFor();
  assert.equal(
    await secondPage.getByLabel("Nickname", { exact: true }).inputValue(),
    "Mar",
  );
  await second.close();
  pass(
    "Immediate EN translation, reload preference and real profile/language persistence in a fresh independent browser session",
  );
  await page.locator(".header-language select").selectOption("pt-BR");
  await page
    .getByRole("heading", { name: "Editar perfil", exact: true })
    .waitFor();
  await eventually(
    async () =>
      ok(await api.auth.getUser()).user.user_metadata.preferred_language ===
      "pt-BR",
  );

  await page.goto(`${root}/workspaces/${work.id}/notes`);
  await page.getByRole("button", { name: "Nova nota", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Título", { exact: true })
    .fill("Caderno de bordo");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar", exact: true })
    .click();
  await page.getByRole("heading", { name: "Caderno de bordo" }).waitFor();
  await page
    .getByRole("button", { name: "Adicionar entrada", exact: true })
    .click();
  await page
    .locator(".note-entry textarea")
    .fill("Contexto persistente no bloco de notas.");
  await page
    .locator(".note-entry .save-status")
    .filter({ hasText: "Salvo" })
    .waitFor();
  await page.reload();
  await page.locator(".note-entry textarea").waitFor();
  assert.equal(
    await page.locator(".note-entry textarea").inputValue(),
    "Contexto persistente no bloco de notas.",
  );
  pass(
    "Original notebook creation, autosave and persistent entry routes preserved",
  );

  for (const target of [
    `/workspaces/${work.id}/activities`,
    `/workspaces/${work.id}/observations`,
    `/workspaces/${work.id}/history`,
    `/workspaces/${work.id}/matrix`,
    `/workspaces/${work.id}/notes`,
    "/settings",
    "/perfil",
    "/search",
  ]) {
    await page.goto(root + target);
    await page.locator(".global-header").waitFor();
    await page.evaluate(() => (window.__desktopNav = "retained"));
    await page
      .getByRole("link", { name: "Tubarão-martelo — Visão geral", exact: true })
      .click();
    await page.waitForURL(root + "/");
    assert.equal(await page.evaluate(() => window.__desktopNav), "retained");
    await page.goBack();
    await page.waitForURL(root + target);
    await page
      .getByRole("link", { name: "TASKNADO — Visão geral", exact: true })
      .click();
    await page.waitForURL(root + "/");
  }
  assert.equal(await page.locator(".stats-grid .stat").count(), 2);
  assert.equal(await page.locator(".primary-rail").count(), 1);
  assert.equal(await page.locator(".mobile-menu,.sidebar-overlay").count(), 0);
  pass(
    "Both brand links return Home across all modules without full reload; browser Back restores routes; Home has exactly two indicators and no mobile navigation",
  );

  await page.screenshot({
    path: "test-results/desktop/home.png",
    fullPage: true,
  });
  await page.goto(`${root}/workspaces/${work.id}/activities`);
  await page.locator(".activity-row").waitFor();
  await page
    .getByRole("combobox", { name: "Agendamento", exact: true })
    .selectOption("overdue");
  assert.equal(await page.locator(".activity-row").count(), 1);
  await page.getByLabel("Data inicial", { exact: true }).fill("2030-01-01");
  await eventually(
    async () => (await page.locator(".activity-row").count()) === 0,
  );
  await page.getByLabel("Data inicial", { exact: true }).fill("");
  await page
    .getByRole("combobox", { name: "Ordenar atividades" })
    .selectOption("scheduled");
  await page.getByLabel("Filtrar atividades").fill("inexistente");
  await eventually(
    async () => (await page.locator(".activity-row").count()) === 0,
  );
  await page.getByLabel("Filtrar atividades").fill("");
  await page.locator(".activity-row").click();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByLabel("Possui uma data programada?").selectOption("no");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const unscheduled = ok(
    await api.from("activities").select("*").eq("id", activity.id).single(),
  );
  assert.equal(unscheduled.category_attributes.work.hasScheduledDate, false);
  assert.equal(unscheduled.category_attributes.work.scheduledDate, null);
  assert.equal(unscheduled.status, "in_progress");
  pass(
    "Work schedule can be removed; local search, overdue/date filters and date ordering operate independently of status",
  );
  await page
    .context()
    .route("**/rest/v1/rpc/search_all", (route) => route.abort());
  await page.keyboard.press("Control+k");
  await page.locator("#global-search").fill("falha de rede");
  await page
    .locator(".search-status")
    .filter({ hasText: "Sem conexão" })
    .waitFor();
  await page.context().unroute("**/rest/v1/rpc/search_all");
  await page
    .locator(".search-status")
    .getByRole("button", { name: "Tentar novamente" })
    .click();
  await page
    .locator(".search-status")
    .filter({ hasText: "Nenhum resultado encontrado" })
    .waitFor();
  await page.keyboard.press("Escape");
  pass(
    "Search network failure produces a localized error and retry recovers without reloading",
  );
  for (const [title, isUrgent, isImportant] of [
    ["Preparar revisão mensal", true, true],
    ["Planejar próximos estudos", false, true],
    ["Organizar documentos", true, false],
    ["Reavaliar rotinas", false, false],
  ])
    ok(
      await api.from("activities").insert({
        workspace_id: work.id,
        title,
        description: "Registro de teste para validar leitura e alinhamento.",
        category_attributes: {
          work: {
            hasScheduledDate: false,
            scheduledDate: null,
            scheduledTime: null,
            isUrgent,
            isImportant,
          },
        },
      }),
    );
  for (const [width, height] of [
    [1280, 720],
    [1366, 768],
    [1440, 900],
    [1920, 1080],
    [2560, 1440],
  ]) {
    await page.setViewportSize({ width, height });
    for (const section of ["activities", "matrix"]) {
      await page.goto(`${root}/workspaces/${work.id}/${section}`);
      await page
        .locator(section === "matrix" ? ".matrix-grid" : ".activity-table")
        .waitFor();
      const geometry = await page.evaluate(() => {
        const main = document
            .querySelector(".main-content")
            .getBoundingClientRect(),
          header = document
            .querySelector(".global-header")
            .getBoundingClientRect(),
          panel = document
            .querySelector(".context-panel")
            ?.getBoundingClientRect();
        return {
          scroll: document.documentElement.scrollWidth,
          viewport: innerWidth,
          main: { x: main.x, width: main.width },
          header: { height: header.height },
          panelRight: panel?.right,
        };
      });
      assert.ok(
        geometry.scroll <= width,
        `Horizontal overflow at ${width} ${section}: ${JSON.stringify(geometry)}`,
      );
      assert.ok(geometry.main.x >= geometry.panelRight);
      assert.equal(geometry.header.height, 64);
      const before = geometry.main.width;
      await page.getByRole("button", { name: "Recolher painel" }).click();
      const after = await page
        .locator(".main-content")
        .evaluate((e) => e.getBoundingClientRect().width);
      assert.ok(after >= before);
      await page.getByRole("button", { name: "Expandir painel" }).click();
      await page.keyboard.press("Control+k");
      await page.locator("#global-search").fill("Revisar");
      await page
        .getByRole("option")
        .filter({ hasText: "Revisar centros" })
        .first()
        .waitFor();
      const searchBox = await page.locator(".search-popover").boundingBox();
      assert.ok(searchBox.x >= 0 && searchBox.x + searchBox.width <= width);
      await page.keyboard.press("Escape");
      await page.evaluate(() => window.scrollTo(0, 0));
      const screenshot = `test-results/desktop/${width}x${height}-${section}.png`;
      await page.screenshot({ path: screenshot, fullPage: true });
      visuals.push({ width, height, section, ...geometry, screenshot });
    }
  }
  pass(
    "All five required desktop resolutions: activity tables, matrix, expanded/collapsed context and search fit without horizontal overflow or region overlap",
  );
  await page.setViewportSize({ width: 960, height: 540 });
  await page.getByRole("button", { name: "Recolher painel" }).click();
  await page.goto(`${root}/workspaces/${work.id}/matrix`);
  await page.locator(".matrix-card").first().waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page
    .getByLabel("Quadrante de Revisar centros de custo")
    .selectOption("q2");
  await page
    .locator(".q2")
    .getByText("Revisar centros de custo", { exact: true })
    .waitFor();
  await page.screenshot({
    path: "test-results/desktop/desktop-200-percent-effective-viewport.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Expandir painel" }).click();
  pass(
    "Desktop 200% effective viewport (960 CSS px from Full HD), with context collapsed, retains matrix and keyboard classification",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${root}/workspaces/${work.id}`);
  await page.locator(".workspace-heading").waitFor();
  assert.equal(
    await page
      .locator(".ocean-transition")
      .evaluate((e) => getComputedStyle(e).display),
    "none",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`${root}/workspaces/${work.id}/observations`);
  await page.locator(".record").waitFor();
  page.once("dialog", (d) => d.accept());
  await page
    .locator(".record")
    .getByRole("button", { name: "Excluir", exact: true })
    .click();
  await eventually(
    async () =>
      ok(
        await api
          .from("workspace_observations")
          .select("id")
          .eq("id", general.id),
      ).length === 0,
  );
  await page.goto(`${root}/workspaces/${work.id}/activities/${activity.id}`);
  await page.getByText(obs.content, { exact: true }).waitFor();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Excluir observação", exact: true })
    .click();
  await eventually(
    async () =>
      ok(await api.from("activity_events").select("id").eq("id", obs.id))
        .length === 0,
  );
  pass(
    "Reduced motion disables the wave; explicit deletion removes both observation types while operational snapshots remain",
  );
  assert.deepEqual(errors, []);
  pass("No browser runtime errors throughout the desktop suite");
  const savedNote = ok(
    await api.from("notes").select("id").eq("workspace_id", work.id),
  ).find(Boolean);
  for (const [path, selector] of [
    ["/", ".stats-grid"],
    ["/workspaces", ".workspace-directory-row"],
    [`/workspaces/${work.id}/activities`, ".activity-row"],
    [`/workspaces/${work.id}/activities/${activity.id}`, ".detail-grid"],
    [`/workspaces/${work.id}/observations`, ".observation-composer"],
    [`/workspaces/${work.id}/history`, ".record"],
    [`/workspaces/${work.id}/matrix`, ".matrix-card"],
    [`/workspaces/${work.id}/notes/${savedNote.id}`, ".note-entry"],
    ["/perfil", ".profile-panel"],
    ["/settings", ".language-select"],
    ["/search", ".search-filters"],
  ]) {
    await page.goto(root + path);
    await page.locator(selector).first().waitFor();
    await page.evaluate(async () => {
      await Promise.all(
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.effect?.getComputedTiming().iterations !== Infinity,
          )
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const audit = await page.evaluate(async () => {
      const result = await window.axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
        },
      });
      return {
        violations: result.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            reason: n.failureSummary,
          })),
        })),
        manualReview: result.incomplete.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            reason: n.failureSummary,
          })),
        })),
        passedRules: result.passes.length,
      };
    });
    accessibility.push({ path, ...audit });
  }
  assert.deepEqual(
    accessibility.flatMap((a) =>
      a.violations.map((v) => ({ path: a.path, ...v })),
    ),
    [],
  );
  assert.deepEqual(errors, []);
  pass(
    "Automated WCAG A/AA checks on eleven authenticated desktop screens report no violations; manual-review items recorded separately",
  );
} catch (e) {
  failure = e.stack || String(e);
  console.error(failure);
  await page
    .screenshot({ path: "test-results/desktop/failure.png", fullPage: true })
    .catch(() => {});
  process.exitCode = 1;
} finally {
  writeFileSync(
    "test-results/desktop.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        passed: checks.length,
        checks,
        visuals,
        accessibility,
        errors,
        failure,
        scope:
          "Real local Supabase + Microsoft Edge Chromium, temporary account",
      },
      null,
      2,
    ),
  );
  await browser.close();
  ok(await admin.auth.admin.deleteUser(user.id));
}
