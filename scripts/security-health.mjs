// Read-only operational check for a trusted backend. It prints one JSON line
// with aggregate counters and exits nonzero when any alert condition holds;
// the scheduler or monitor that runs it turns that exit code into a
// notification. Nothing here sends e-mail or chat messages by itself.
//
// The output never contains file names, paths, account identifiers, tokens or
// content: only counters and fixed alert codes.
import { createClient } from "@supabase/supabase-js";
import { scannerIdentity, scannerTarget, selfTest } from "./clamav.mjs";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TASKNADO_WORKER_TARGET } =
  process.env;
if (
  !SUPABASE_URL ||
  !SUPABASE_SERVICE_ROLE_KEY ||
  TASKNADO_WORKER_TARGET !== SUPABASE_URL
)
  throw Error("Explicit worker configuration required");
const limit = (name, fallback) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < 0) throw Error(`Invalid ${name}`);
  return value;
};
const thresholds = {
  // Supabase's smallest database is 500 MB; warn with room to react.
  databaseBytes: limit("HEALTH_DATABASE_BYTES", 400 * 1024 * 1024),
  rejections24h: limit("HEALTH_REJECTIONS_24H", 20),
  signatureAgeHours: limit("HEALTH_SIGNATURE_AGE_HOURS", 24),
  // The per-account ceiling enforced by enforce_account_limits().
  accountChangesPerMinute: 1200,
};

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const alerts = [];
const result = await db.rpc("security_metrics");
const metrics = result.error ? null : result.data;
if (!metrics) alerts.push("metrics_unavailable");
else {
  if (metrics.uploads_pending_overdue > 0) alerts.push("scan_queue_overdue");
  if (metrics.cleanup_overdue > 0) alerts.push("cleanup_overdue");
  if (metrics.uploads_rejected_24h > thresholds.rejections24h)
    alerts.push("rejections_spike");
  if (metrics.accounts_near_storage_quota > 0)
    alerts.push("storage_quota_near");
  if (metrics.database_bytes > thresholds.databaseBytes)
    alerts.push("database_size");
  if (metrics.busiest_account_changes_1m >= thresholds.accountChangesPerMinute)
    alerts.push("write_rate_ceiling");
}

// Checked whenever this host is configured as a scanner host.
let scanner = { state: "not_checked" };
if (process.env.CLAMD_HOST) {
  try {
    const target = scannerTarget(process.env);
    const identity = await scannerIdentity(target, {
      maxSignatureAgeHours: thresholds.signatureAgeHours,
    });
    await selfTest(target);
    scanner = { state: "ready", ...identity };
  } catch (error) {
    const code =
      error instanceof Error && error.message === "signatures_stale"
        ? "signatures_stale"
        : "scanner_unavailable";
    scanner = { state: code };
    alerts.push(code);
  }
}

console.log(
  JSON.stringify({
    event: "security_health",
    unavailable: !metrics,
    alerts,
    scanner,
    metrics,
  }),
);
if (alerts.length) process.exitCode = 1;
