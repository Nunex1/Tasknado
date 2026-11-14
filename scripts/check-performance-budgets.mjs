// No telemetry: inspect the local production HTML and public build artifacts only.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { statSync, mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { createServer } from "node:net";
const listener = createServer();
await new Promise(r => listener.listen(0, "127.0.0.1", r));
const port = listener.address().port;
await new Promise(r => listener.close(r));
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { windowsHide: true, stdio: "pipe" });
let logs = "";
child.stdout.on("data", b => logs += b);
child.stderr.on("data", b => logs += b);
const root = `http://127.0.0.1:${port}`;
try {
  let response;
  for (let i = 0; i < 80; i++) {
    try { response = await fetch(root); if (response.ok) break; } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  assert.ok(response?.ok, logs);
  assert.match(response.headers.get("cache-control"), /private.*no-store/);
  const policy = response.headers.get("content-security-policy");
  assert.match(policy, /'nonce-/);
  assert.ok(!policy.includes("unsafe-eval"));
  const html = await response.text();
  const paths = [...new Set([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]))];
  assert.ok(paths.length);
  let javascript = 0, gzip = 0;
  for (const path of paths) {
    const asset = await fetch(new URL(path, root));
    assert.ok(asset.ok);
    assert.match(asset.headers.get("cache-control"), /public.*immutable/);
    const bytes = Buffer.from(await asset.arrayBuffer());
    javascript += bytes.length; gzip += gzipSync(bytes).length;
  }
  const symbol = statSync("src/assets/brand/symbol.webp").size;
  const mask = statSync("src/assets/brand/wordmark-mask.webp").size;
  const brand = await fetch(root + "/brand/favicon-32.png");
  assert.match(brand.headers.get("cache-control"), /public, max-age=86400/);
  // Budgets allow small framework changes while catching accidental eager loading.
  assert.ok(gzip <= 350_000, `Initial script gzip budget: ${gzip} > 350000`);
  assert.ok(javascript <= 1_050_000, `Initial script source budget: ${javascript} > 1050000`);
  assert.ok(symbol <= 65_000, `Symbol budget: ${symbol}`);
  assert.ok(mask <= 22_000, `Mask budget: ${mask}`);
  const result = { scope: "production HTML script references, gzip computed per script; not browser timing", scripts: paths.length, javascript, gzip, symbol, mask, security: "nonce CSP, private no-store HTML, immutable hashed scripts, public brand assets" };
  mkdirSync("test-results/performance", { recursive: true });
  writeFileSync("test-results/performance/budgets.json", JSON.stringify(result, null, 2));
  console.log("PASS performance budgets and HTTP security/cache categories", result);
} finally {
  child.kill();
}
