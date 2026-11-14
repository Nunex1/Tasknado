import { describe, expect, it, vi } from "vitest";
import { createPrivateQueryClient } from "./query-client";
import { mapLimited, exportUserDataBlob, exportTables } from "./export-data";
import {
  createI18n,
  ensureLocale,
  dateFormatter,
  numberFormatter,
} from "../i18n/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";

describe("Private resource cache", () => {
  it("deduplicates in-flight and fresh reads, invalidates only the changed resource", async () => {
    const cache = createPrivateQueryClient(),
      read = vi.fn(async () => ["private"]),
      other = vi.fn(async () => []);
    const query = { queryKey: ["activities", "one"], queryFn: read };
    await Promise.all([cache.fetchQuery(query), cache.fetchQuery(query)]);
    await cache.fetchQuery(query);
    await cache.fetchQuery({ queryKey: ["notes", "one"], queryFn: other });
    expect(read).toHaveBeenCalledTimes(1);
    await cache.invalidateQueries({ queryKey: ["activities", "one"] });
    await cache.fetchQuery(query);
    await cache.fetchQuery({ queryKey: ["notes", "one"], queryFn: other });
    expect(read).toHaveBeenCalledTimes(2);
    expect(other).toHaveBeenCalledTimes(1);
    cache.clear();
  });
  it("aborts transport and rejects a late response on logout; another session has no data", async () => {
    const cache = createPrivateQueryClient();
    let signal: AbortSignal | undefined, finish!: (value: string) => void;
    const pending = cache.fetchQuery({
      queryKey: ["activity", "id"],
      queryFn: ({ signal: s }) => {
        signal = s;
        return new Promise<string>((r) => (finish = r));
      },
    });
    const rejection = expect(pending).rejects.toBeDefined();
    await cache.cancelQueries();
    cache.clear();
    finish("old session");
    await rejection;
    expect(signal?.aborted).toBe(true);
    expect(cache.getQueryCache().getAll()).toHaveLength(0);
    const next = createPrivateQueryClient();
    expect(next.getQueryData(["activity", "id"])).toBeUndefined();
    next.clear();
  });
  it("reuses locale formatters and loads English on demand", async () => {
    expect(dateFormatter("pt-BR")).toBe(dateFormatter("pt-BR"));
    expect(numberFormatter("en-US")).toBe(numberFormatter("en-US"));
    expect(dateFormatter("pt-BR")).not.toBe(dateFormatter("en-US"));
    const instance = createI18n();
    expect(instance.hasResourceBundle("en-US", "translation")).toBe(false);
    await ensureLocale(instance, "en-US");
    await instance.changeLanguage("en-US");
    expect(instance.t("Salvar")).toBe("Save");
  });
});

describe("Complete bounded export", () => {
  it("bounds independent work at three and retains input order", async () => {
    let active = 0,
      max = 0;
    const result = await mapLimited([0, 1, 2, 3, 4, 5, 6], async (n) => {
      max = Math.max(max, ++active);
      await new Promise((r) => setTimeout(r, 4));
      active--;
      return n * 2;
    });
    expect(max).toBe(3);
    expect(result).toEqual([0, 2, 4, 6, 8, 10, 12]);
  });
  function fake(changed = false, fail = false) {
    let revisions = 0;
    const records = Array.from({ length: 1001 }, (_, id) => ({
      id: String(id).padStart(5, "0"),
      content: 'Private "text"\n',
    }));
    const query = (table: string) => {
      let after: string | null = null;
      const q = {
        select: () => q,
        order: () => q,
        limit: () => q,
        gt: (_key: string, value: string) => {
          after = value;
          return q;
        },
        abortSignal: () => q,
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve(
            resolve({
              data:
                table === "activities"
                  ? records.filter((r) => !after || r.id > after).slice(0, 500)
                  : [],
              error:
                fail && table === "notes" ? { message: "unavailable" } : null,
            }),
          ),
      };
      return q;
    };
    return {
      auth: {
        getUser: async () => ({ data: { user: { id: "one" } }, error: null }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        }),
      },
      from: query,
      rpc: (name: string) => ({
        abortSignal: async () => ({
          data:
            name === "export_revision" ? String(changed ? revisions++ : 1) : [],
          error: null,
        }),
      }),
    } as unknown as SupabaseClient<Database>;
  }
  it("writes all 1001 rows once across pages, with valid JSON and every table", async () => {
    const blob = await exportUserDataBlob(fake());
    const result = JSON.parse(await blob.text());
    expect(Object.keys(result)).toEqual([...exportTables]);
    expect(result.activities).toHaveLength(1001);
    expect(
      new Set(result.activities.map((r: { id: string }) => r.id)).size,
    ).toBe(1001);
    expect(result.activities[0].content).toBe('Private "text"\n');
  });
  it("does not return a download for changing data or a partial failure", async () => {
    await expect(exportUserDataBlob(fake(true))).rejects.toThrow(
      "Os dados mudaram",
    );
    await expect(exportUserDataBlob(fake(false, true))).rejects.toThrow();
  });
});
