// End-to-end validation of the upload quarantine with a REAL ClamAV engine.
// Uses only the isolated local security stack (port 56431) and a disposable
// ClamAV container started from ops/clamav/docker-compose.yml on a test port.
// Needs Docker and network access for the signature update.
//
// The antivirus test file is created in memory and sent over loopback; it is
// never written to this machine's disk.
import { createClient } from "@supabase/supabase-js";
import { execFile, execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { securityStack } from "./security-stack.mjs";
import {
  scannerIdentity,
  scannerTarget,
  selfTest,
  testSignature,
} from "./clamav.mjs";

const PORT = "56310";
const state = securityStack();
const compose = (...args) =>
  execFileSync(
    "docker",
    [
      "compose",
      "-f",
      "ops/clamav/docker-compose.yml",
      "-p",
      "tasknado-clamav-test",
      ...args,
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CLAMD_PORT: PORT },
    },
  );
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(state.API_URL, state.SERVICE_ROLE_KEY, options);
const user = createClient(state.API_URL, state.ANON_KEY, options);
const other = createClient(state.API_URL, state.ANON_KEY, options);
const ok = (r) => {
  assert.equal(r.error, null, r.error?.message);
  return r.data;
};
const target = scannerTarget({ CLAMD_HOST: "127.0.0.1", CLAMD_PORT: PORT });
const worker = () =>
  new Promise((resolve) =>
    execFile(
      process.execPath,
      ["scripts/scan-uploads.mjs"],
      {
        env: {
          ...process.env,
          SUPABASE_URL: state.API_URL,
          TASKNADO_WORKER_TARGET: state.API_URL,
          SUPABASE_SERVICE_ROLE_KEY: state.SERVICE_ROLE_KEY,
          CLAMD_HOST: "127.0.0.1",
          CLAMD_PORT: PORT,
        },
      },
      (error, stdout) =>
        resolve({ status: error?.code ?? 0, report: JSON.parse(stdout) }),
    ),
  );

// Smallest useful Office document: enough structure for format inspection.
const docx = (extra = {}) =>
  zipSync({
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    "word/document.xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Tasknado</w:t></w:r></w:p></w:body></w:document>',
    ),
    ...extra,
  });
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const office =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const ids = [],
  paths = [];
try {
  compose("up", "-d");
  // First start: freshclam downloads the current signatures and clamd loads
  // them. Until that finishes the worker must refuse to approve anything.
  let identity;
  for (let attempt = 0; attempt < 90 && !identity; attempt++) {
    try {
      identity = await scannerIdentity(target, { maxSignatureAgeHours: 72 });
      await selfTest(target);
    } catch (error) {
      identity = undefined;
      if (attempt % 6 === 5)
        try {
          compose("exec", "-T", "clamav", "clamdscan", "--reload");
        } catch {}
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
  assert.ok(identity, "ClamAV daemon ready with signatures under 72 hours old");
  console.log(
    `PASS real ClamAV ${identity.engine} answers on loopback with signature database ${identity.signatures} (${identity.signatureAgeHours} h old) and detects the standard test file`,
  );

  for (const client of [user, other]) {
    const email = `clamav-${crypto.randomUUID()}@tasknado.test`,
      password = crypto.randomUUID() + "Aa!";
    const created = ok(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      }),
    ).user;
    ids.push(created.id);
    ok(await client.auth.signInWithPassword({ email, password }));
  }
  const workspace = ok(
    await user
      .from("workspaces")
      .insert({ name: "ClamAV validation" })
      .select()
      .single(),
  );
  const note = ok(
    await user
      .from("notes")
      .insert({ workspace_id: workspace.id, title: "fixtures" })
      .select()
      .single(),
  );
  const upload = async (name, bytes, mime) => {
    const id = crypto.randomUUID(),
      path = `${ids[0]}/${id}`;
    paths.push(path);
    ok(
      await user.from("attachments").insert({
        id,
        note_id: note.id,
        name,
        path,
        mime,
        size: bytes.length,
      }),
    );
    ok(
      await user.storage
        .from("attachments")
        .upload(path, bytes, { contentType: mime }),
    );
    return { id, path, bytes };
  };
  const statusOf = async (file) =>
    ok(
      await admin
        .from("attachments")
        .select("scan_status,content_sha256")
        .eq("id", file.id)
        .single(),
    );
  const readable = async (client, file) =>
    !(await client.storage.from("attachments").download(file.path)).error;

  const clean = {
    text: await upload("notes.txt", strToU8("plain notes"), "text/plain"),
    image: await upload("pixel.png", png, "image/png"),
    document: await upload("clean.docx", docx(), office),
  };
  const hostile = {
    // Passes format inspection (valid UTF-8 text / valid document structure):
    // only the antivirus engine can tell these apart from the clean ones.
    text: await upload("test-file.txt", testSignature(), "text/plain"),
    document: await upload(
      "carrier.docx",
      docx({ "word/media/attachment.bin": testSignature() }),
      office,
    ),
  };
  for (const file of [...Object.values(clean), ...Object.values(hostile)])
    assert.equal(await readable(user, file), false);

  const batch = await worker();
  assert.equal(batch.status, 0, JSON.stringify(batch.report));
  assert.deepEqual(
    {
      scanner: batch.report.scanner,
      scanned: batch.report.scanned,
      rejected: batch.report.rejected,
      retry: batch.report.retry,
    },
    { scanner: "ready", scanned: 5, rejected: 2, retry: 0 },
  );
  for (const file of Object.values(clean)) {
    const row = await statusOf(file);
    assert.equal(row.scan_status, "clean");
    assert.match(row.content_sha256, /^[0-9a-f]{64}$/);
    assert.equal(await readable(user, file), true);
    assert.equal(await readable(other, file), false);
  }
  for (const file of Object.values(hostile)) {
    assert.equal((await statusOf(file)).scan_status, "rejected");
    assert.equal(await readable(user, file), false);
    assert.ok(
      (await user.storage.from("attachments").createSignedUrl(file.path, 60))
        .error,
    );
  }
  console.log(
    "PASS real engine: clean text, image and Office document are released to their owner only; the test file is rejected as text and inside an Office archive, and neither can be downloaded or signed",
  );

  // Scanner outage: the daemon is stopped while a new upload is waiting.
  const waiting = await upload(
    "later.txt",
    strToU8("arrives during the outage"),
    "text/plain",
  );
  compose("stop");
  const outage = await worker();
  assert.equal(outage.status, 1);
  assert.deepEqual(outage.report, {
    event: "upload_scan_batch",
    scanner: "unavailable",
    reason: "scanner_unreachable",
  });
  assert.equal((await statusOf(waiting)).scan_status, "pending");
  assert.equal(await readable(user, waiting), false);
  console.log(
    "PASS with the ClamAV daemon stopped the worker approves nothing and the waiting upload stays quarantined and unreadable",
  );
} finally {
  if (paths.length) await admin.storage.from("attachments").remove(paths);
  for (const id of ids) await admin.auth.admin.deleteUser(id);
  // Removes only this test's container and signature volume.
  try {
    compose("down", "-v");
  } catch {}
}
