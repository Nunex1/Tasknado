import { describe, expect, it } from "vitest";
import {
  applyTheme,
  isThemeMode,
  readTheme,
  resolveTheme,
  themeColors,
  themeKey,
  themeScript,
} from "./theme";
import { switchWorkspacePath, workspacePath } from "./navigation";

function fakeDocument() {
  const attributes = new Map<string, string>();
  const metas = [
    { media: "(prefers-color-scheme: light)", content: themeColors.light },
    { media: "(prefers-color-scheme: dark)", content: themeColors.dark },
  ];
  return {
    attributes,
    metas,
    doc: {
      documentElement: {
        setAttribute: (name: string, value: string) =>
          attributes.set(name, value),
        removeAttribute: (name: string) => attributes.delete(name),
      },
      querySelectorAll: () => metas,
    } as unknown as Document,
  };
}

describe("Appearance preference", () => {
  it("accepts only light, dark and system, and falls back to system", () => {
    expect(["light", "dark", "system"].every(isThemeMode)).toBe(true);
    expect(["", "auto", "Dark", null, undefined, 1].some(isThemeMode)).toBe(
      false,
    );
    expect(readTheme({ getItem: () => "dark" })).toBe("dark");
    expect(readTheme({ getItem: () => "sepia" })).toBe("system");
    expect(readTheme({ getItem: () => null })).toBe("system");
    expect(
      readTheme({
        getItem() {
          throw new Error("Storage blocked");
        },
      }),
    ).toBe("system");
  });

  it("follows the device only in system mode", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("marks the document for an explicit choice and clears the mark for system", () => {
    const { doc, attributes, metas } = fakeDocument();
    applyTheme("dark", doc);
    expect(attributes.get("data-theme")).toBe("dark");
    expect(metas.map((meta) => meta.content)).toEqual([
      themeColors.dark,
      themeColors.dark,
    ]);
    applyTheme("light", doc);
    expect(attributes.get("data-theme")).toBe("light");
    expect(metas.map((meta) => meta.content)).toEqual([
      themeColors.light,
      themeColors.light,
    ]);
    applyTheme("system", doc);
    expect(attributes.has("data-theme")).toBe(false);
    expect(metas.map((meta) => meta.content)).toEqual([
      themeColors.light,
      themeColors.dark,
    ]);
  });

  it("applies the stored choice before paint and survives blocked or invalid storage", () => {
    const run = (stored: string | null | Error) => {
      const { doc, attributes } = fakeDocument();
      const localStorage = {
        getItem(key: string) {
          expect(key).toBe(themeKey);
          if (stored instanceof Error) throw stored;
          return stored;
        },
      };
      new Function("document", "localStorage", themeScript)(doc, localStorage);
      return attributes.get("data-theme");
    };
    expect(run("dark")).toBe("dark");
    expect(run("light")).toBe("light");
    expect(run("system")).toBeUndefined();
    expect(run(null)).toBeUndefined();
    expect(run('dark"><script>')).toBeUndefined();
    expect(run(new Error("blocked"))).toBeUndefined();
  });
});

describe("Workspace switching", () => {
  const work = { id: "w1", category: "work" };
  const personal = { id: "p1", category: "personal" };
  it("keeps the current module when the target workspace has it", () => {
    for (const view of [
      "activities",
      "notes",
      "observations",
      "history",
    ] as const)
      expect(switchWorkspacePath(view, personal)).toBe(
        workspacePath("p1", view),
      );
    expect(switchWorkspacePath("matrix", work)).toBe(
      workspacePath("w1", "matrix"),
    );
  });
  it("falls back to the overview when the module does not exist there", () => {
    expect(switchWorkspacePath("matrix", personal)).toBe("/workspaces/p1");
    for (const view of [
      "dashboard",
      "search",
      "settings",
      "workspaces",
    ] as const)
      expect(switchWorkspacePath(view, work)).toBe("/workspaces/w1");
  });
  it("returns to the views that span every workspace", () => {
    expect(switchWorkspacePath("activities", null)).toBe("/activities");
    expect(switchWorkspacePath("notes", null)).toBe("/notes");
    for (const view of ["dashboard", "matrix", "history", "settings"] as const)
      expect(switchWorkspacePath(view, null)).toBe("/");
  });
});
