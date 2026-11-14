import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";
import { check } from "./supabase";

export async function exportUserData(db: SupabaseClient<Database>) {
  const output: Record<string, unknown[]> = {};
  const tables = [
    "workspaces",
    "activities",
    "activity_events",
    "notes",
    "note_entries",
    "attachments",
    "audit_logs",
    "priority_history",
    "workspace_observations",
    "workspace_events",
    "career_targets",
    "professional_development_items",
  ] as const;
  for (const table of tables) {
    output[table] = [];
    for (let offset = 0; ; offset += 500) {
      const rows =
        table === "career_targets" || table === "professional_development_items"
          ? check(
              await db.rpc("export_professional_plans", {
                p_table: table,
                p_offset: offset,
              }),
            )
          : check(
              await db
                .from(table)
                .select("*")
                .order("id")
                .range(offset, offset + 499),
            );
      output[table].push(...rows);
      if (rows.length < 500) break;
    }
  }
  return output;
}
