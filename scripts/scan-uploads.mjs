// Trusted backend worker: inspects quarantined uploads and publishes verdicts.
// Run only with server-side credentials. A file becomes readable only after
// format inspection AND a ClamAV daemon that proved detection in this same run
// both accept its bytes. Every failure leaves the file in quarantine.
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { inspectContent } from "./upload-content.mjs";
import { resizeReservation } from "./upload-reservations.mjs";
import {
  scanBytes,
  scannerIdentity,
  scannerTarget,
  selfTest,
} from "./clamav.mjs";

const BATCH = 10;
const RETRY_MS = 5 * 60 * 1000;
// A reservation whose bytes never arrived stops being retried after a day.
const ABANDONED_MS = 24 * 60 * 60 * 1000;

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TASKNADO_WORKER_TARGET } =
  process.env;
if (
  !SUPABASE_URL ||
  SUPABASE_URL !== TASKNADO_WORKER_TARGET ||
  !SUPABASE_SERVICE_ROLE_KEY
) {
  throw Error(
    "Set explicit worker target and server credentials; uploads remain quarantined.",
  );
}
const url = new URL(SUPABASE_URL);
if (
  url.protocol !== "https:" &&
  !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
)
  throw Error("HTTPS required");
const maxSignatureAgeHours = Number(
  process.env.CLAMAV_MAX_SIGNATURE_AGE_HOURS ?? 72,
);
if (!(maxSignatureAgeHours > 0 && maxSignatureAgeHours <= 24 * 30))
  throw Error("CLAMAV_MAX_SIGNATURE_AGE_HOURS must be between 1 and 720");

// Counters and fixed reason codes only: no file names, paths, owners or bytes.
const report = (fields) =>
  console.log(JSON.stringify({ event: "upload_scan_batch", ...fields }));
const reason = (error) =>
  error instanceof Error && /^(scanner|signatures)_[a-z_]+$/.test(error.message)
    ? error.message
    : "scanner_error";

// Nothing is read or approved unless the scanner is ClamAV, has recent
// signatures and detects the standard test signature right now.
async function scanner() {
  try {
    const target = scannerTarget(process.env);
    const identity = await scannerIdentity(target, { maxSignatureAgeHours });
    await selfTest(target);
    return { target, identity };
  } catch (error) {
    report({ scanner: "unavailable", reason: reason(error) });
    return null;
  }
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ok = (r) => {
  if (r.error) throw Error("storage_or_database_failure");
  return r.data;
};
const missing = (error) =>
  Number(error?.status ?? error?.statusCode) === 404 ||
  /not.?found/i.test(String(error?.message ?? ""));

async function queue() {
  try {
    return ok(
      await db
        .from("attachments")
        .select("id,path,mime,size,created_at")
        .eq("scan_status", "pending")
        .lte("next_scan_at", new Date().toISOString())
        .order("next_scan_at")
        .limit(BATCH),
    );
  } catch {
    report({ scanner: "ready", queue: "unavailable" });
    return null;
  }
}

const ready = await scanner();
const pending = ready && (await queue());
// Set the exit code instead of exiting so the report line is always flushed.
if (!pending) process.exitCode = 1;
const { target, identity } = ready ?? {};
let scanned = 0,
  rejected = 0,
  retry = 0,
  abandoned = 0;
const verdicts = [];
for (const file of pending ?? []) {
  try {
    // Move retry eligibility before I/O. Missing uploads/scanner outages cannot
    // monopolize the oldest slots; process crashes also retry after the delay.
    ok(
      await db
        .from("attachments")
        .update({ next_scan_at: new Date(Date.now() + RETRY_MS).toISOString() })
        .eq("id", file.id)
        .eq("scan_status", "pending"),
    );
    // INSERT is pending-only and UPDATE/DELETE are denied to users, so these
    // bytes cannot change between inspection and publishing the verdict.
    const object = await db.storage.from("attachments").download(file.path);
    if (object.error || !object.data) {
      // The upload may still be in flight. After a day it is not: close the
      // record as rejected (never clean) so it stops occupying the queue.
      if (
        missing(object.error) &&
        Date.now() - new Date(file.created_at).getTime() > ABANDONED_MS
      )
        verdicts.push({ file, verdict: "rejected", abandoned: true });
      else retry++;
      continue;
    }
    const bytes = new Uint8Array(await object.data.arrayBuffer());
    let verdict = "clean";
    try {
      await inspectContent(bytes, file.mime, file.size);
    } catch {
      verdict = "rejected";
    }
    // A scanner failure throws and is never a clean result.
    if (verdict === "clean" && (await scanBytes(target, bytes)) !== "clean")
      verdict = "rejected";
    verdicts.push({
      file,
      verdict,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  } catch {
    retry++;
  }
}

// Approvals are published only if the scanner still detects the test signature
// after the batch: a daemon that lost its database mid-run approves nothing.
let trusted = true;
if (verdicts.some((item) => item.verdict === "clean")) {
  try {
    await selfTest(target);
  } catch {
    trusted = false;
  }
}
for (const item of verdicts) {
  if (item.verdict === "clean" && !trusted) {
    retry++;
    continue;
  }
  try {
    const updated = ok(
      await db
        .from("attachments")
        .update({
          scan_status: item.verdict,
          scanned_at: new Date().toISOString(),
          content_sha256: item.sha256 ?? null,
        })
        .eq("id", item.file.id)
        .eq("scan_status", "pending")
        .select("id"),
    );
    if (!updated.length) continue;
    scanned++;
    if (item.verdict === "rejected") rejected++;
    if (item.abandoned) abandoned++;
    if (item.verdict === "clean")
      ok(await resizeReservation(db, item.file.path, item.size));
  } catch {
    retry++;
  }
}
if (pending)
  report({
    scanner: "ready",
    engine: identity.engine,
    signatures: identity.signatures,
    signatureAgeHours: identity.signatureAgeHours,
    scanned,
    rejected,
    abandoned,
    retry,
  });
if (retry) process.exitCode = 1;
