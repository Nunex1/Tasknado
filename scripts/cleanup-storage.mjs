// Run only in a trusted backend/CI. Never expose the service role key to Next public variables.
import { createClient } from "@supabase/supabase-js";
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
  throw Error("Set server-only SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data, error } = await db
  .from("storage_cleanup")
  .select("path")
  .limit(100);
if (error) throw error;
for (const { path } of data) {
  const removed = await db.storage.from("attachments").remove([path]);
  if (removed.error) throw removed.error;
  const deleted = await db.from("storage_cleanup").delete().eq("path", path);
  if (deleted.error) throw deleted.error;
}
console.log(`Removed ${data.length} queued private files.`);
