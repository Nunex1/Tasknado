import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  createI18n,
  formatBytes,
  formatDate,
  isLocale,
  preferenceKey,
  readLocale,
  resources,
} from "./core";
import {
  dateFromValue,
  dateValue,
  inputDate,
  parseInputDate,
} from "./calendar";
import { statuses, eventNames, validateFile } from "../lib/domain";

describe("Translation completeness", () => {
  it("has exactly the same nonempty resources and interpolation parameters in both languages", () => {
    const pt = resources["pt-BR"].translation;
    const en = resources["en-US"].translation;
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    const parameters = (value: string) =>
      [...value.matchAll(/{{\s*([^},]+)/g)].map((match) => match[1]).sort();
    for (const key of Object.keys(pt) as (keyof typeof pt)[]) {
      expect(en[key].trim(), key).not.toBe("");
      expect(parameters(en[key]), key).toEqual(parameters(pt[key]));
    }
  });

  it("resolves every literal translation key and stored system message used by components", () => {
    const i18n = createI18n("en-US");
    const files = readdirSync("src/components", { recursive: true }).filter(
      (file) => String(file).endsWith(".tsx"),
    );
    const missing: string[] = [];
    for (const file of files) {
      const source = ts.createSourceFile(
        String(file),
        readFileSync(path.join("src/components", String(file)), "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      function walk(node: ts.Node) {
        if (
          (ts.isCallExpression(node) || ts.isNewExpression(node)) &&
          ["t", "report", "setMessage", "Error"].includes(
            node.expression.getText(source),
          )
        ) {
          const argument = node.arguments?.[0];
          if (
            argument &&
            ts.isStringLiteral(argument) &&
            argument.text &&
            !i18n.exists(argument.text) &&
            !i18n.exists(`${argument.text}_other`)
          )
            missing.push(`${file}: ${argument.text}`);
        }
        ts.forEachChild(node, walk);
      }
      walk(source);
    }
    expect(missing).toEqual([]);
    for (const key of [
      ...Object.values(statuses),
      ...Object.values(eventNames),
      validateFile({ size: 0, type: "" }),
      validateFile({ size: 1, type: "invalid" }),
    ])
      expect(i18n.exists(key!)).toBe(true);
  });

  it("keeps visible JSX copy and accessibility labels in translation resources", () => {
    const allowed = new Set([
      "🇧🇷 Português (Brasil)",
      "🇺🇸 English (US)",
      "Tasknado",
      "×",
      "⌘ K",
    ]);
    const paths = ["src/components", "src/app"];
    const untranslated: string[] = [];
    for (const directory of paths) {
      for (const file of readdirSync(directory, { recursive: true }).filter(
        (file) => String(file).endsWith(".tsx"),
      )) {
        const source = ts.createSourceFile(
          String(file),
          readFileSync(path.join(directory, String(file)), "utf8"),
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX,
        );
        function walk(node: ts.Node) {
          if (ts.isJsxText(node)) {
            const text = node.text.replace(/\s+/g, " ").trim();
            if (/[a-zA-ZÀ-ÿ]/.test(text) && !allowed.has(text))
              untranslated.push(`${file}: ${text}`);
          }
          if (
            ts.isJsxAttribute(node) &&
            ["aria-label", "placeholder", "title"].includes(
              node.name.getText(source),
            ) &&
            node.initializer &&
            ts.isStringLiteral(node.initializer) &&
            !allowed.has(node.initializer.text)
          )
            untranslated.push(`${file}: ${node.initializer.text}`);
          ts.forEachChild(node, walk);
        }
        walk(source);
      }
    }
    expect(untranslated).toEqual([]);
  });
});

describe("Locale preferences and formatting", () => {
  it("only accepts pt-BR and en-US and defaults to Portuguese without browser detection", () => {
    expect(["pt", "en", "es-ES", null, "invalid"].some(isLocale)).toBe(false);
    expect(isLocale("pt-BR") && isLocale("en-US")).toBe(true);
    const storage = { getItem: () => "invalid" };
    expect(readLocale(storage, null)).toBe("pt-BR");
    expect(
      readLocale(
        {
          getItem() {
            throw new Error("Storage blocked");
          },
        },
        null,
      ),
    ).toBe("pt-BR");
  });

  it("isolates account preferences and retains the guest language independently", () => {
    const saved = new Map([
      [preferenceKey(null), "en-US"],
      [preferenceKey("account-a"), "en-US"],
    ]);
    const storage = { getItem: (key: string) => saved.get(key) ?? null };
    expect(readLocale(storage, "account-a")).toBe("en-US");
    expect(readLocale(storage, "account-b")).toBe("pt-BR");
    expect(readLocale(storage, null)).toBe("en-US");
  });

  it("uses regional numbers and dates, including the 12-hour US clock", () => {
    const instant = new Date(2026, 9, 16, 15, 5).toISOString();
    expect(formatDate(instant, "pt-BR")).toContain("16/10/2026");
    expect(formatDate(instant, "en-US")).toContain("10/16/26");
    expect(formatDate(instant, "en-US")).toContain("PM");
    expect(formatBytes(1536, "pt-BR")).toBe("1,5 KB");
    expect(formatBytes(1536, "en-US")).toBe("1.5 KB");
  });

  it("pluralizes counts and preserves user content verbatim during interpolation", () => {
    const i18n = createI18n("en-US");
    expect(i18n.t("resultCount", { count: 1 })).toBe("1 result on this page");
    expect(i18n.t("resultCount", { count: 1234 })).toBe(
      "1,234 results on this page",
    );
    const name = "Visão geral <&> {{name}}";
    expect(i18n.t("Excluir {{name}}", { name })).toBe(`Delete ${name}`);
    void i18n.changeLanguage("pt-BR");
    expect(i18n.t("resultCount", { count: 2 })).toBe(
      "2 resultados nesta página",
    );
  });

  it("round trips dates in both locales and rejects impossible dates", () => {
    expect(inputDate("2026-10-16", "pt-BR")).toBe("16/10/2026");
    expect(inputDate("2026-10-16", "en-US")).toBe("10/16/2026");
    expect(parseInputDate("16/10/2026", "pt-BR")).toBe("2026-10-16");
    expect(parseInputDate("10/16/2026", "en-US")).toBe("2026-10-16");
    expect(parseInputDate("31/02/2026", "pt-BR")).toBeNull();
    expect(parseInputDate("16/10/2026", "en-US")).toBeNull();
    expect(dateFromValue("2026-02-29")).toBeNull();
    expect(dateValue(dateFromValue("2024-02-29")!)).toBe("2024-02-29");
  });
});
