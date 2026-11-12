import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    join(
      homedir(),
      ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
    ),
);
const root = "http://127.0.0.1:3400";
const browser = await chromium.launch({ headless: true, channel: "msedge" });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const first = await page.goto(root);
  await page.getByRole("button", { name: "Entrar na minha conta" }).waitFor();
  const policy = first.headers()["content-security-policy"];
  const nonce = policy.match(/'nonce-([^']+)'/)[1];
  assert.ok(nonce.length > 20);
  assert.ok(!policy.includes("unsafe-eval"));
  assert.equal(
    first.headers()["strict-transport-security"],
    "max-age=31536000",
  );
  assert.match(first.headers()["cache-control"], /no-store/);
  const scripts = await page
    .locator("script")
    .evaluateAll((items) =>
      items
        .filter((s) => !s.type || s.type.includes("javascript"))
        .map((s) => s.nonce),
    );
  assert.ok(scripts.length > 0);
  assert.ok(scripts.every((value) => value === nonce));
  // The theme bootstrap must run before hydration, under the same nonce.
  const themeContext = await browser.newContext();
  await themeContext.addInitScript(() => localStorage.setItem("tasknado.theme", "dark"));
  await themeContext.route("**/_next/static/**/*.js", (route) => route.abort());
  const themePage = await themeContext.newPage();
  await themePage.goto(root, { waitUntil: "domcontentloaded" });
  assert.equal(await themePage.locator("html").getAttribute("data-theme"), "dark");
  await themeContext.close();
  // Parser-inserted untrusted HTML models an injection. DevTools evaluation is
  // privileged and is not a faithful attacker context for CSP enforcement.
  await page.route(root + "/", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()).replace(
        "</body>",
        "<script>window.__cspInjected = true</script></body>",
      ),
    });
  });
  await page.goto(root);
  assert.equal(await page.evaluate(() => window.__cspInjected), undefined);
  await page.unroute(root + "/");
  const second = await page.reload();
  assert.notEqual(
    second.headers()["content-security-policy"].match(/'nonce-([^']+)'/)[1],
    nonce,
  );
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await page.getByRole("heading", { name: "Crie sua conta" }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS production browser hydrates, navigation works, script nonces match, nonces rotate and untrusted inline script is blocked",
  );
} finally {
  await browser.close();
}
