// Compare the actual old/new client algorithms against identical real local rows.
// An explicit 100 ms transport delay models a higher-latency connection.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";
const require = createRequire(import.meta.url);
const state = JSON.parse(
  execFileSync(
    process.execPath,
    [require.resolve("supabase/dist/supabase.js"), "status", "-o", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ),
);
assert.equal(state.API_URL, "http://127.0.0.1:55431");
const ok = (r) => {
  assert.ifError(r.error);
  return r.data;
};
const admin = createClient(state.API_URL, state.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let active = 0,
  max = 0,
  calls = 0;
const db = createClient(state.API_URL, state.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: async (...args) => {
      calls++;
      max = Math.max(max, ++active);
      try {
        await new Promise((r) => setTimeout(r, 100));
        return await fetch(...args);
      } finally {
        active--;
      }
    },
  },
});
const baseline = "44633c6";
const temporary = [];
async function moduleFrom(source, label) {
  // Substitute only the shared response checker; algorithms remain unchanged.
  const local = source.replace(
    'import { check } from "./supabase";',
    "function check(r) { if(r.error) throw new Error(r.error.message); return r.data; }",
  );
  const output = ts.transpileModule(local, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const path = resolve(
    `node_modules/.cache/export-${label}-${crypto.randomUUID()}.mjs`,
  );
  mkdirSync(resolve("node_modules/.cache"), { recursive: true });
  writeFileSync(path, output);
  temporary.push(path);
  return import(pathToFileURL(path).href);
}
const old = await moduleFrom(
  execFileSync("git", ["show", `${baseline}:src/lib/export-data.ts`], {
    encoding: "utf8",
  }),
  "before",
);
const current = await moduleFrom(
  readFileSync("src/lib/export-data.ts", "utf8"),
  "after",
);
let owner;
try {
  const email = `performance-export-${crypto.randomUUID()}@tasknado.test`,
    password = crypto.randomUUID() + "Aa!";
  owner = ok(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
  ).user.id;
  const w = ok(
    await admin
      .from("workspaces")
      .insert({ owner_id: owner, name: "Export benchmark" })
      .select("id")
      .single(),
  );
  for (let page = 0; page < 3; page++)
    ok(
      await admin.from("activities").insert(
        Array.from({ length: page === 2 ? 1 : 500 }, (_, i) => ({
          owner_id: owner,
          workspace_id: w.id,
          title: `Task ${page * 500 + i}`,
        })),
      ),
    );
  const note = ok(
    await admin
      .from("notes")
      .insert({ owner_id: owner, workspace_id: w.id, title: "Export notes" })
      .select("id")
      .single(),
  );
  ok(
    await admin.from("note_entries").insert(
      Array.from({ length: 50 }, () => ({
        owner_id: owner,
        note_id: note.id,
        content: "Long note ".repeat(2000),
      })),
    ),
  );
  ok(await db.auth.signInWithPassword({ email, password }));
  calls = 0;
  max = 0;
  let start = performance.now();
  const before = await old.exportUserData(db);
  const beforeMetrics = {
    ms: Math.round(performance.now() - start),
    requests: calls,
    maxInFlight: max,
  };
  calls = 0;
  max = 0;
  start = performance.now();
  const blob = await current.exportUserDataBlob(db);
  const afterMetrics = {
    ms: Math.round(performance.now() - start),
    requests: calls,
    maxInFlight: max,
    bytes: blob.size,
  };
  const after = JSON.parse(await blob.text());
  for (const table of Object.keys(before))
    assert.deepEqual(
      before[table].map(({ search_document, ...row }) => row),
      after[table],
      table,
    );
  assert.equal(after.activities.length, 1001);
  assert.equal(after.note_entries.length, 50);
  assert.ok(beforeMetrics.maxInFlight === 1 && afterMetrics.maxInFlight <= 3);
  const report = {
    baseline,
    environment:
      "same migrated loopback Supabase; Node client; 100 ms added before every real request; one sample, not field latency",
    before: beforeMetrics,
    after: afterMetrics,
    rows: Object.fromEntries(
      Object.entries(after).map(([key, rows]) => [key, rows.length]),
    ),
    integrity:
      "Every exported row and field equals the sequential baseline, excluding derived search_document",
  };
  mkdirSync("test-results/performance", { recursive: true });
  writeFileSync(
    "test-results/performance/export.json",
    JSON.stringify(report, null, 2),
  );
  console.log("PASS export comparison", beforeMetrics, afterMetrics);
} finally {
  if (owner) ok(await admin.auth.admin.deleteUser(owner));
  for (const path of temporary) unlinkSync(path);
}
