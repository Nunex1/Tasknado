// Read-only operational check. Exit nonzero is the scheduler/monitor alert signal.
import { createClient } from "@supabase/supabase-js";
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TASKNADO_WORKER_TARGET } =
  process.env;
if (
  !SUPABASE_URL ||
  !SUPABASE_SERVICE_ROLE_KEY ||
  TASKNADO_WORKER_TARGET !== SUPABASE_URL
)
  throw Error("Explicit worker configuration required");
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
const results = await Promise.all([
  db
    .from("attachments")
    .select("id", { count: "exact", head: true })
    .eq("scan_status", "pending")
    .lt("created_at", cutoff),
  db
    .from("storage_cleanup")
    .select("path", { count: "exact", head: true })
    .lt("created_at", cutoff),
]);
const unavailable = results.some((r) => r.error);
const pending = results[0].count,
  cleanup = results[1].count;
console.log(
  JSON.stringify({
    event: "security_health",
    unavailable,
    overdueScans: pending,
    overdueCleanup: cleanup,
  }),
);
if (unavailable || pending || cleanup) process.exitCode = 1;
