// Backup and recovery drill for attachment bytes, on the isolated security
// stack only (port 56431): export, offline verification, damage detection and
// recovery from an accidental deletion. Synthetic data; nothing leaves this
// machine and the temporary backup is removed at the end.
import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { securityStack } from "./security-stack.mjs";

const state = securityStack();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(state.API_URL, state.SERVICE_ROLE_KEY, options);
const user = createClient(state.API_URL, state.ANON_KEY, options);
const ok = (r) => {
  assert.equal(r.error, null, r.error?.message);
  return r.data;
};
const work = mkdtempSync(join(tmpdir(), "tasknado-backup-drill-"));
const keyFile = join(work, "backup.key");
const backup = (dir, ...args) =>
  new Promise((resolve) =>
    execFile(
      process.execPath,
      ["scripts/backup-storage.mjs", ...args],
      {
        env: {
          ...process.env,
          SUPABASE_URL: state.API_URL,
          TASKNADO_WORKER_TARGET: state.API_URL,
          SUPABASE_SERVICE_ROLE_KEY: state.SERVICE_ROLE_KEY,
          BACKUP_DIR: dir,
          BACKUP_KEY_FILE: keyFile,
        },
      },
      (error, stdout) =>
        resolve({
          status: error?.code ?? 0,
          report: stdout ? JSON.parse(stdout) : null,
        }),
    ),
  );
let userId;
const paths = [];
try {
  const email = `backup-${crypto.randomUUID()}@tasknado.test`,
    password = crypto.randomUUID() + "Aa!";
  userId = ok(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
  ).user.id;
  ok(await user.auth.signInWithPassword({ email, password }));
  const workspace = ok(
    await user
      .from("workspaces")
      .insert({ name: "Backup drill" })
      .select()
      .single(),
  );
  const note = ok(
    await user
      .from("notes")
      .insert({ workspace_id: workspace.id, title: "drill" })
      .select()
      .single(),
  );
  const contents = ["first private document", "second private document"];
  for (const content of contents) {
    const id = crypto.randomUUID(),
      path = `${userId}/${id}`;
    paths.push(path);
    ok(
      await user.from("attachments").insert({
        id,
        note_id: note.id,
        name: "drill.txt",
        path,
        mime: "text/plain",
        size: content.length,
      }),
    );
    ok(
      await user.storage
        .from("attachments")
        .upload(path, new TextEncoder().encode(content), {
          contentType: "text/plain",
        }),
    );
  }

  assert.equal((await backup(work, "keygen", keyFile)).status, 0);
  const dir = join(work, "copy");
  const exported = await backup(dir, "export");
  assert.equal(exported.status, 0, JSON.stringify(exported.report));
  assert.ok(exported.report.objects >= 2);
  assert.equal(exported.report.failed, 0);
  const files = readdirSync(dir);
  assert.equal(files.length, exported.report.objects + 1);
  for (const file of files) {
    // Neither names nor bytes reveal accounts or content.
    assert.doesNotMatch(file, /[0-9a-f]{8}-[0-9a-f]{4}-/);
    const raw = readFileSync(join(dir, file)).toString("latin1");
    assert.ok(!raw.includes("private document") && !raw.includes(userId));
  }
  assert.doesNotMatch(JSON.stringify(exported.report), new RegExp(userId));
  console.log(
    `PASS export wrote ${exported.report.objects} encrypted objects and an encrypted manifest; names and bytes disclose no identifier or content`,
  );

  const verified = await backup(dir, "verify");
  assert.equal(verified.status, 0);
  assert.equal(verified.report.damaged, 0);
  // One flipped bit anywhere in an object is detected offline.
  const victim = join(
    dir,
    files.find((file) => file.endsWith(".bin")),
  );
  const original = readFileSync(victim);
  const flipped = Buffer.from(original);
  flipped[flipped.length - 20] ^= 1;
  writeFileSync(victim, flipped);
  const damaged = await backup(dir, "verify");
  assert.equal(damaged.status, 1);
  assert.equal(damaged.report.damaged, 1);
  writeFileSync(victim, original);
  // A different key opens nothing.
  const otherKey = join(work, "other.key");
  assert.equal((await backup(work, "keygen", otherKey)).status, 0);
  const wrong = await new Promise((resolve) =>
    execFile(
      process.execPath,
      ["scripts/backup-storage.mjs", "verify"],
      { env: { ...process.env, BACKUP_DIR: dir, BACKUP_KEY_FILE: otherKey } },
      (error) => resolve(error?.code ?? 0),
    ),
  );
  assert.notEqual(wrong, 0);
  console.log(
    "PASS offline verification accepts the intact backup, detects a single flipped bit and refuses a different key",
  );

  // Accidental deletion of one object, then recovery from the backup.
  ok(await admin.storage.from("attachments").remove([paths[0]]));
  assert.ok((await admin.storage.from("attachments").download(paths[0])).error);
  const restored = await backup(dir, "restore");
  assert.equal(restored.status, 0, JSON.stringify(restored.report));
  assert.equal(restored.report.restored, 1);
  assert.equal(restored.report.existing, restored.report.objects - 1);
  for (const [index, path] of paths.entries())
    assert.equal(
      await ok(await admin.storage.from("attachments").download(path)).text(),
      contents[index],
    );
  const again = await backup(dir, "restore");
  assert.equal(again.report.restored, 0);
  assert.equal(again.status, 0);
  // Restored bytes stay behind the quarantine: still unreadable to the owner.
  assert.ok((await user.storage.from("attachments").download(paths[0])).error);
  console.log(
    "PASS a deleted object is recovered byte for byte, existing objects are never overwritten, a repeated restore changes nothing and quarantine still applies",
  );
} finally {
  if (paths.length) await admin.storage.from("attachments").remove(paths);
  if (userId) await admin.auth.admin.deleteUser(userId);
  rmSync(work, { recursive: true, force: true });
}
