import { describe, expect, it } from "vitest";
import { fetchPages } from "./pagination";

describe("Complete persisted lists", () => {
  const stored = Array.from({ length: 1203 }, (_, id) => ({ id }));
  const api = async (from: number, to: number) => ({
    data: stored.slice(from, Math.min(to + 1, from + 1000)),
    error: null,
  });
  it("keeps every record beyond the API's 1000-row response cap", async () => {
    expect(await fetchPages(api)).toEqual(stored);
  });
  it("honors the visible list limit beyond one API page", async () => {
    expect(await fetchPages(api, 1050)).toEqual(stored.slice(0, 1050));
  });
  it("rejects a partial list when a later page fails", async () => {
    await expect(
      fetchPages((from, to) =>
        from
          ? Promise.resolve({
              data: null,
              error: { message: "network failure" },
            })
          : api(from, to),
      ),
    ).rejects.toThrow("network failure");
  });
});
