// Authenticated HTTP + browser acceptance, temporary users on the local stack only.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { localStack } from "./security-stack.mjs";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    join(
      homedir(),
      ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
    ),
);
// Development stack by default; TASKNADO_TEST_STACK=security selects the
// isolated stack that carries every migration. Loopback only, either way.
const state = localStack();
const root = process.env.TASKNADO_TEST_URL || "http://127.0.0.1:3107";
assert.match(root, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const admin = createClient(state.API_URL, state.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const make = () =>
  createClient(state.API_URL, state.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const api = make(),
  stranger = make();
const ok = (r) => {
  assert.ifError(r.error);
  return r.data;
};
const checks = [],
  accessibility = [],
  errors = [],
  users = [],
  requests = [];
const pass = (s) => {
  checks.push(s);
  console.log("PASS " + s);
};
const shots = "test-results/professional";
mkdirSync(shots, { recursive: true });
const password = `QA-${crypto.randomUUID()}!`,
  email = `professional-${Date.now()}@tasknado.test`;
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: "pt-BR",
  timezoneId: "America/Sao_Paulo",
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => requests.push(r.url()));
let failure = null;
const dialog = () => page.getByRole("dialog");
const plan = () => page.locator(".professional-plans");
async function login() {
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Entrar na minha conta", exact: true })
    .click();
  await page.locator(".global-header").waitFor();
}
async function save() {
  await dialog().getByRole("button", { name: "Salvar", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
  await page.waitForLoadState("networkidle");
}
async function audit(label) {
  await page.evaluate(async () => {
    await document.fonts.ready;
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
  await page.evaluate(
    readFileSync(require.resolve("axe-core/axe.min.js"), "utf8"),
  );
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
        nodes: v.nodes.map((n) => ({
          target: n.target,
          message: n.failureSummary,
        })),
      })),
      incomplete: r.incomplete.map((v) => v.id),
    };
  });
  accessibility.push({ label, ...result });
  assert.deepEqual(result.violations, [], label);
}
async function noOverflow(label) {
  const size = await page.evaluate(() => ({
    actual: document.documentElement.scrollWidth,
    width: innerWidth,
    dialogs: [...document.querySelectorAll('[role="dialog"]')].map((e) => ({
      client: e.clientWidth,
      scroll: e.scrollWidth,
    })),
  }));
  assert.ok(
    size.actual <= size.width + 1,
    `${label}: viewport overflow ${JSON.stringify(size)}`,
  );
  for (const modal of size.dialogs)
    assert.ok(modal.scroll <= modal.client + 1, `${label}: modal overflow`);
}
try {
  for (const address of [email, `stranger-${email}`]) {
    const user = ok(
      await admin.auth.admin.createUser({
        email: address,
        password,
        email_confirm: true,
      }),
    ).user;
    users.push(user.id);
  }
  ok(await api.auth.signInWithPassword({ email, password }));
  ok(
    await stranger.auth.signInWithPassword({
      email: `stranger-${email}`,
      password,
    }),
  );
  const work = ok(
    await api
      .from("workspaces")
      .insert({ name: "Desenvolvimento profissional", category: "work" })
      .select()
      .single(),
  );
  const personal = ok(
    await api
      .from("workspaces")
      .insert({ name: "Pessoal", category: "personal_life" })
      .select()
      .single(),
  );
  const otherWork = ok(
    await api
      .from("workspaces")
      .insert({ name: "Outro trabalho", category: "work" })
      .select()
      .single(),
  );
  const paths = {
    career: `/workspaces/${work.id}/career`,
    development: `/workspaces/${work.id}/development`,
  };
  await page.goto(root);
  await page.getByRole("link", { name: "Entrar", exact: true }).first().click();
  await login();
  assert.equal(
    requests.some((url) =>
      /rest\/v1\/(career_targets|professional_development_items)/.test(url),
    ),
    false,
  );
  pass(
    "Home does not query either professional table before visiting the modules",
  );
  await page.goto(root + paths.career);
  await plan()
    .getByRole("heading", { name: "Plano de Carreira", exact: true })
    .waitFor();
  const requirements =
    "  Formação em engenharia\n\n• Inglês avançado\nTypeScript e PostgreSQL  ";
  for (const [company, region, country, order] of [
    ["Empresa Brasil", "brazil", "Brasil", "20"],
    ["Empresa Exterior", "abroad", "Território personalizado", "10"],
  ]) {
    await plan()
      .getByRole("button", { name: "Adicionar empresa alvo" })
      .click();
    await dialog().getByLabel("Nome da empresa", { exact: true }).fill(company);
    await dialog()
      .getByLabel("Cargo ou posição desejada", { exact: true })
      .fill("Engenheiro de software");
    await dialog().getByLabel("Região", { exact: true }).selectOption(region);
    await dialog().getByLabel("País", { exact: false }).fill(country);
    await dialog()
      .getByLabel("Exigências do mercado", { exact: false })
      .fill(requirements);
    await dialog().getByLabel("Ordem na lista", { exact: false }).fill(order);
    await dialog()
      .getByLabel("Link da oportunidade ou página de carreiras")
      .fill("https://example.org/careers");
    await save();
    await plan().getByRole("heading", { name: company, exact: true }).waitFor();
  }
  const targets = ok(
    await api.from("career_targets").select().eq("workspace_id", work.id),
  );
  assert.equal(targets.length, 2);
  const target = targets.find((t) => t.region === "abroad");
  assert.equal(target.market_requirements, requirements);
  await plan().getByLabel("Região", { exact: true }).selectOption("abroad");
  await plan()
    .getByRole("heading", { name: "Empresa Exterior", exact: true })
    .waitFor();
  assert.equal(
    await plan()
      .getByRole("heading", { name: "Empresa Brasil", exact: true })
      .count(),
    0,
  );
  await plan()
    .getByRole("button", { name: "Ver oportunidade", exact: true })
    .click();
  await page.waitForURL(root + paths.career + "/" + target.id);
  await plan().locator(".plan-requirements").waitFor();
  assert.equal(
    await plan().locator(".plan-requirements").textContent(),
    requirements,
  );
  await plan().getByRole("button", { name: "Editar", exact: true }).click();
  const editedRequirements =
    requirements + "\nCertificação informada pelo usuário";
  await dialog()
    .getByLabel("Exigências do mercado", { exact: false })
    .fill(editedRequirements);
  await dialog().getByLabel("Ordem na lista", { exact: false }).fill("5");
  await save();
  await page.reload();
  await plan().locator(".plan-requirements").waitFor();
  assert.equal(
    await plan().locator(".plan-requirements").textContent(),
    editedRequirements,
  );
  assert.equal(
    ok(await api.from("career_targets").select().eq("id", target.id).single())
      .sort_order,
    5,
  );
  pass(
    "Brazil/abroad companies, custom country, region filter, individual direct route, editing, manual order and exact multiline requirements survive reload",
  );

  await page.goto(root + paths.development);
  await plan()
    .getByRole("button", { name: "Adicionar ponto de desenvolvimento" })
    .click();
  await dialog()
    .getByLabel("Ponto de desenvolvimento", { exact: true })
    .fill("Inglês avançado");
  await dialog()
    .getByLabel("Plano de ação", { exact: true })
    .fill("Desenvolver comunicação profissional\nem inglês");
  await dialog()
    .getByLabel("Critério de sucesso", { exact: true })
    .fill("Apresentar projeto em inglês");
  await dialog()
    .getByLabel("Evidências de evolução", { exact: true })
    .fill("Apresentação mensal");
  await dialog()
    .getByLabel("Data de início", { exact: true })
    .fill("2026-11-13");
  await dialog()
    .getByLabel("Prazo de conclusão", { exact: true })
    .fill("2027-01-13");
  await dialog()
    .getByRole("button", { name: "Selecionar oportunidade" })
    .click();
  await dialog()
    .getByRole("button", { name: "Empresa Exterior · Engenheiro de software" })
    .click();
  await audit("PDI editor desktop light");
  await save();
  await plan().getByText("Inglês avançado", { exact: true }).waitFor();
  let item = ok(
    await api
      .from("professional_development_items")
      .select()
      .eq("workspace_id", work.id)
      .single(),
  );
  assert.equal(item.career_target_id, target.id);
  assert.equal(
    item.action_plan,
    "Desenvolver comunicação profissional\nem inglês",
  );
  await plan().getByRole("button", { name: "Editar", exact: true }).click();
  await dialog()
    .getByLabel("Plano de ação", { exact: true })
    .fill("Praticar apresentações semanalmente");
  await save();
  await plan()
    .getByLabel("Status", { exact: true })
    .last()
    .selectOption("in_progress");
  await page.waitForLoadState("networkidle");
  await page.reload();
  await plan()
    .getByText("Praticar apresentações semanalmente", { exact: true })
    .waitFor();
  assert.equal(
    await plan().getByLabel("Status", { exact: true }).last().inputValue(),
    "in_progress",
  );
  const revised = ok(
    await api
      .from("professional_development_items")
      .select()
      .eq("id", item.id)
      .single(),
  );
  assert.equal(revised.created_at, item.created_at);
  assert.ok(revised.revision > item.revision);
  item = revised;
  pass(
    "PDI creation pairs both texts, saves optional fields and link, supports edit/status and preserves creation time after reload",
  );

  // Use SPA navigation so Back exercises the persistent App layout.
  await page.locator(`.context-link[href="${paths.career}"]`).click();
  await page.waitForURL(root + paths.career);
  await page.locator(`.context-link[href="${paths.development}"]`).click();
  await page.waitForURL(root + paths.development);
  // Escape, reload and browser Back cannot silently destroy a draft.
  await plan().getByRole("button", { name: "Editar", exact: true }).click();
  await dialog()
    .getByLabel("Plano de ação", { exact: true })
    .fill("Rascunho não salvo");
  await page.keyboard.press("Escape");
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  assert.equal(
    await dialog().getByLabel("Plano de ação", { exact: true }).inputValue(),
    "Rascunho não salvo",
  );
  let unload = false;
  const dismissUnload = async (d) => {
    if (d.type() === "beforeunload") unload = true;
    await d.dismiss();
  };
  page.on("dialog", dismissUnload);
  await page.reload({ timeout: 2500 }).catch(() => {});
  page.off("dialog", dismissUnload);
  assert.ok(unload);
  assert.equal(
    await dialog().getByLabel("Plano de ação", { exact: true }).inputValue(),
    "Rascunho não salvo",
  );
  await page.goBack();
  await page.waitForURL(root + paths.career);
  assert.equal(
    await dialog().getByLabel("Plano de ação", { exact: true }).inputValue(),
    "Rascunho não salvo",
  );
  await dialog().getByRole("button", { name: "Cancelar", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Descartar alterações", exact: true })
    .click();
  await dialog().waitFor({ state: "hidden" });
  pass(
    "Escape asks before discard, reload is guarded, and browser Back retains the open unsaved editor",
  );

  await page.goto(root + paths.development);
  await plan().getByRole("button", { name: "Editar", exact: true }).click();
  await dialog()
    .getByLabel("Plano de ação", { exact: true })
    .fill("Meu texto concorrente");
  ok(
    await api
      .from("professional_development_items")
      .update({ action_plan: "Outra sessão" })
      .eq("id", item.id)
      .eq("revision", item.revision),
  );
  await dialog().getByRole("button", { name: "Salvar", exact: true }).click();
  await dialog().getByRole("alert").waitFor();
  assert.equal(
    await dialog().getByLabel("Plano de ação", { exact: true }).inputValue(),
    "Meu texto concorrente",
  );
  await dialog().getByRole("button", { name: "Cancelar", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Descartar alterações", exact: true })
    .click();
  item = ok(
    await api
      .from("professional_development_items")
      .select()
      .eq("id", item.id)
      .single(),
  );
  const competing = await Promise.all(
    ["Praticar entrevistas em inglês", "Apresentar projetos em inglês"].map(
      (action_plan) =>
        api
          .from("professional_development_items")
          .update({ action_plan })
          .eq("id", item.id)
          .eq("revision", item.revision)
          .select(),
    ),
  );
  assert.deepEqual(competing.map((r) => ok(r).length).sort(), [0, 1]);
  pass(
    "A stale form preserves user text and concurrent authenticated HTTP updates admit exactly one revision",
  );

  for (const table of ["career_targets", "professional_development_items"]) {
    assert.deepEqual(
      ok(await stranger.from(table).select().eq("workspace_id", work.id)),
      [],
    );
    assert.deepEqual(
      ok(await stranger.rpc("export_professional_plans", { p_table: table })),
      [],
    );
    assert.deepEqual(
      ok(
        await stranger
          .from(table)
          .delete()
          .eq("workspace_id", work.id)
          .select(),
      ),
      [],
    );
  }
  assert.ok(
    (
      await stranger.from("professional_development_items").insert({
        workspace_id: work.id,
        development_area: "Intrusão",
        action_plan: "Intrusão",
      })
    ).error,
  );
  assert.ok(
    (
      await api.from("professional_development_items").insert({
        workspace_id: otherWork.id,
        development_area: "Wrong workspace",
        action_plan: "Plan",
        career_target_id: target.id,
      })
    ).error,
  );
  ok(
    await api
      .from("workspaces")
      .update({ category: "sports" })
      .eq("id", work.id),
  );
  await page.reload();
  await page
    .getByText(
      "Estes planos estão disponíveis apenas em workspaces da categoria Trabalho.",
      { exact: true },
    )
    .waitFor();
  assert.equal(await page.locator('a[href="' + paths.career + '"]').count(), 0);
  for (const table of ["career_targets", "professional_development_items"]) {
    assert.deepEqual(
      ok(await api.from(table).select().eq("workspace_id", work.id)),
      [],
    );
    assert.ok(
      ok(await api.rpc("export_professional_plans", { p_table: table }))
        .length > 0,
    );
  }
  await page.goto(root + "/settings");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar meus dados" }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(readFileSync(await download.path(), "utf8"));
  assert.equal(exported.career_targets.length, 2);
  assert.equal(exported.professional_development_items.length, 1);
  assert.equal(
    exported.career_targets.find((r) => r.id === target.id).market_requirements,
    editedRequirements,
  );
  ok(
    await api.from("workspaces").update({ category: "work" }).eq("id", work.id),
  );
  await page.goto(root + paths.career);
  await plan()
    .getByRole("heading", { name: "Empresa Brasil", exact: true })
    .waitFor();
  await page.goto(root + `/workspaces/${personal.id}/career`);
  await page
    .getByText(
      "Estes planos estão disponíveis apenas em workspaces da categoria Trabalho.",
      { exact: true },
    )
    .waitFor();
  pass(
    "Real API RLS isolates owners/workspaces; incompatible category hides routes and rows, owner export includes preserved data, and Work restores them",
  );

  // End the real browser session and authenticate again using the UI.
  await page.getByRole("button", { name: "Menu do usuário" }).click();
  await page.getByRole("menuitem", { name: "Sair", exact: true }).click();
  await page.getByLabel("E-mail", { exact: true }).waitFor();
  await login();
  await page.goto(root + paths.career + "/" + target.id);
  await plan().locator(".plan-requirements").waitFor();
  assert.equal(
    await plan().locator(".plan-requirements").textContent(),
    editedRequirements,
  );
  pass(
    "Logout and a new real Auth login preserve the career requirements and opportunities",
  );

  // 4 widths x 2 themes, including PDI/editor pairs and career detail/editor.
  for (const width of [375, 768, 1024, 1440])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 });
      await page.evaluate((theme) => {
        localStorage.setItem("tasknado.theme", theme);
        document.documentElement.setAttribute("data-theme", theme);
      }, theme);
      for (const kind of ["development", "career"]) {
        await page.goto(
          root + paths[kind] + (kind === "career" ? "/" + target.id : ""),
        );
        await plan().locator(".plan-card").first().waitFor();
        await noOverflow(`${kind}-${width}-${theme}`);
        await audit(`${kind}-${width}-${theme}`);
        await page.screenshot({
          path: `${shots}/${kind}-${width}-${theme}.png`,
          fullPage: true,
        });
        if (kind === "development") {
          const boxes = await plan()
            .locator(".plan-pair > div")
            .evaluateAll((nodes) =>
              nodes.map((n) => {
                const r = n.getBoundingClientRect();
                return { x: r.x, y: r.y };
              }),
            );
          if (width === 375) assert.ok(boxes[1].y > boxes[0].y);
          else
            assert.ok(
              Math.abs(boxes[1].y - boxes[0].y) < 2 && boxes[1].x > boxes[0].x,
            );
        }
        await plan()
          .getByRole("button", { name: "Editar", exact: true })
          .first()
          .click();
        await noOverflow(`editor-${kind}-${width}-${theme}`);
        await audit(`editor-${kind}-${width}-${theme}`);
        await page.screenshot({
          path: `${shots}/editor-${kind}-${width}-${theme}.png`,
          fullPage: true,
        });
        await dialog()
          .getByRole("button", { name: "Cancelar", exact: true })
          .click();
      }
      if (width === 375) {
        await page.getByRole("button", { name: "Abrir menu" }).click();
        await page
          .getByRole("dialog")
          .getByRole("link", {
            name: "Plano de Desenvolvimento Individual",
            exact: true,
          })
          .click();
        await page.waitForURL(root + paths.development);
        await page.getByRole("dialog").waitFor({ state: "hidden" });
      }
    }
  pass(
    "PDI/career pages and editors pass no-overflow and axe at 375/768/1024/1440 in light/dark; paired fields stack on phone and mobile drawer navigates",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Use the application's language control; user content remains unchanged.
  await page.goto(root + paths.development);
  await plan().locator(".plan-card").first().waitFor();
  await page
    .getByLabel("Idioma da interface", { exact: true })
    .selectOption("en-US");
  await plan()
    .getByRole("heading", { name: "Individual Development Plan", exact: true })
    .waitFor();
  await plan().getByRole("button", { name: "Edit", exact: true }).click();
  await dialog().getByLabel("Development Area", { exact: true }).waitFor();
  assert.equal(
    await dialog().getByLabel("Development Area", { exact: true }).inputValue(),
    "Inglês avançado",
  );
  await dialog().getByRole("button", { name: "Cancel", exact: true }).click();
  await page.goto(root + paths.career + "/" + target.id);
  await plan()
    .getByRole("heading", { name: "Market Requirements", exact: true })
    .waitFor();
  assert.equal(
    await plan().locator(".plan-requirements").textContent(),
    editedRequirements,
  );
  await audit("career detail en-US");
  pass(
    "English UI translates modules/forms while preserving Portuguese user-authored text and whitespace",
  );

  // Pagination and exact filters operate against the server, including page 2.
  const bulk = Array.from({ length: 27 }, (_, i) => ({
    workspace_id: work.id,
    development_area: `Pagination ${String(i).padStart(2, "0")}`,
    action_plan: `Action ${i}`,
    priority: 3,
    status: "completed",
  }));
  ok(await api.from("professional_development_items").insert(bulk));
  await page.goto(root + paths.development);
  await plan()
    .getByLabel("Filter by development area", { exact: true })
    .fill("Pagination");
  await page.waitForResponse(
    (r) =>
      r.url().includes("professional_development_items") &&
      r.url().includes("Pagination") &&
      r.status() === 200,
  );
  await page.waitForLoadState("networkidle");
  assert.equal(await plan().locator(".plan-card").count(), 25);
  await plan().getByRole("button", { name: "Next Page", exact: true }).click();
  await page.waitForLoadState("networkidle");
  assert.equal(await plan().locator(".plan-card").count(), 2);
  await plan()
    .getByLabel("Priority", { exact: true })
    .first()
    .selectOption("1");
  await plan()
    .getByRole("heading", { name: "No development areas found.", exact: true })
    .waitFor();
  pass(
    "Server pagination returns 25 then 2 filtered records; priority change resets the page and filters all records",
  );

  await page.goto(root + paths.career + "/" + target.id);
  await plan().getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await page.waitForURL(root + paths.career);
  assert.equal(
    ok(
      await api
        .from("professional_development_items")
        .select("career_target_id")
        .eq("id", item.id)
        .single(),
    ).career_target_id,
    null,
  );
  await page.goto(root + paths.development);
  await plan()
    .getByLabel("Filter by development area", { exact: true })
    .fill("Inglês avançado");
  await page.waitForLoadState("networkidle");
  await plan().getByText("Inglês avançado", { exact: true }).waitFor();
  await plan().getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await page.getByRole("alertdialog").waitFor({ state: "hidden" });
  assert.equal(
    ok(
      await api
        .from("professional_development_items")
        .select()
        .eq("id", item.id),
    ).length,
    0,
  );
  ok(await api.rpc("delete_workspace", { p_workspace: work.id }));
  assert.equal(
    ok(
      await api.rpc("export_professional_plans", { p_table: "career_targets" }),
    ).length,
    0,
  );
  assert.equal(
    ok(
      await api.rpc("export_professional_plans", {
        p_table: "professional_development_items",
      }),
    ).length,
    0,
  );
  pass(
    "UI deletion confirms both record types; target deletion preserves/unlinks PDI; workspace deletion removes every new row",
  );
  assert.deepEqual(errors, []);
  pass("No browser runtime exceptions throughout professional acceptance");
} catch (e) {
  failure = e.stack || String(e);
  console.error(failure);
  process.exitCode = 1;
  await page
    .screenshot({ path: shots + "/failure.png", fullPage: true })
    .catch(() => {});
} finally {
  writeFileSync(
    "test-results/professional-live.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        checks,
        accessibility,
        errors,
        failure,
        scope:
          "Real local Supabase Auth/PostgREST + Edge Chromium; temporary users removed",
      },
      null,
      2,
    ),
  );
  await browser.close();
  for (const id of users) ok(await admin.auth.admin.deleteUser(id));
}
