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
if (state.API_URL !== "http://127.0.0.1:55431")
  throw Error("Only isolated local Supabase is allowed");
const admin = createClient(state.API_URL, state.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const email = `browser-${Date.now()}@tasknado.test`,
  password = `QA-${crypto.randomUUID()}!`;
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const created = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (created.error) {
  await browser.close();
  throw created.error;
}
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const checks = [];
const pass = (s) => {
  checks.push(s);
  console.log("PASS " + s);
};
mkdirSync("test-results", { recursive: true });
try {
  await page.goto("http://127.0.0.1:3000");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);

  await page
    .locator("form button")
    .filter({ hasText: "Entrar" })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Criar meu primeiro workspace" })
    .waitFor();
  pass("Real browser authentication");
  await page
    .getByRole("button", { name: "Criar meu primeiro workspace" })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Nome", { exact: true })
    .fill("QA Trabalho");
  await page.getByLabel("Categoria do workspace").selectOption("work");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Nova atividade", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Título", { exact: true })
    .fill("Fechamento QA");
  await page.getByLabel("Possui uma data programada?").selectOption("yes");
  await page.getByLabel("Data programada", { exact: true }).fill("2020-01-01");
  await page.getByLabel("Horário programado (opcional)").fill("14:00");
  await page
    .getByRole("combobox", { name: "Urgência", exact: true })
    .selectOption("true");
  await page
    .getByRole("combobox", { name: "Importância", exact: true })
    .selectOption("true");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Fechamento QA", exact: true })
    .waitFor();
  await page.getByText("Atrasada", { exact: true }).waitFor();
  pass("Work fields, scheduled time, Q1 and overdue indication");
  await page.getByLabel("Registrar acontecimento").selectOption("observation");
  await page
    .getByRole("textbox", { name: "Conteúdo do acontecimento" })
    .fill("Observação persistente QA");
  await page
    .getByRole("button", { name: "Registrar Observação", exact: true })
    .click();
  await page.getByText("Observação persistente QA", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Editar observação", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("textbox")
    .fill("Observação editada QA");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar", exact: true })
    .click();
  await page.getByText("Observação editada QA", { exact: true }).waitFor();
  await page.getByText("Editada em", { exact: false }).waitFor();
  pass("Observation creation and editing in UI");
  await page
    .getByRole("button", { name: "Todas as atividades", exact: true })
    .click();
  await page.getByLabel("Quadrante de Fechamento QA").selectOption("q2");
  await page
    .locator(".q2 .matrix-card")
    .getByText("Fechamento QA", { exact: true })
    .waitFor();
  await page.locator(".q2 .matrix-card").dragTo(page.locator(".q3"));
  await page
    .locator(".q3 .matrix-card")
    .getByText("Fechamento QA", { exact: true })
    .waitFor();
  pass("Keyboard selector and actual drag/drop persist matrix changes");
  await page.screenshot({
    path: "test-results/work-matrix.png",
    fullPage: true,
  });
  await page.reload();
  await page
    .locator(".q3 .matrix-card")
    .getByText("Fechamento QA", { exact: true })
    .waitFor();
  await page
    .locator(".q3 .matrix-card")
    .getByRole("button", { name: "Fechamento QA", exact: true })
    .click();
  await page.getByText("Observação editada QA", { exact: true }).waitFor();
  pass("Matrix, schedule and observations survive browser reload");
  await page.screenshot({
    path: "test-results/activity-observations.png",
    fullPage: true,
  });

  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Excluir observação", exact: true })
    .click();
  await page
    .getByText("Observação editada QA", { exact: true })
    .waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Criar workspace", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Nome", { exact: true })
    .fill("QA Faculdade");
  await page.getByLabel("Categoria do workspace").selectOption("university");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Nova atividade", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Título", { exact: true })
    .fill("Trabalho acadêmico QA");
  const canvas = page.getByRole("combobox", {
    name: "Aberta no Canvas?",
    exact: true,
  });
  if ((await canvas.inputValue()) !== "")
    throw Error("Canvas must start unanswered");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar", exact: true })
    .click();
  if (!(await page.getByRole("dialog").isVisible()))
    throw Error("Canvas choice must be required");
  await canvas.selectOption("false");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Trabalho acadêmico QA", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Todas as atividades", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Aberta no Canvas?", exact: true })
    .selectOption("true");
  await page.locator(".activity-row").waitFor({ state: "hidden" });
  await page
    .getByRole("combobox", { name: "Aberta no Canvas?", exact: true })
    .selectOption("false");
  await page.locator(".activity-row").waitFor();
  pass("Observation deletion, explicit Canvas choice and Yes/No filters");
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Idioma da interface", exact: true })
    .selectOption("en-US");
  await page.getByRole("button", { name: /^Create workspace$/i }).click();
  await page
    .getByRole("dialog")
    .getByText("Workspace Category", { exact: false })
    .waitFor();
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: /^New (activity|task)$/i }).waitFor();
  pass("English UI switches immediately and persists after reload");
  if (errors.length) throw Error(errors.join("\n"));
} catch (e) {
  await page.screenshot({
    path: "test-results/browser-failure.png",
    fullPage: true,
  });
  console.error((await page.locator("body").innerText()).slice(-8000));
  throw e;
} finally {
  await browser.close();
  await admin.auth.admin.deleteUser(created.data.user.id);
  writeFileSync(
    "test-results/browser.json",
    JSON.stringify({ date: new Date().toISOString(), checks, errors }, null, 2),
  );
}
