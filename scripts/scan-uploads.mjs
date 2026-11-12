import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, isAbsolute } from "node:path";
import { inspectContent } from "./upload-content.mjs";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  TASKNADO_WORKER_TARGET,
  CLAMSCAN_PATH,
} = process.env;
if (
  !SUPABASE_URL ||
  SUPABASE_URL !== TASKNADO_WORKER_TARGET ||
  !SUPABASE_SERVICE_ROLE_KEY ||
  !CLAMSCAN_PATH ||
  !isAbsolute(CLAMSCAN_PATH)
) {
  throw Error(
    "Set explicit worker target, server credentials and absolute CLAMSCAN_PATH; uploads remain quarantined.",
  );
}
const url = new URL(SUPABASE_URL);
if (
  url.protocol !== "https:" &&
  !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
)
  throw Error("HTTPS required");
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ok = (r) => {
  if (r.error) throw Error("storage_or_database_failure");
  return r.data;
};
const pending = ok(
  await db
    .from("attachments")
    .select("id,path,mime,size")
    .eq("scan_status", "pending")
    .lte("next_scan_at", new Date().toISOString())
    .order("next_scan_at")
    .limit(10),
);
let scanned = 0,
  rejected = 0,
  retry = 0;
for (const file of pending) {
  let dir;
  try {
    // Move retry eligibility before I/O. Missing uploads/scanner outages cannot
    // monopolize the oldest ten slots; process crashes also retry after delay.
    ok(
      await db
        .from("attachments")
        .update({ next_scan_at: new Date(Date.now() + 300000).toISOString() })
        .eq("id", file.id)
        .eq("scan_status", "pending"),
    );
    // INSERT is pending-only and UPDATE/DELETE are denied to users, so these
    // bytes cannot change between inspection and publishing the verdict.
    const object = await db.storage.from("attachments").download(file.path);
    if (object.error || !object.data) {
      retry++;
      continue;
    } // upload may still be in flight
    const bytes = new Uint8Array(await object.data.arrayBuffer());
    let verdict = "clean";
    try {
      await inspectContent(bytes, file.mime, file.size);
    } catch {
      verdict = "rejected";
    }
    if (verdict === "clean") {
      dir = await mkdtemp(join(tmpdir(), "tasknado-scan-"));
      const input = join(dir, "upload.bin");
      await writeFile(input, bytes, { mode: 0o600 });
      try {
        await promisify(execFile)(
          CLAMSCAN_PATH,
          [
            "--no-summary",
            "--infected",
            "--max-filesize=20M",
            "--max-scansize=40M",
            "--max-recursion=16",
            "--alert-exceeds-max=yes",
            "--",
            input,
          ],
          { timeout: 60000, maxBuffer: 65536, windowsHide: true },
        );
      } catch (error) {
        if (error.code === 1) verdict = "rejected";
        else {
          retry++;
          continue;
        } // scanner failure is never a clean result
      }
    }
    const updated = ok(
      await db
        .from("attachments")
        .update({
          scan_status: verdict,
          scanned_at: new Date().toISOString(),
          content_sha256: createHash("sha256").update(bytes).digest("hex"),
        })
        .eq("id", file.id)
        .eq("scan_status", "pending")
        .select("id"),
    );
    if (updated.length) {
      scanned++;
      if (verdict === "rejected") rejected++;
      if (verdict === "clean")
        ok(
          await db
            .from("attachment_paths")
            .update({ reserved_bytes: bytes.length })
            .eq("path", file.path),
        );
    }
  } catch {
    retry++;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}
console.log(
  JSON.stringify({ event: "upload_scan_batch", scanned, rejected, retry }),
);
if (retry) process.exitCode = 1;
