// Only the separate tasknado_security local stack, never production or tasknado.
import { createClient } from "@supabase/supabase-js";
import { execFile, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import assert from "node:assert/strict";
import { resizeReservation } from "./upload-reservations.mjs";
import { testSignature } from "./clamav.mjs";
import { securityStack } from "./security-stack.mjs";
// Throws unless the stack answering is the isolated one on port 56431.
const state = securityStack();
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

  // Worker runs against a loopback stand-in for clamd, so this suite does not
  // depend on antivirus signatures. It answers like the daemon: the standard
  // test signature is FOUND, everything else is OK. The real engine is
  // exercised by scripts/test-security-clamav.mjs.
  const fakeDaemon = async (mode) => {
    const server = createServer((socket) => {
      let buffer = Buffer.alloc(0);
      socket.on("error", () => {});
      socket.on("data", (data) => {
        buffer = Buffer.concat([buffer, data]);
        const end = buffer.indexOf(0);
        if (end < 0) return;
        const command = buffer.subarray(1, end).toString();
        if (command === "VERSION") {
          const stamp = new Date().toUTCString().split(" ");
          return socket.end(
            `ClamAV 1.5.4/28182/${stamp[0].slice(0, 3)} ${stamp[2]} ${stamp[1].padStart(2)} ${stamp[4]} ${stamp[3]}\0`,
          );
        }
        // INSTREAM: wait for the zero-length terminator chunk.
        const parts = [];
        let offset = end + 1;
        for (;;) {
          if (buffer.length < offset + 4) return;
          const length = buffer.readUInt32BE(offset);
          offset += 4;
          if (length === 0) break;
          if (buffer.length < offset + length) return;
          parts.push(buffer.subarray(offset, offset + length));
          offset += length;
        }
        const infected =
          mode === "detects" && Buffer.concat(parts).equals(testSignature());
        socket.end(
          infected ? "stream: Eicar-Test-Signature FOUND\0" : "stream: OK\0",
        );
      });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    return server;
  };
  const runWorker = async (port, extra = {}) => {
    const result = await new Promise((resolve) =>
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
            CLAMD_PORT: String(port),
            CLAMD_TIMEOUT_MS: "5000",
            ...extra,
          },
        },
        (error, stdout) => resolve({ status: error?.code ?? 0, stdout }),
      ),
    );
    return { status: result.status, report: JSON.parse(result.stdout) };
  };
  const statusOf = async (id) =>
    ok(
      await admin
        .from("attachments")
        .select("scan_status")
        .eq("id", id)
        .single(),
    ).scan_status;
  const eligible = async () =>
    ok(
      await admin
        .from("attachments")
        .select("id")
        .eq("scan_status", "pending")
        .lte("next_scan_at", new Date().toISOString()),
    ).map((r) => r.id);

  // Ten abandoned uploads must not monopolize all worker slots.
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
  const upload = async (name, bytes, mime = "text/plain") => {
    const id = crypto.randomUUID(),
      path = `${ids[1]}/${id}`;
    paths.push(path);
    ok(
      await second.from("attachments").insert({
        id,
        note_id: otherNote.id,
        name,
        path,
        mime,
        size: bytes.length,
      }),
    );
    ok(
      await second.storage
        .from("attachments")
        .upload(path, bytes, { contentType: mime }),
    );
    return { id, path };
  };
  const valid = await upload("valid.txt", new TextEncoder().encode("hello"));
  const detecting = await fakeDaemon("detects");
  const working = detecting.address().port;
  try {
    const missingBatch = await runWorker(working);
    assert.equal(missingBatch.status, 1);
    assert.equal(missingBatch.report.retry, 10);
    assert.equal(missingBatch.report.scanned, 0);
    assert.deepEqual(await eligible(), [valid.id]);
    console.log(
      "PASS ten missing objects back off and leave the next account's upload first in line",
    );

    // Scanner failures: nothing is read, nothing is approved, nothing is delayed.
    const approving = await fakeDaemon("approves-everything");
    const closed = await fakeDaemon("detects");
    const closedPort = closed.address().port;
    await new Promise((resolve) => closed.close(resolve));
    const failures = [
      [closedPort, {}, "scanner_unreachable"],
      [approving.address().port, {}, "scanner_self_test_failed"],
      [working, { CLAMD_PORT: "" }, "scanner_not_configured"],
      [
        working,
        { CLAMD_HOST: "scanner.example" },
        "scanner_network_not_trusted",
      ],
    ];
    for (const [port, extra, expected] of failures) {
      const outcome = await runWorker(port, extra);
      assert.equal(outcome.status, 1, expected);
      assert.deepEqual(
        outcome.report,
        {
          event: "upload_scan_batch",
          scanner: "unavailable",
          reason: expected,
        },
        expected,
      );
      assert.equal(await statusOf(valid.id), "pending");
      assert.deepEqual(await eligible(), [valid.id]);
    }
    approving.close();
    assert.ok(
      (await second.storage.from("attachments").download(valid.path)).error,
    );
    console.log(
      "PASS unreachable, approve-everything, unconfigured and untrusted-network scanners keep bytes quarantined and unreadable",
    );

    // A mismatched signature and the antivirus test file are rejected; only
    // the inspected clean file becomes readable, and only for its owner.
    const png = await upload(
      "fake.png",
      new TextEncoder().encode("not an image"),
      "image/png",
    );
    const infected = await upload("eicar.txt", testSignature());
    // One upload whose bytes never arrived, already older than a day.
    ok(
      await admin
        .from("attachments")
        .update({
          created_at: new Date(Date.now() - 25 * 3600000).toISOString(),
          next_scan_at: new Date().toISOString(),
        })
        .eq("id", abandoned[0].id),
    );
    const batch = await runWorker(working);
    assert.deepEqual(
      {
        scanned: batch.report.scanned,
        rejected: batch.report.rejected,
        abandoned: batch.report.abandoned,
        retry: batch.report.retry,
        scanner: batch.report.scanner,
      },
      { scanned: 4, rejected: 3, abandoned: 1, retry: 0, scanner: "ready" },
    );
    assert.equal(batch.status, 0);
    assert.equal(await statusOf(valid.id), "clean");
    assert.equal(await statusOf(png.id), "rejected");
    assert.equal(await statusOf(infected.id), "rejected");
    assert.equal(await statusOf(abandoned[0].id), "rejected");
    assert.equal(await statusOf(abandoned[1].id), "pending");
    assert.equal(
      await ok(
        await second.storage.from("attachments").download(valid.path),
      ).text(),
      "hello",
    );
    for (const blocked of [png, infected])
      assert.ok(
        (await second.storage.from("attachments").download(blocked.path)).error,
      );
    assert.ok(
      (await anon.storage.from("attachments").download(valid.path)).error,
    );
    assert.equal(
      ok(
        await admin
          .from("attachment_paths")
          .select("reserved_bytes")
          .eq("path", valid.path)
          .single(),
      ).reserved_bytes,
      5,
    );
    // The report carries counters and scanner identity, never file details.
    assert.doesNotMatch(
      JSON.stringify(batch.report),
      /valid|eicar|fake\.png|[0-9a-f]{8}-[0-9a-f]{4}-/,
    );
    console.log(
      "PASS with a detecting scanner: clean file released to its owner with its real size reserved; spoofed type, antivirus test file and day-old missing upload rejected",
    );
  } finally {
    detecting.close();
  }

  // Account limits and operational metrics through the real HTTP API.
  const flood = await second
    .from("workspaces")
    .insert(Array.from({ length: 250 }, (_, i) => ({ name: `flood ${i}` })));
  assert.match(flood.error?.message ?? "", /Account limit reached/);
  assert.equal(
    ok(await second.from("workspaces").select("id")).length,
    1,
    "the refused bulk insert left nothing behind",
  );
  for (const client of [anon, second])
    assert.ok((await client.rpc("security_metrics")).error);
  const metrics = ok(await admin.rpc("security_metrics"));
  assert.ok(metrics.uploads_pending >= 9 && metrics.uploads_rejected_24h >= 3);
  assert.ok(metrics.database_bytes > 0 && metrics.accounts >= 2);
  const health = await new Promise((resolve) =>
    execFile(
      process.execPath,
      ["scripts/security-health.mjs"],
      {
        env: {
          ...process.env,
          SUPABASE_URL: state.API_URL,
          TASKNADO_WORKER_TARGET: state.API_URL,
          SUPABASE_SERVICE_ROLE_KEY: state.SERVICE_ROLE_KEY,
          CLAMD_HOST: "",
          CLAMD_PORT: "",
        },
      },
      (error, stdout) => resolve({ status: error?.code ?? 0, stdout }),
    ),
  );
  const healthReport = JSON.parse(health.stdout);
  assert.equal(healthReport.event, "security_health");
  assert.equal(healthReport.unavailable, false);
  assert.equal(healthReport.metrics.uploads_pending, metrics.uploads_pending);
  console.log(
    "PASS bulk insert beyond the account ceiling is refused atomically; metrics are service-role only and feed the health check",
  );
} finally {
  if (paths.length) ok(await admin.storage.from("attachments").remove(paths));
  for (const id of ids) ok(await admin.auth.admin.deleteUser(id));
}
