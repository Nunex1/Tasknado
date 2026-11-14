import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resources } from "../i18n/core";
import {
  barNav,
  isCurrentSection,
  primaryNav,
  tabIcons,
  tabsFor,
  workspaceTabs,
} from "./nav-items";

const source = (file: string) => readFileSync(file, "utf8");

describe("Navigation destinations", () => {
  it("shows four places in the top bar and adds search in the phone drawer", () => {
    expect(barNav.map((item) => item.label)).toEqual([
      "Início",
      "Workspaces",
      "Tarefas",
      "Notas",
    ]);
    expect(primaryNav.map((item) => item.href)).toEqual([
      "/",
      "/workspaces",
      "/activities",
      "/notes",
      "/search",
    ]);
    // The bar leaves the search page to the search control beside the links.
    expect(barNav.some((item) => item.href === "/search")).toBe(false);
    expect(new Set(primaryNav.map((item) => item.href)).size).toBe(
      primaryNav.length,
    );
  });

  it("marks one place as current, with Workspaces covering every workspace page", () => {
    const current = (path: string) =>
      primaryNav
        .filter((item) => isCurrentSection(item.href, path))
        .map((item) => item.href);
    expect(current("/")).toEqual(["/"]);
    expect(current("/workspaces")).toEqual(["/workspaces"]);
    expect(current("/workspaces/abc")).toEqual(["/workspaces"]);
    expect(current("/workspaces/abc/notes/def")).toEqual(["/workspaces"]);
    expect(current("/activities")).toEqual(["/activities"]);
    expect(current("/notes")).toEqual(["/notes"]);
    expect(current("/search")).toEqual(["/search"]);
    // Pages reached from the account menu belong to no place of the bar.
    expect(current("/settings")).toEqual([]);
    expect(current("/perfil")).toEqual([]);
  });

  it("offers every module of a category, with an icon and both translations", () => {
    expect(tabsFor("work").map((tab) => tab.view)).toEqual(
      workspaceTabs.map((tab) => tab.view),
    );
    for (const category of [
      "personal_life",
      "university",
      "self_study",
      "sports",
    ])
      expect(tabsFor(category).map((tab) => tab.view)).toEqual([
        "dashboard",
        "activities",
        "observations",
        "history",
        "notes",
      ]);
    for (const tab of workspaceTabs) expect(tabIcons[tab.view]).toBeDefined();
    for (const { label } of [...primaryNav, ...workspaceTabs])
      for (const locale of ["pt-BR", "en-US"] as const)
        expect(
          (resources[locale].translation as Record<string, string>)[label],
          `${label} in ${locale}`,
        ).toBeTruthy();
  });
});

describe("Navigation layout contract", () => {
  const shell = source("src/styles/shell.css");
  const tokens = source("src/styles/tokens.css");

  it("keeps no side navigation and docks the bar to the top", () => {
    for (const gone of [
      "primary-rail",
      "rail-item",
      "context-panel",
      "context-toggle",
      "with-context",
    ])
      expect(shell, gone).not.toContain(gone);
    expect(tokens).not.toMatch(/--rail-width|--context-width/);
    const header = shell.slice(shell.indexOf(".global-header {"));
    expect(header.slice(0, header.indexOf("}"))).toMatch(
      /position: fixed;\s+inset: 0 0 auto;/,
    );
    // The content column takes the whole width: nothing pushes it sideways.
    const content = shell.slice(shell.indexOf(".desktop-content {"));
    expect(content.slice(0, content.indexOf("}"))).not.toContain("margin-left");
  });

  it("slides the phone drawer in from the right edge using transforms only", () => {
    const drawer = shell.slice(shell.indexOf(".nav-drawer {"));
    const rule = drawer.slice(0, drawer.indexOf("}"));
    expect(rule).toMatch(/\bright: 0;/);
    expect(rule).not.toMatch(/\bleft: 0;/);
    expect(rule).toContain("border-left");
    // A shadow on this layer tripled the time of its first paint.
    expect(rule).not.toMatch(/box-shadow:/);
    for (const name of ["drawer-slide-in", "drawer-slide-out"]) {
      const frames = shell.slice(shell.indexOf(`@keyframes ${name}`));
      expect(frames.slice(0, frames.indexOf("\n}"))).toContain(
        "transform: translateX(100%)",
      );
    }
    // Short enough to feel immediate, long enough to read as movement.
    for (const [, ms] of rule.matchAll(/animation: [\w-]+ (\d+)ms/g))
      expect(Number(ms)).toBeGreaterThanOrEqual(180);
    for (const [, ms] of shell.matchAll(/drawer-slide-\w+ (\d+)ms/g))
      expect(Number(ms)).toBeLessThanOrEqual(250);
  });

  it("uses the same breakpoints in the styles and in the components", () => {
    // Phone: drawer instead of the bar.
    expect(source("src/components/desktop-shell.tsx")).toContain(
      'const phoneQuery = "(max-width: 767px)"',
    );
    expect(tokens).toContain("@media (max-width: 767px)");
    // Compact bar: search rests as an icon.
    expect(source("src/components/header-search.tsx")).toContain(
      'const collapsedSearchQuery = "(max-width: 1279px)"',
    );
    expect(shell).toContain("@media (max-width: 1279px)");
    // The wordmark joins the symbol from 1024px.
    expect(shell).toContain("@media (max-width: 1023px)");
  });
});
