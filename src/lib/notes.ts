import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";
import type { Entry } from "./domain";
import { check } from "./supabase";

type Db = SupabaseClient<Database>;

/** Deletes one block. The server checks ownership and that it belongs to the note. */
export async function removeEntry(
  db: Db,
  entry: Pick<Entry, "id" | "note_id">,
) {
  check(
    await db.rpc("delete_entry", { p_id: entry.id, p_note: entry.note_id }),
  );
}

/** Deletes a note; its blocks and file records follow in the same transaction. */
export async function removeNote(db: Db, noteId: string) {
  const files = check(
    await db.from("attachments").select("path").eq("note_id", noteId),
  );
  check(await db.rpc("delete_note", { p_note: noteId }));
  // The file records are gone and their paths are queued on the server, so
  // removing the stored objects now is a courtesy that is allowed to fail.
  if (files.length)
    void db.storage
      .from("attachments")
      .remove(files.map((file) => file.path))
      .then(
        () => {},
        () => {},
      );
}

/**
 * The record no longer exists, or never belonged to this account: the server
 * answers both the same way. Either way it must leave the screen.
 */
export function isGone(e: unknown) {
  return e instanceof Error && /^(entry|note) unavailable$/i.test(e.message);
}

/** The note to select after one is removed from the list as it is displayed. */
export function nextNoteId(ordered: { id: string }[], removedId: string) {
  const index = ordered.findIndex((note) => note.id === removedId);
  if (index < 0) return null;
  return (ordered[index + 1] ?? ordered[index - 1])?.id ?? null;
}

/**
 * Combines a loaded page with the blocks on screen, in creation order. A page
 * requested before a deletion finished can still carry the deleted block, so
 * removed ids are dropped here.
 */
export function mergeEntries(
  current: Entry[],
  page: Entry[],
  append: boolean,
  removed: ReadonlySet<string>,
) {
  const merged = append ? [...current, ...page] : page;
  return [
    ...new Map(
      merged
        .filter((entry) => !removed.has(entry.id))
        .map((entry) => [entry.id, entry]),
    ).values(),
  ].sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
}
