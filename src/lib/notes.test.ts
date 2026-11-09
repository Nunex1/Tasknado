import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";
import type { Entry } from "./domain";
import {
  isGone,
  mergeEntries,
  nextNoteId,
  removeEntry,
  removeNote,
} from "./notes";
import { errorMessage } from "./supabase";
import { createI18n } from "../i18n/core";

function fakeDb(
  options: {
    files?: { path: string }[];
    selectError?: string;
    rpcError?: string;
    storageRejects?: boolean;
  } = {},
) {
  const calls: unknown[][] = [];
  const failure = (message?: string) => (message ? { message } : null);
  const db = {
    rpc: async (name: string, args: unknown) => {
      calls.push(["rpc", name, args]);
      return { data: null, error: failure(options.rpcError) };
    },
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: async (column: string, value: string) => {
          calls.push(["select", table, columns, column, value]);
          return {
            data: options.files ?? [],
            error: failure(options.selectError),
          };
        },
      }),
    }),
    storage: {
      from: (bucket: string) => ({
        remove: (paths: string[]) => {
          calls.push(["remove", bucket, paths]);
          return options.storageRejects
            ? Promise.reject(new Error("Failed to fetch"))
            : Promise.resolve({ data: [], error: null });
        },
      }),
    },
  };
  return { db: db as unknown as SupabaseClient<Database>, calls };
}
const entry = (id: string, created_at: string): Entry => ({
  id,
  note_id: "note",
  content: id,
  revision: 1,
  created_at,
  updated_at: created_at,
});

describe("Block deletion", () => {
  it("deletes exactly one block by its persistent id and its note", async () => {
    const { db, calls } = fakeDb();
    await removeEntry(db, { id: "block-2", note_id: "note-1" });
    expect(calls).toEqual([
      ["rpc", "delete_entry", { p_id: "block-2", p_note: "note-1" }],
    ]);
  });

  it("reports a failed deletion instead of pretending it worked", async () => {
    const { db } = fakeDb({ rpcError: "Failed to fetch" });
    await expect(
      removeEntry(db, { id: "block", note_id: "note" }),
    ).rejects.toThrow("Failed to fetch");
  });
});

describe("Note deletion", () => {
  it("reads the file paths, deletes the note, then removes the stored files", async () => {
    const { db, calls } = fakeDb({ files: [{ path: "u/a" }, { path: "u/b" }] });
    await removeNote(db, "note-1");
    expect(calls).toEqual([
      ["select", "attachments", "path", "note_id", "note-1"],
      ["rpc", "delete_note", { p_note: "note-1" }],
      ["remove", "attachments", ["u/a", "u/b"]],
    ]);
  });

  it("does not touch storage when the note has no files", async () => {
    const { db, calls } = fakeDb();
    await removeNote(db, "note-1");
    expect(calls.map((call) => call[0])).toEqual(["select", "rpc"]);
  });

  it("deletes nothing when the files cannot be read", async () => {
    const { db, calls } = fakeDb({ selectError: "Failed to fetch" });
    await expect(removeNote(db, "note-1")).rejects.toThrow("Failed to fetch");
    expect(calls.map((call) => call[0])).toEqual(["select"]);
  });

  it("keeps the stored files when the database refuses the deletion", async () => {
    const { db, calls } = fakeDb({
      files: [{ path: "u/a" }],
      rpcError: "Note unavailable",
    });
    await expect(removeNote(db, "note-1")).rejects.toThrow("Note unavailable");
    expect(calls.map((call) => call[0])).toEqual(["select", "rpc"]);
  });

  it("succeeds when only the storage courtesy removal fails", async () => {
    const { db } = fakeDb({ files: [{ path: "u/a" }], storageRejects: true });
    await expect(removeNote(db, "note-1")).resolves.toBeUndefined();
  });
});

describe("Deletion errors", () => {
  it("recognizes only records that are gone or not owned", () => {
    expect(isGone(new Error("Entry unavailable"))).toBe(true);
    expect(isGone(new Error("Note unavailable"))).toBe(true);
    expect(isGone(new Error("Workspace unavailable"))).toBe(false);
    expect(isGone(new Error("Failed to fetch"))).toBe(false);
    expect(isGone(new Error("permission denied for function"))).toBe(false);
    expect(isGone("Entry unavailable")).toBe(false);
  });

  it("localizes unavailable records in both languages without server text", () => {
    const i18n = createI18n();
    const block = errorMessage(new Error("Entry unavailable"));
    const note = errorMessage(new Error("Note unavailable"));
    expect(i18n.t(block)).toBe("Este bloco não está mais disponível.");
    expect(i18n.t(note)).toBe("Esta nota não está mais disponível.");
    void i18n.changeLanguage("en-US");
    expect(i18n.t(block)).toBe("This block is no longer available.");
    expect(i18n.t(note)).toBe("This note is no longer available.");
  });

  it("offers the confirmation copy in both languages with the exact title", () => {
    const i18n = createI18n("en-US");
    const title = "Disney - Vagas <&> {{title}}";
    expect(i18n.t("Excluir bloco")).toBe("Delete Block");
    expect(i18n.t("Excluir este bloco?")).toBe("Delete this block?");
    expect(i18n.t("Excluir “{{title}}”?", { title })).toBe(
      `Delete “${title}”?`,
    );
    void i18n.changeLanguage("pt-BR");
    expect(i18n.t("Excluir “{{title}}”?", { title })).toBe(
      `Excluir “${title}”?`,
    );
  });
});

describe("Selection after deleting a note", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("moves to the next note, or the previous one at the end of the list", () => {
    expect(nextNoteId(list, "a")).toBe("b");
    expect(nextNoteId(list, "b")).toBe("c");
    expect(nextNoteId(list, "c")).toBe("b");
  });
  it("leaves the selection empty when no other note is listed", () => {
    expect(nextNoteId([{ id: "a" }], "a")).toBeNull();
    expect(nextNoteId([], "a")).toBeNull();
    expect(nextNoteId(list, "hidden-by-filter")).toBeNull();
  });
});

describe("Blocks on screen", () => {
  const a = entry("a", "2026-11-01T10:00:00Z"),
    b = entry("b", "2026-11-02T10:00:00Z"),
    c = entry("c", "2026-11-03T10:00:00Z");
  const none = new Set<string>();

  it("replaces the first page and appends later ones without duplicates, in creation order", () => {
    expect(mergeEntries([c], [b, a], false, none)).toEqual([a, b]);
    expect(mergeEntries([a, b], [c, b], true, none)).toEqual([a, b, c]);
  });

  it("never brings back a deleted block from a page requested earlier", () => {
    const removed = new Set(["b"]);
    expect(mergeEntries([a, c], [b, c], true, removed)).toEqual([a, c]);
    expect(mergeEntries([], [a, b, c], false, removed)).toEqual([a, c]);
  });

  it("keeps the remaining blocks in their original order", () => {
    expect(mergeEntries([], [c, a], false, new Set(["b"]))).toEqual([a, c]);
  });
});
