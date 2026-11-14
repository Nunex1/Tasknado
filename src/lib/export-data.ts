import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";
import { check } from "./supabase";

export const exportTables = ["workspaces", "activities", "activity_events", "notes", "note_entries", "attachments", "audit_logs", "priority_history", "workspace_observations", "workspace_events", "career_targets", "professional_development_items"] as const;
type ExportTable = typeof exportTables[number];
type Row = { id: string | number; [key: string]: unknown };
type Options = { signal?: AbortSignal; onProgress?: (completedTables: number, totalTables: number) => void };

/** At most three independent tables; pages within a table are sequential. */
export async function mapLimited<T, R>(items: readonly T[], work: (item: T) => Promise<R>, concurrency = 3): Promise<R[]> {
  const result: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) { const index = next++; result[index] = await work(items[index]); }
  }));
  return result;
}
async function consistentExport<R>(db: SupabaseClient<Database>, consume: (table: ExportTable, pages: AsyncIterable<Row[]>) => Promise<R>, options: Options): Promise<R[]> {
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  const owner = check(await db.auth.getUser()).user?.id;
  if (!owner) throw Error("Sessão expirada");
  const { data: auth } = db.auth.onAuthStateChange((_event, session) => {
    if (session?.user.id !== owner) controller.abort();
  });
  let completed = 0;
  async function* pages(table: ExportTable) {
    let after: string | number | null = null;
    for (;;) {
      signal.throwIfAborted();
      let rows: Row[];
      if (table === "career_targets" || table === "professional_development_items") {
        rows = check(await db.rpc("export_professional_page", { p_table: table, p_after: after as string | null }).abortSignal(signal)) as unknown as Row[];
      } else {
        // Full columns are intentional for export; ordinary UI lists use projections.
        let q = db.from(table).select("*").order("id").limit(500);
        if (after !== null) q = q.gt("id", after);
        rows = check(await q.abortSignal(signal)) as unknown as Row[];
      }
      if (rows.length) yield rows.map(({ search_document: _derivedSearch, ...row }) => row);
      if (rows.length < 500) return;
      after = rows.at(-1)!.id;
    }
  }
  try {
    const before = check(await db.rpc("export_revision").abortSignal(signal));
    const results = await mapLimited(exportTables, async table => {
      try {
        const result = await consume(table, pages(table));
        options.onProgress?.(++completed, exportTables.length);
        return result;
      } catch (error) { controller.abort(); throw error; }
    });
    signal.throwIfAborted();
    const after = check(await db.rpc("export_revision").abortSignal(signal));
    if (before !== after) throw Error("Os dados mudaram durante a exportação. Tente novamente.");
    return results;
  } finally { controller.abort(); auth.subscription.unsubscribe(); }
}
/** Retained for integrations needing a parsed object. */
export async function exportUserData(db: SupabaseClient<Database>, options: Options = {}) {
  const rows = await consistentExport(db, async (_table, pages) => {
    const result: Row[] = [];
    for await (const page of pages) result.push(...page);
    return result;
  }, options);
  return Object.fromEntries(exportTables.map((table, i) => [table, rows[i]]));
}
/** Serialize bounded pages and release parsed rows instead of building one full-size string. */
export async function exportUserDataBlob(db: SupabaseClient<Database>, options: Options = {}) {
  const tables = await consistentExport(db, async (table, pages) => {
    const parts: BlobPart[] = [JSON.stringify(table) + ":["];
    let first = true;
    for await (const page of pages) {
      parts.push((first ? "" : ",") + JSON.stringify(page).slice(1, -1));
      first = false;
    }
    parts.push("]");
    return new Blob(parts);
  }, options);
  return new Blob(["{", ...tables.flatMap((table, i) => i ? [",", table] : [table]), "}"], { type: "application/json" });
}
