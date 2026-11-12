// Only the separate tasknado_security local stack, never production or tasknado.
import { createClient } from "@supabase/supabase-js";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { resizeReservation } from "./upload-reservations.mjs";
const cli = createRequire(import.meta.url).resolve("supabase/dist/supabase.js");
const state = JSON.parse(
  execFileSync(process.execPath, [cli, "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }),
);
assert.equal(
  state.API_URL,
  "http://127.0.0.1:56431",
  "dedicated isolated stack required",
);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(state.API_URL, state.SERVICE_ROLE_KEY, options);
const first = createClient(state.API_URL, state.ANON_KEY, options);
const second = createClient(state.API_URL, state.ANON_KEY, options);
const anon = createClient(state.API_URL, state.ANON_KEY, options);
const ok = (r) => {
  assert.equal(r.error, null, r.error?.message);
  return r.data;
};
const ids = [],
  paths = [];
try {
  for (const client of [first, second]) {
    const email = `security-${crypto.randomUUID()}@tasknado.test`,
      password = crypto.randomUUID() + "Aa!";
    const user = ok(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      }),
    ).user;
    ids.push(user.id);
    ok(await client.auth.signInWithPassword({ email, password }));
  }
  const workspace = ok(
    await first
      .from("workspaces")
      .insert({ name: "Security isolated fixture" })
      .select()
      .single(),
  );
  const note = ok(
    await first
      .from("notes")
      .insert({ workspace_id: workspace.id, title: "fixture" })
      .select()
      .single(),
  );
  assert.deepEqual(
    ok(await second.from("notes").select("id").eq("id", note.id)),
    [],
  );
  assert.ok(
    (
      await anon
        .from("notes")
        .insert({ workspace_id: workspace.id, title: "denied" })
    ).error,
  );
  assert.ok((await second.rpc("delete_note", { p_note: note.id })).error);
  console.log(
    "PASS real HTTP rejects anonymous writes and cross-owner reads/deletes",
  );
  const id = crypto.randomUUID(),
    path = `${ids[0]}/${id}`;
  paths.push(path);
  ok(
    await first.from("attachments").insert({
      id,
      note_id: note.id,
      name: "safe.txt",
      path,
      mime: "text/plain",
      size: 5,
    }),
  );
  ok(
    await first.storage
      .from("attachments")
      .upload(path, new TextEncoder().encode("hello"), {
        contentType: "text/plain",
        upsert: false,
      }),
  );
  assert.ok((await first.storage.from("attachments").download(path)).error);
  assert.ok(
    (await first.storage.from("attachments").createSignedUrl(path, 60)).error,
  );
  assert.ok((await second.storage.from("attachments").download(path)).error);
  assert.ok(
    (
      await first
        .from("attachments")
        .update({ scan_status: "clean" })
        .eq("id", id)
    ).error,
  );
  console.log(
    "PASS pending bytes cannot be downloaded/signed, including by owner; client cannot forge scan verdict",
  );
  // Trusted test fixture only: not a substitute for real malware scanning.
  ok(
    await admin
      .from("attachments")
      .update({ scan_status: "clean" })
      .eq("id", id),
  );
  assert.equal(
    await ok(await first.storage.from("attachments").download(path)).text(),
    "hello",
  );
  const signed = ok(
    await first.storage.from("attachments").createSignedUrl(path, 60),
  );
  assert.equal((await fetch(signed.signedUrl)).status, 200);
  assert.ok(
    (await second.storage.from("attachments").createSignedUrl(path, 60)).error,
  );
  assert.ok(
    (
      await first.storage
        .from("attachments")
        .upload(path, new TextEncoder().encode("other"), {
          contentType: "text/plain",
          upsert: true,
        })
    ).error,
  );
  await first.storage.from("attachments").remove([path]);
  assert.equal(
    await ok(await first.storage.from("attachments").download(path)).text(),
    "hello",
  );
  ok(await first.from("attachments").delete().eq("id", id));
  assert.ok((await first.storage.from("attachments").download(path)).error);
  assert.ok(
    (
      await first.from("attachments").insert({
        id,
        note_id: note.id,
        name: "replacement.txt",
        path,
        mime: "text/plain",
        size: 5,
      })
    ).error,
  );
  console.log(
    "PASS clean owner download works; replacement, cross-owner signing and deleted-path reuse are denied",
  );
  console.log(
    `INFO pre-issued signed URL after metadata deletion returned HTTP ${(await fetch(signed.signedUrl)).status}; expiry remains 60 seconds`,
  );
  const cleanup = spawnSync(process.execPath, ["scripts/cleanup-storage.mjs"], {
    encoding: "utf8",
    env: {
      ...process.env,
      SUPABASE_URL: state.API_URL,
      TASKNADO_WORKER_TARGET: state.API_URL,
      SUPABASE_SERVICE_ROLE_KEY: state.SERVICE_ROLE_KEY,
    },
  });
  assert.equal(cleanup.status, 0);
  ok(await resizeReservation(admin, path, 5)); // scanner finishing after cleanup
  assert.equal(
    ok(
      await admin
        .from("attachment_paths")
        .select("reserved_bytes")
        .eq("path", path)
        .single(),
    ).reserved_bytes,
    0,
  );
  console.log(
    "PASS physical cleanup releases quota and a late scanner cannot resurrect the charge",
  );
  const expired = await fetch(`${state.API_URL}/rest/v1/notes?select=id`, {
    headers: { apikey: state.ANON_KEY, Authorization: "Bearer invalid-token" },
  });
  assert.equal(expired.status, 401);
  const session = ok(await first.auth.getSession()).session;
  ok(await first.auth.signOut({ scope: "global" }));
  assert.ok(
    (await first.auth.refreshSession({ refresh_token: session.refresh_token }))
      .error,
  );
  console.log(
    "PASS invalid JWT rejected and global logout revokes refresh token",
  );

  // Ten abandoned uploads must not monopolize all worker slots. The scanner
  // executable is deliberately invalid: this also tests fail-closed behavior.
  const abandoned = [];
  for (let i = 0; i < 10; i++) {
    const id = crypto.randomUUID();
    abandoned.push({
      id,
      note_id: note.id,
      name: `missing-${i}.txt`,
      path: `${ids[0]}/${id}`,
      mime: "text/plain",
      size: 5,
      owner_id: ids[0],
    });
  }
  ok(await admin.from("attachments").insert(abandoned));
  const otherWorkspace = ok(
    await second
      .from("workspaces")
      .insert({ name: "fair queue" })
      .select()
      .single(),
  );
  const otherNote = ok(
    await second
      .from("notes")
      .insert({ workspace_id: otherWorkspace.id, title: "fair" })
      .select()
      .single(),
  );
  const validId = crypto.randomUUID(),
    validPath = `${ids[1]}/${validId}`;
  paths.push(validPath);
  ok(
    await second.from("attachments").insert({
      id: validId,
      note_id: otherNote.id,
      name: "valid.txt",
      path: validPath,
      mime: "text/plain",
      size: 5,
    }),
  );
  ok(
    await second.storage
      .from("attachments")
      .upload(validPath, new TextEncoder().encode("hello"), {
        contentType: "text/plain",
      }),
  );
  const runWorker = () =>
    spawnSync(process.execPath, ["scripts/scan-uploads.mjs"], {
      encoding: "utf8",
      env: {
        ...process.env,
        SUPABASE_URL: state.API_URL,
        TASKNADO_WORKER_TARGET: state.API_URL,
        SUPABASE_SERVICE_ROLE_KEY: state.SERVICE_ROLE_KEY,
        CLAMSCAN_PATH: process.execPath,
      },
    });
  const missingBatch = runWorker();
  assert.equal(missingBatch.status, 1);
  assert.equal(JSON.parse(missingBatch.stdout).retry, 10);
  const eligible = ok(
    await admin
      .from("attachments")
      .select("id")
      .eq("scan_status", "pending")
      .lte("next_scan_at", new Date().toISOString()),
  );
  assert.deepEqual(
    eligible.map((r) => r.id),
    [validId],
  );
  const scannerFailure = runWorker();
  assert.equal(scannerFailure.status, 1);
  assert.equal(JSON.parse(scannerFailure.stdout).retry, 1);
  assert.equal(
    ok(
      await admin
        .from("attachments")
        .select("scan_status")
        .eq("id", validId)
        .single(),
    ).scan_status,
    "pending",
  );
  assert.ok(
    (await second.storage.from("attachments").download(validPath)).error,
  );
  console.log(
    "PASS ten missing objects back off, another account reaches scanner, and scanner failure keeps bytes quarantined",
  );
} finally {
  if (paths.length) ok(await admin.storage.from("attachments").remove(paths));
  for (const id of ids) ok(await admin.auth.admin.deleteUser(id));
}
