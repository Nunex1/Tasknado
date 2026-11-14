// Browser journey for block and note deletion against the isolated local stack.
// Uses a temporary account that is removed at the end; no existing data is touched.
import { localStack } from "./security-stack.mjs";
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
// Development stack by default; TASKNADO_TEST_STACK=security selects the
// isolated stack that carries every migration. Loopback only, either way.
const state = localStack();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(state.API_URL, state.SERVICE_ROLE_KEY, options);
const api = createClient(state.API_URL, state.ANON_KEY, options);
const ok = (r) => {
  assert.ifError(r.error);
  return r.data;
};
const email = `notes-${Date.now()}@tasknado.test`,
  password = `QA-${crypto.randomUUID()}!`;
const user = ok(
  await admin.auth.admin.createUser({ email, password, email_confirm: true }),
).user;
ok(await api.auth.signInWithPassword({ email, password }));
const root = process.env.TASKNADO_TEST_URL || "http://127.0.0.1:3000";
const shots = "test-results/notes-deletion";
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  timezoneId: "America/Sao_Paulo",
  locale: "pt-BR",
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const checks = [],
  errors = [],
  requests = [];
let failure = null;
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (request) => {
  const rpc = request.url().match(/\/rest\/v1\/rpc\/(\w+)/)?.[1];
  if (!rpc) return;
  let body = {};
  try {
    body = request.postDataJSON() ?? {};
  } catch {}
  requests.push({ rpc, body });
});
const calls = (rpc) => requests.filter((r) => r.rpc === rpc);
const pass = (s) => {
  checks.push(s);
  console.log("PASS " + s);
};
async function eventually(fn, message = "Condition did not become true") {
  for (let i = 0; i < 60; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  assert.fail(message);
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
// No save may be issued for a record once its deletion has been requested.
function savesAfter(rpc, id) {
  const from = requests.findIndex((r) => r.rpc === rpc);
  assert.ok(from >= 0, rpc + " was requested");
  return requests
    .slice(from + 1)
    .filter((r) => r.rpc === "save_entry" && (!id || r.body.p_id === id))
    .length;
}
// Holds one block's save so it reaches the server after the deletion.
async function delaySaves(id, ms) {
  await context.route("**/rest/v1/rpc/save_entry", async (route) => {
    if (route.request().postDataJSON()?.p_id === id) await pause(ms);
    await route.continue();
  });
}
async function noSaveErrors() {
  assert.equal(await page.getByText("Erro ao salvar").count(), 0);
  assert.equal(
    await page
      .locator(".toast")
      .filter({ hasText: /Conflito|Conflict/ })
      .count(),
    0,
  );
}
async function dismiss() {
  const close = page.locator(".toast").getByRole("button");
  if (await close.count()) await close.click().catch(() => {});
}
const count = async (table, column, id) =>
  ok(await api.from(table).select("id").eq(column, id)).length;
async function note(workspaceId, title, contents) {
  const created = ok(
    await api
      .from("notes")
      .insert({ workspace_id: workspaceId, title })
      .select()
      .single(),
  );
  const blocks = [];
  for (const content of contents)
    blocks.push(
      ok(
        await api
          .from("note_entries")
          .insert({ note_id: created.id, content })
          .select()
          .single(),
      ),
    );
  return { ...created, blocks };
}
const dialog = page.getByRole("alertdialog");
const entries = page.locator(".note-entry");
const values = () =>
  entries.locator("textarea").evaluateAll((list) => list.map((e) => e.value));
const toast = (text) =>
  page.locator(".toast").filter({ hasText: text }).waitFor();
const isFocused = (locator) =>
  locator.evaluate((element) => element === document.activeElement);
const focused = async (locator) => {
  for (let i = 0; i < 20; i++) {
    if (await isFocused(locator).catch(() => false)) return true;
    await pause(100);
  }
  return false;
};
const trash = (index) =>
  entries.nth(index).getByRole("button", { name: "Excluir bloco" });
async function axe(label) {
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const violations = await page.evaluate(async () => {
    await Promise.all(
      document.getAnimations().map((a) => a.finished.catch(() => {})),
    );
    const result = await window.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
      },
    });
    return result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    }));
  });
  assert.deepEqual(violations, [], "Accessibility: " + label);
}
try {
  const work = ok(
    await api
      .from("workspaces")
      .insert({ name: "Carreira", category: "work" })
      .select()
      .single(),
  );
  const solo = ok(
    await api.from("workspaces").insert({ name: "Efêmero" }).select().single(),
  );
  const disney = await note(work.id, "Disney - Vagas", [
    "Bloco 1",
    "Bloco 2",
    "Bloco 3",
    "Bloco 4",
  ]);
  const neighbor = await note(work.id, "Anthropic | Vagas", ["Vizinho"]);
  const last = await note(solo.id, "Única nota", ["Conteúdo único"]);
  const disneyUrl = `${root}/workspaces/${work.id}/notes/${disney.id}`;

  await page.goto(root);
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page
    .locator("form")
    .getByRole("button", { name: "Entrar na minha conta", exact: true })
    .click();
  await page.locator(".global-header").waitFor();
  await page.goto(disneyUrl);
  await eventually(async () => (await entries.count()) === 4);

  // Layout: every block has its own action, aligned with date and status.
  assert.equal(
    await page.getByRole("button", { name: "Excluir bloco" }).count(),
    4,
  );
  assert.equal(await trash(0).getAttribute("title"), "Excluir bloco");
  const geometry = await page.evaluate(() => {
    const box = (e) => e.getBoundingClientRect();
    const entry = document.querySelector(".note-entry");
    const row = box(entry.querySelector(".row.between")),
      time = box(entry.querySelector("time")),
      status = box(entry.querySelector(".save-status")),
      button = box(entry.querySelector(".note-entry-delete")),
      area = box(entry.querySelector("textarea"));
    const heading = document.querySelector(".note-heading"),
      title = box(heading.querySelector("h2")),
      head = box(heading),
      actions = box(heading.querySelector(".note-actions"));
    return {
      rowHeight: row.height,
      lineHeight: Math.max(time.height, status.height),
      buttonSize: [button.width, button.height],
      buttonAfterStatus: button.left >= status.right,
      buttonAtRightEdge: Math.abs(button.right - row.right) < 1,
      buttonCentered:
        Math.abs(
          (button.top + button.bottom - status.top - status.bottom) / 2,
        ) < 1.5,
      buttonClearOfText: button.bottom <= area.top,
      titleCenterError: Math.abs(
        (head.left + head.right - title.left - title.right) / 2,
      ),
      titleOverlapsActions: title.right > actions.left,
      columns: getComputedStyle(
        document.querySelector(".notes-layout"),
      ).gridTemplateColumns.split(" ").length,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  assert.ok(
    Math.abs(geometry.rowHeight - geometry.lineHeight) < 0.5,
    "row height preserved",
  );
  assert.deepEqual(geometry.buttonSize, [24, 24]);
  for (const key of [
    "buttonAfterStatus",
    "buttonAtRightEdge",
    "buttonCentered",
    "buttonClearOfText",
  ])
    assert.equal(geometry[key], true, key);
  assert.ok(geometry.titleCenterError < 1);
  assert.equal(geometry.titleOverlapsActions, false);
  assert.equal(geometry.columns, 2);
  assert.equal(geometry.overflow, false);
  await trash(1).hover();
  await page.screenshot({
    path: `${shots}/01-note-with-blocks.png`,
    animations: "disabled",
  });
  await axe("note with blocks");
  pass(
    "Each block has a compact delete action aligned with date and status; row height, centered title and two-column layout preserved; no WCAG violations",
  );

  // Scenario E: cancelling by Escape, Cancel, the close button and the overlay.
  await trash(1).click();
  await dialog.waitFor();
  await dialog.getByRole("heading", { name: "Excluir este bloco?" }).waitFor();
  await dialog
    .getByText(
      "Esta ação removerá permanentemente o bloco selecionado. O restante da nota permanecerá inalterado.",
    )
    .waitFor();
  assert.equal(
    await focused(dialog.getByRole("button", { name: "Cancelar" })),
    true,
    "focus starts on Cancel",
  );
  assert.equal(
    await dialog.getByRole("button", { name: "Excluir" }).count(),
    1,
  );
  await page.screenshot({
    path: `${shots}/02-confirm-block.png`,
    animations: "disabled",
  });
  await axe("block confirmation");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  assert.equal(
    await dialog.evaluate((e) => e.contains(document.activeElement)),
    true,
    "focus stays inside the dialog",
  );
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await focused(trash(1)), true, "focus returns to the action");
  await trash(1).click();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await dialog.waitFor({ state: "hidden" });
  await trash(1).click();
  await dialog.getByRole("button", { name: "Fechar" }).click();
  await dialog.waitFor({ state: "hidden" });
  await trash(1).click();
  await dialog.waitFor();
  // The dialog starts listening for outside clicks a tick after it appears.
  await pause(200);
  await page.mouse.click(20, 20);
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await entries.count(), 4);
  assert.equal(await count("note_entries", "note_id", disney.id), 4);
  assert.equal(calls("delete_entry").length, 0);
  pass(
    "Cancelling a block deletion (Escape, Cancel, close, overlay) sends nothing, changes nothing and restores focus; focus is trapped in the dialog",
  );

  // Scenarios A, G and I: delete the middle block while its autosave is pending,
  // confirming with a double click.
  await entries.nth(1).locator("textarea").fill("Bloco 2 com edição pendente");
  await trash(1).click();
  await dialog.getByRole("button", { name: "Excluir" }).dblclick();
  await dialog.waitFor({ state: "hidden" });
  await toast("Bloco excluído.");
  await eventually(async () => (await entries.count()) === 3);
  assert.deepEqual(await values(), ["Bloco 1", "Bloco 3", "Bloco 4"]);
  assert.equal(page.url(), disneyUrl);
  await pause(1600);
  assert.equal(calls("delete_entry").length, 1, "one deletion request");
  assert.deepEqual(calls("delete_entry")[0].body, {
    p_id: disney.blocks[1].id,
    p_note: disney.id,
  });
  assert.equal(
    savesAfter("delete_entry", disney.blocks[1].id),
    0,
    "no save after the deletion",
  );
  assert.equal(await count("note_entries", "id", disney.blocks[1].id), 0);
  assert.equal(await count("note_entries", "note_id", disney.id), 3);
  assert.equal(await count("notes", "id", disney.id), 1);
  await noSaveErrors();
  await dismiss();
  // A save already on its way arrives after the deletion: it must be ignored.
  await delaySaves(disney.blocks[3].id, 1500);
  await entries
    .nth(2)
    .locator("textarea")
    .fill("Bloco 4 com gravação em trânsito");
  await eventually(
    async () =>
      calls("save_entry").some((r) => r.body.p_id === disney.blocks[3].id),
    "save in flight",
  );
  await trash(2).click();
  await dialog.getByRole("button", { name: "Excluir" }).click();
  await dialog.waitFor({ state: "hidden" });
  await toast("Bloco excluído.");
  await eventually(async () => (await entries.count()) === 2);
  await pause(2500);
  await context.unroute("**/rest/v1/rpc/save_entry");
  await noSaveErrors();
  assert.equal(await count("note_entries", "id", disney.blocks[3].id), 0);
  assert.deepEqual(await values(), ["Bloco 1", "Bloco 3"]);
  await dismiss();
  // The deleted block must not keep the page "dirty": navigation still works.
  await page
    .locator(".note-list-item")
    .filter({ hasText: "Anthropic" })
    .click();
  await page.waitForURL(`${root}/workspaces/${work.id}/notes/${neighbor.id}`);
  await page.locator(".note-list-item").filter({ hasText: "Disney" }).click();
  await page.waitForURL(disneyUrl);
  await eventually(async () => (await entries.count()) === 2);
  await page.reload();
  await eventually(async () => (await entries.count()) === 2);
  assert.deepEqual(await values(), ["Bloco 1", "Bloco 3"]);
  pass(
    "Deleting a block with a pending autosave removes only that block, keeps order and the note, sends one request on double click, issues no later save, ignores a save that was already in flight, never recreates the block and survives reload",
  );

  // Autosave regression on the remaining blocks.
  await entries.nth(0).locator("textarea").fill("Bloco 1 revisado");
  await entries
    .nth(0)
    .locator(".save-status")
    .filter({ hasText: "Salvo" })
    .waitFor();
  await eventually(
    async () =>
      ok(
        await api
          .from("note_entries")
          .select("content")
          .eq("id", disney.blocks[0].id)
          .single(),
      ).content === "Bloco 1 revisado",
  );
  pass("Autosave still persists edits on the remaining blocks");

  // Scenario F: a failed deletion keeps the block and its unsaved text.
  await context.route("**/rest/v1/rpc/delete_entry", (route) => route.abort());
  await entries
    .nth(1)
    .locator("textarea")
    .fill("Bloco 3 editado antes da falha");
  await trash(1).click();
  await dialog.getByRole("button", { name: "Excluir" }).click();
  await dialog.waitFor({ state: "hidden" });
  await toast("Sem conexão com o servidor. Tente novamente.");
  await context.unroute("**/rest/v1/rpc/delete_entry");
  assert.equal(await entries.count(), 2);
  assert.equal(await page.locator(".note-entry.deleting").count(), 0);
  assert.equal(await count("note_entries", "id", disney.blocks[2].id), 1);
  await entries
    .nth(1)
    .locator(".save-status")
    .filter({ hasText: "Salvo" })
    .waitFor();
  assert.equal(
    ok(
      await api
        .from("note_entries")
        .select("content")
        .eq("id", disney.blocks[2].id)
        .single(),
    ).content,
    "Bloco 3 editado antes da falha",
  );
  await dismiss();
  pass(
    "A failed block deletion shows a localized error, keeps the block and resumes the autosave of its unsaved text",
  );

  // A block already deleted elsewhere leaves the screen instead of erroring forever.
  ok(
    await api.rpc("delete_entry", {
      p_id: disney.blocks[2].id,
      p_note: disney.id,
    }),
  );
  await trash(1).click();
  await dialog.getByRole("button", { name: "Excluir" }).click();
  await toast("Este bloco não está mais disponível.");
  await eventually(async () => (await entries.count()) === 1);
  await dismiss();

  // Scenario B: deleting the last block keeps the note usable.
  await trash(0).click();
  await dialog.getByRole("button", { name: "Excluir" }).click();
  await toast("Bloco excluído.");
  await page
    .getByRole("heading", { name: "Espaço para uma nova ideia" })
    .waitFor();
  assert.equal(await focused(page.locator(".note-heading h2")), true);
  assert.equal(await count("notes", "id", disney.id), 1);
  assert.equal(await count("note_entries", "note_id", disney.id), 0);
  await page
    .getByRole("button", { name: "Adicionar entrada", exact: true })
    .click();
  await eventually(async () => (await entries.count()) === 1);
  await entries.locator("textarea").fill("Conteúdo depois de esvaziar");
  await entries.locator(".save-status").filter({ hasText: "Salvo" }).waitFor();
  await page.reload();
  await eventually(async () => (await entries.count()) === 1);
  assert.deepEqual(await values(), ["Conteúdo depois de esvaziar"]);
  pass(
    "Deleting the last block (and one already deleted elsewhere) leaves the note in place, ready for new content that persists",
  );

  // Note actions menu: keyboard, both items, existing edit flow intact.
  const menuButton = page.getByRole("button", { name: "Ações da nota" });
  await menuButton.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Ações da nota" });
  await menu.waitFor();
  assert.deepEqual(await menu.getByRole("menuitem").allTextContents(), [
    "Editar nota",
    "Excluir nota",
  ]);
  assert.equal(await focused(menu.getByRole("menuitem").nth(0)), true);
  await page.keyboard.press("ArrowDown");
  assert.equal(await focused(menu.getByRole("menuitem").nth(1)), true);
  await page.keyboard.press("ArrowDown");
  assert.equal(await focused(menu.getByRole("menuitem").nth(0)), true);
  await page.keyboard.press("End");
  assert.equal(await focused(menu.getByRole("menuitem").nth(1)), true);
  await page.screenshot({
    path: `${shots}/03-note-menu.png`,
    animations: "disabled",
  });
  await axe("note menu");
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "hidden" });
  assert.equal(await focused(menuButton), true);
  await menuButton.click();
  await page.locator(".page-heading h1").click();
  await menu.waitFor({ state: "hidden" });
  await menuButton.click();
  await menu.getByRole("menuitem", { name: "Editar nota" }).click();
  await page
    .getByRole("dialog")
    .getByRole("heading", { name: "Editar nota" })
    .waitFor();
  assert.equal(
    await page
      .getByRole("dialog")
      .getByLabel("Título", { exact: true })
      .inputValue(),
    "Disney - Vagas",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancelar" })
    .click();
  await page
    .getByRole("button", { name: "Renomear nota", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancelar" })
    .click();
  pass(
    "Note menu offers Edit Note and Delete Note, works by keyboard (arrows, End, Escape, focus return) and outside click; the existing edit flow is intact",
  );

  // English copy follows the selected language.
  await page.locator(".header-language select").selectOption("en-US");
  await page.getByRole("button", { name: "Delete Block" }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Delete Block" })
      .getAttribute("title"),
    "Delete Block",
  );
  await page.getByRole("button", { name: "Delete Block" }).click();
  await dialog.getByRole("heading", { name: "Delete this block?" }).waitFor();
  await dialog
    .getByText(
      "This action will permanently remove the selected block. The rest of the note will remain unchanged.",
    )
    .waitFor();
  assert.equal(
    await dialog.getByRole("button", { name: "Delete", exact: true }).count(),
    1,
  );
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Note actions" }).click();
  assert.deepEqual(await page.getByRole("menuitem").allTextContents(), [
    "Edit Note",
    "Delete Note",
  ]);
  await page.getByRole("menuitem", { name: "Delete Note" }).click();
  await dialog
    .getByRole("heading", { name: "Delete “Disney - Vagas”?" })
    .waitFor();
  await dialog
    .getByText(
      "This action will permanently delete this note, all its blocks and attached files.",
    )
    .waitFor();
  await page.screenshot({
    path: `${shots}/04-confirm-note-en.png`,
    animations: "disabled",
  });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    await focused(page.getByRole("button", { name: "Note actions" })),
    true,
  );
  await page.locator(".header-language select").selectOption("pt-BR");
  await menuButton.waitFor();
  assert.equal(await count("notes", "id", disney.id), 1);
  assert.equal(calls("delete_note").length, 0);
  pass(
    "English tooltip, menu and both confirmations follow the selected language; cancelling a note deletion changes nothing",
  );

  // Reduced motion disables the new transitions.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await trash(0).click();
  assert.equal(
    await dialog.evaluate((e) => getComputedStyle(e).animationName),
    "none",
  );
  assert.equal(
    await entries
      .first()
      .evaluate((e) => getComputedStyle(e).transitionDuration),
    "0s",
  );
  await page.keyboard.press("Escape");
  await page.emulateMedia({ reducedMotion: "no-preference" });

  // Scenario F for notes: failure keeps the note, its blocks and the route.
  await context.route("**/rest/v1/rpc/delete_note", (route) => route.abort());
  await menuButton.click();
  await menu.getByRole("menuitem", { name: "Excluir nota" }).click();
  await dialog.getByRole("button", { name: "Excluir nota" }).click();
  await dialog.waitFor({ state: "hidden" });
  await toast("Sem conexão com o servidor. Tente novamente.");
  await context.unroute("**/rest/v1/rpc/delete_note");
  assert.equal(page.url(), disneyUrl);
  assert.equal(await entries.count(), 1);
  assert.equal(await page.locator(".note-entry.deleting").count(), 0);
  assert.equal(await count("notes", "id", disney.id), 1);
  await dismiss();
  requests.length = 0;

  // Scenarios C, G and I: delete the note while a block has unsaved text.
  await menuButton.click();
  await menu.getByRole("menuitem", { name: "Excluir nota" }).click();
  await dialog
    .getByRole("heading", { name: "Excluir “Disney - Vagas”?" })
    .waitFor();
  await dialog
    .getByText(
      "Esta ação excluirá permanentemente esta nota, todos os seus blocos e arquivos anexados.",
    )
    .waitFor();
  assert.equal(
    await focused(dialog.getByRole("button", { name: "Cancelar" })),
    true,
  );
  await page.screenshot({
    path: `${shots}/05-confirm-note.png`,
    animations: "disabled",
  });
  await axe("note confirmation");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  const pendingBlock = ok(
    await api
      .from("note_entries")
      .select("id")
      .eq("note_id", disney.id)
      .single(),
  ).id;
  await delaySaves(pendingBlock, 1500);
  await entries.locator("textarea").fill("Edição em trânsito na nota excluída");
  await eventually(
    async () => calls("save_entry").some((r) => r.body.p_id === pendingBlock),
    "save in flight",
  );
  await menuButton.click();
  await menu.getByRole("menuitem", { name: "Excluir nota" }).click();
  await dialog.getByRole("button", { name: "Excluir nota" }).dblclick();
  await dialog.waitFor({ state: "hidden" });
  await page.waitForURL(`${root}/workspaces/${work.id}/notes/${neighbor.id}`);
  await toast("Nota excluída.");
  await page
    .getByRole("heading", { name: "Anthropic | Vagas", level: 2 })
    .waitFor();
  await eventually(async () => (await values()).join() === "Vizinho");
  assert.equal(
    await page.locator(".note-list-item").filter({ hasText: "Disney" }).count(),
    0,
  );
  assert.equal(await page.locator(".note-list-item.active").count(), 1);
  await pause(2500);
  await context.unroute("**/rest/v1/rpc/save_entry");
  assert.equal(calls("delete_note").length, 1, "one note deletion request");
  assert.equal(savesAfter("delete_note"), 0, "no save after the note deletion");
  assert.equal(await count("notes", "id", disney.id), 0);
  assert.equal(await count("note_entries", "note_id", disney.id), 0);
  assert.equal(await count("notes", "id", neighbor.id), 1);
  assert.equal(await count("note_entries", "note_id", neighbor.id), 1);
  assert.equal(await count("notes", "id", last.id), 1);
  await noSaveErrors();
  await page.locator(".toast").filter({ hasText: "Nota excluída." }).waitFor();
  await page.screenshot({
    path: `${shots}/06-after-note-deletion.png`,
    animations: "disabled",
  });
  await page.reload();
  await page
    .getByRole("heading", { name: "Anthropic | Vagas", level: 2 })
    .waitFor();
  assert.equal(
    await page.locator(".note-list-item").filter({ hasText: "Disney" }).count(),
    0,
  );
  pass(
    "Deleting a note with unsaved text removes it and its blocks with one request on double click, updates the list, selects the neighbouring note, issues no later save, ignores a save that was already in flight and survives reload; other notes untouched",
  );

  // Scenario H: the address of a deleted note, and Back, lead somewhere safe.
  await page.goto(disneyUrl);
  await toast("Esta nota não está mais disponível.");
  await page.waitForURL(`${root}/workspaces/${work.id}/notes`);
  await page
    .getByRole("heading", { name: "Seu conhecimento, bem guardado" })
    .waitFor();
  await page.goto(`${root}/workspaces/${work.id}/notes/not-a-note`);
  await page.waitForURL(`${root}/workspaces/${work.id}/notes`);
  await page
    .locator(".note-list-item")
    .filter({ hasText: "Anthropic" })
    .waitFor();
  pass(
    "Opening the address of a deleted or invalid note explains it is unavailable and replaces the route with the notes list",
  );

  // Scenario D: deleting the last note of a workspace.
  await page.goto(`${root}/workspaces/${solo.id}/notes/${last.id}`);
  await eventually(async () => (await entries.count()) === 1);
  await page.getByRole("button", { name: "Ações da nota" }).click();
  await page.getByRole("menuitem", { name: "Excluir nota" }).click();
  await dialog.getByRole("button", { name: "Excluir nota" }).click();
  await page.waitForURL(`${root}/workspaces/${solo.id}/notes`);
  await page
    .getByRole("heading", { name: "Seu conhecimento, bem guardado" })
    .waitFor();
  await page.getByText("Nenhuma nota encontrada.").waitFor();
  assert.equal(
    await page
      .locator(".note-content")
      .getByRole("button", { name: "Criar nota" })
      .count(),
    1,
  );
  assert.equal(await count("notes", "workspace_id", solo.id), 0);
  assert.equal(await count("workspaces", "id", solo.id), 1);
  assert.equal(await count("notes", "id", neighbor.id), 1);
  await page.screenshot({
    path: `${shots}/07-empty-workspace.png`,
    animations: "disabled",
  });
  await page
    .locator(".note-content")
    .getByRole("button", { name: "Criar nota" })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Título", { exact: true })
    .fill("Recomeço");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar", exact: true })
    .click();
  await page.getByRole("heading", { name: "Recomeço", level: 2 }).waitFor();
  pass(
    "Deleting the last note of a workspace shows the empty state with a working create action; the workspace and other workspaces' notes remain",
  );

  assert.deepEqual(errors, []);
  pass("No browser runtime errors during the deletion journeys");
} catch (e) {
  failure = e.stack || String(e);
  console.error(failure);
  await page
    .screenshot({ path: `${shots}/failure.png`, fullPage: true })
    .catch(() => {});
  process.exitCode = 1;
} finally {
  writeFileSync(
    "test-results/notes-deletion.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        passed: checks.length,
        checks,
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
