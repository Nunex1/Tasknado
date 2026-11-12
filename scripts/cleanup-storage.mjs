// Run only in a trusted backend/CI. Never expose the service role key to Next public variables.
import { createClient } from "@supabase/supabase-js";
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TASKNADO_WORKER_TARGET } =
  process.env;
if (
  !SUPABASE_URL ||
  !SUPABASE_SERVICE_ROLE_KEY ||
  SUPABASE_URL !== TASKNADO_WORKER_TARGET
)
  throw Error(
    "Set server-only credentials and an exact TASKNADO_WORKER_TARGET",
  );
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data, error } = await db
  .from("storage_cleanup")
  .select("path")
  .order("created_at")
  .limit(100);
if (error) throw Error("Cleanup queue unavailable");
let failures = 0;
for (const { path } of data) {
  const removed = await db.storage.from("attachments").remove([path]);
  if (removed.error) {
    failures++;
    continue;
  }
  const released = await db
    .from("attachment_paths")
    .update({ reserved_bytes: 0 })
    .eq("path", path);
  if (released.error) {
    failures++;
    continue;
  }
  const deleted = await db.from("storage_cleanup").delete().eq("path", path);
  if (deleted.error) failures++;
}
console.log(
  JSON.stringify({
    event: "storage_cleanup_batch",
    processed: data.length,
    failures,
  }),
);
if (failures) process.exitCode = 1;
