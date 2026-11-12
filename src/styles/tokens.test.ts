import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { themeColors } from "../lib/theme";

const css = readFileSync("src/styles/tokens.css", "utf8");

/** Declarations of the first rule whose selector line contains `marker`. */
function block(marker: string, from = 0) {
  const start = css.indexOf(marker, from);
  expect(start, marker).toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  const close = css.indexOf("\n}", open);
  const inner = css.slice(open + 1, close);
  // A nested rule (the media query) ends one level deeper.
  return inner.includes("{") ? inner.slice(0, inner.lastIndexOf("}")) : inner;
}
function declarations(body: string) {
  const map = new Map<string, string>();
  for (const match of body.matchAll(/(--[\w-]+|color-scheme):\s*([^;]+);/g))
    map.set(match[1], match[2].replace(/\s+/g, " ").trim());
  return map;
}
const light = declarations(block(":root {"));
const darkExplicit = declarations(block(':root[data-theme="dark"] {'));
const darkSystem = declarations(
  block(
    ':root:not([data-theme="light"]) {',
    css.indexOf("@media (prefers-color-scheme: dark)"),
  ),
);

function luminance(hex: string) {
  const value = parseInt(hex.slice(1), 16);
  return [value >> 16, (value >> 8) & 255, value & 255]
    .map((channel) => channel / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

// [foreground, background, minimum ratio]
const pairs: [string, string, number][] = [
  // Body text on every opaque surface.
  ...["--background", "--surface", "--panel", "--surface-elevated"].flatMap(
    (surface): [string, string, number][] => [
      ["--text", surface, 4.5],
      ["--text-secondary", surface, 4.5],
      ["--text-subtle", surface, 4.5],
    ],
  ),
  ["--text", "--blue-surface", 4.5],
  ["--text-subtle", "--blue-surface", 4.5],
  // Brand as text, and as an icon or indicator.
  ["--primary-strong", "--background", 4.5],
  ["--primary-strong", "--panel", 4.5],
  ["--primary-strong", "--surface-elevated", 4.5],
  ["--primary-strong", "--blue-surface", 4.5],
  ["--primary-strong", "--mark", 4.5],
  ["--primary", "--background", 3],
  ["--primary", "--panel", 3],
  ["--primary", "--surface-elevated", 3],
  ["--royal", "--background", 3],
  // White text on filled controls, at rest and hovered.
  ["--on-primary", "--primary-fill", 4.5],
  ["--on-primary", "--primary-fill-hover", 4.5],
  // Semantic text on its own tint and on the neutral surfaces.
  ...["info", "success", "warning", "danger", "neutral"].flatMap(
    (name): [string, string, number][] => [
      [`--${name}`, `--${name}-surface`, 4.5],
      [`--${name}`, "--background", 4.5],
      [`--${name}`, "--panel", 4.5],
      [`--${name}`, "--surface-elevated", 4.5],
    ],
  ),
  // Non-text: control outlines and the focus indicator.
  ["--border-control", "--background", 3],
  ["--border-control", "--panel", 3],
  ["--border-control", "--surface-elevated", 3],
  ["--focus", "--background", 3],
  ["--focus", "--panel", 3],
  ["--focus", "--surface-elevated", 3],
];

describe("Design tokens", () => {
  it("declares the dark theme identically for System and for an explicit choice", () => {
    expect([...darkSystem]).toEqual([...darkExplicit]);
    expect(darkExplicit.get("color-scheme")).toBe("dark");
    expect(light.get("color-scheme")).toBe("light");
  });

  it("overrides in dark only tokens that exist in light, and every colour token", () => {
    for (const name of darkExplicit.keys())
      expect(light.has(name), name).toBe(true);
    const coloured = [...light].filter(
      ([name, value]) =>
        name.startsWith("--") && /#[0-9a-f]{3,8}\b|rgb\(/i.test(value),
    );
    for (const [name] of coloured)
      // Same white in both themes, by design.
      if (name !== "--on-primary" || darkExplicit.has(name))
        expect(darkExplicit.has(name), name).toBe(true);
  });

  it.each([
    ["light", light],
    ["dark", darkExplicit],
  ] as const)("meets WCAG AA contrast in the %s theme", (_, tokens) => {
    const failures: string[] = [];
    for (const [foreground, background, minimum] of pairs) {
      const fg = tokens.get(foreground)!;
      const bg = tokens.get(background)!;
      expect(fg, foreground).toMatch(/^#[0-9a-f]{6}$/);
      expect(bg, background).toMatch(/^#[0-9a-f]{6}$/);
      const ratio = contrast(fg, bg);
      if (ratio < minimum)
        failures.push(
          `${foreground} on ${background}: ${ratio.toFixed(2)} < ${minimum}`,
        );
    }
    expect(failures).toEqual([]);
  });

  it("uses the palette of the specification and matches the browser chrome colour", () => {
    expect(light.get("--background")).toBe(themeColors.light);
    expect(darkExplicit.get("--background")).toBe(themeColors.dark);
    expect(Object.fromEntries(light)).toMatchObject({
      "--surface": "#f8fafc",
      "--primary": "#2563eb",
      "--royal": "#4169e1",
      "--primary-strong": "#1d4ed8",
      "--blue-surface": "#eff6ff",
      "--text": "#0f172a",
      "--text-secondary": "#64748b",
      "--border": "#e2e8f0",
    });
    expect(Object.fromEntries(darkExplicit)).toMatchObject({
      "--surface": "#111827",
      "--surface-elevated": "#1e293b",
      "--primary": "#60a5fa",
      "--royal": "#678cf8",
      "--primary-fill": "#2563eb",
      "--text": "#f8fafc",
      "--text-secondary": "#cbd5e1",
      "--border": "#334155",
    });
  });
});
