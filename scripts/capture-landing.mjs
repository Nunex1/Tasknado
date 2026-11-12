// Captures the landing page screenshots from the running application.
//
//   pnpm local:setup && pnpm dev      (in another terminal)
//   pnpm capture:landing
//
// For each interface language a temporary account is created on the local
// Supabase stack, filled with the demonstration content in demo-data.mjs,
// photographed and deleted. Nothing is drawn or mocked: the images are the
// application as it renders, once in each theme.
// Output: src/assets/landing/<name>.<locale>.webp and <name>.<locale>.dark.webp
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
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
// sharp ships with Next.js; it converts the PNG captures to WebP.
const sharp = createRequire(require.resolve("next/package.json"))("sharp");
const cli = require.resolve("supabase/dist/supabase.js");
const state = JSON.parse(
  execFileSync(process.execPath, [cli, "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }),
);
assert.equal(state.API_URL, "http://127.0.0.1:55431");
const root = process.env.TASKNADO_TEST_URL || "http://127.0.0.1:3000";
const out = process.env.TASKNADO_CAPTURE_DIR || "src/assets/landing";
mkdirSync(out, { recursive: true });
const ok = (result) => {
  assert.ifError(result.error);
  return result.data;
};
const admin = createClient(state.API_URL, state.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const labels = {
  "pt-BR": { email: "E-mail", password: "Senha", collapse: "Recolher painel" },
  "en-US": { email: "Email", password: "Password", collapse: "Collapse panel" },
};
const browser = await chromium.launch({ headless: true, channel: "msedge" });
let failed = false;
for (const locale of ["pt-BR", "en-US"]) {
  const email = `landing-${locale.toLowerCase()}-${Date.now()}@tasknado.test`;
  const password = `Demo-${crypto.randomUUID()}!`;
  const user = ok(
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: demoName(locale),
        preferred_language: locale,
        avatar_color: "#2563eb",
      },
    }),
  ).user;
  try {
    const api = createClient(state.API_URL, state.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    ok(await api.auth.signInWithPassword({ email, password }));
    const demo = await seedDemo(api, locale);
    const work = demo.workspaces.work.id;
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        colorScheme: theme,
        deviceScaleFactor: 2,
        timezoneId: "America/Sao_Paulo",
        locale,
        reducedMotion: "reduce",
      });
      // The guest language decides how the access form is labelled.
      await context.addInitScript((value) => {
        localStorage.setItem("tasknado.locale", value);
      }, locale);
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      await page.goto(root);
      await page.getByLabel(labels[locale].email, { exact: true }).fill(email);
      await page
        .getByLabel(labels[locale].password, { exact: true })
        .fill(password);
      await page.locator("form button").click();
      await page.locator(".global-header").waitFor();

      async function save(name, clip) {
        const png = await page.screenshot({ clip, animations: "disabled" });
        const file = join(
          out,
          `${name}.${locale}${theme === "dark" ? ".dark" : ""}.webp`,
        );
        await sharp(png).webp({ quality: 86, effort: 6 }).toFile(file);
        console.log("saved", file);
      }
      /** The element plus a margin of page background around it. */
      async function around(selector, margin = 24, maxHeight = 760) {
        const target = page.locator(selector).first();
        await target.waitFor();
        await target.scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollTo(0, 0));
        const box = await target.boundingBox();
        const view = page.viewportSize();
        const x = Math.max(0, box.x - margin);
        const y = Math.max(0, box.y - margin);
        return {
          x,
          y,
          width: Math.min(view.width - x, box.width + margin * 2),
          height: Math.min(maxHeight, box.height + margin * 2, view.height - y),
        };
      }
      async function settle() {
        await page.waitForLoadState("networkidle");
        await page.evaluate(() => document.fonts.ready);
      }

      // Overview: the whole window, as a visitor would first see the product.
      await page.locator(".stats-grid").waitFor();
      await page.locator(".focus-row").first().waitFor();
      await settle();
      await save("overview", { x: 0, y: 0, width: 1440, height: 900 });

      // Feature crops use a narrower window so the interface stays legible
      // when the image is shown at half the page width.
      await page.setViewportSize({ width: 1180, height: 1000 });
      await page.goto(`${root}/workspaces`);
      await page.locator(".workspace-directory-row").first().waitFor();
      await settle();
      await save("workspaces", await around(".main-content", 0, 600));

      await page.goto(
        `${root}/workspaces/${work}/activities/${demo.activities.signup.id}`,
      );
      await page.getByRole("button", { name: labels[locale].collapse }).click();
      await page.locator(".timeline-item").nth(3).waitFor();
      await settle();
      await save("task", await around(".thread", 24, 640));

      await page.goto(`${root}/workspaces/${work}/matrix`);
      await page.locator(".matrix-card").first().waitFor();
      await settle();
      await save("matrix", await around(".matrix-grid", 24, 720));

      await page.goto(`${root}/workspaces/${work}/notes/${demo.note.id}`);
      await page.locator(".note-entry").nth(1).waitFor();
      await settle();
      await save("notes", await around(".notes-layout", 24, 640));

      await page.goto(`${root}/workspaces/${work}/history`);
      await page.locator(".record").nth(5).waitFor();
      await settle();
      await save("history", await around(".records-section", 24, 640));
      await context.close();
    }
  } catch (error) {
    failed = true;
    console.error(error.stack || String(error));
  } finally {
    ok(await admin.auth.admin.deleteUser(user.id));
  }
}
await browser.close();
if (failed) process.exitCode = 1;
