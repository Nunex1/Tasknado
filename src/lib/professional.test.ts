import { describe, expect, it } from "vitest";
import {
  careerError,
  developmentError,
  emptyCareer,
  emptyDevelopment,
  safeOpportunityUrl,
  literalSearch,
  careerRegions,
  developmentStatuses,
  planPriorities,
  workModes,
} from "./professional";
import { routeState, switchWorkspacePath, workspacePath } from "./navigation";
import { tabsFor } from "../components/nav-items";
import { createI18n } from "../i18n/core";

describe("Professional plans", () => {
  it("requires both halves of a development record and checks dates", () => {
    expect(developmentError(emptyDevelopment)).toBeTruthy();
    expect(
      developmentError({ ...emptyDevelopment, development_area: "English" }),
    ).toBeTruthy();
    const valid = {
      ...emptyDevelopment,
      development_area: "English",
      action_plan: "Practice\nweekly",
    };
    expect(developmentError(valid)).toBeNull();
    expect(
      developmentError({
        ...valid,
        start_date: "2026-11-13",
        due_date: "2026-11-12",
      }),
    ).toBeTruthy();
    expect(
      developmentError({
        ...valid,
        start_date: "2026-11-13",
        due_date: "2026-11-13",
      }),
    ).toBeNull();
  });
  it("allows custom countries and personal multiline requirements", () => {
    const career = {
      ...emptyCareer,
      company: "Example",
      country: "Custom territory",
      position: "Engineer",
      market_requirements: "  Line 1\n\n• Line 2  ",
    };
    expect(careerError(career)).toBeNull();
    expect(careerError({ ...career, sort_order: 0.5 })).toBeTruthy();
    expect(careerError({ ...career, country: "  " })).toBeTruthy();
  });
  it("rejects executable, malformed and credential-bearing links", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,test",
      "//example.org",
      "https://a:b@example.org",
      "https://example.org/ x",
    ])
      expect(safeOpportunityUrl(url), url).toBe(false);
    expect(safeOpportunityUrl("https://example.org/careers?q=engineer")).toBe(
      true,
    );
  });
  it("treats search metacharacters as user text", () => {
    expect(literalSearch("  20%_team  ")).toBe("20\\%\\_team");
    expect(literalSearch("a".repeat(500))).toHaveLength(200);
  });
  it("limits navigation to Work and restores direct routes and workspace switching", () => {
    for (const category of [
      "personal_life",
      "university",
      "sports",
      "self_study",
    ])
      expect(
        tabsFor(category).some((tab) =>
          ["development", "career"].includes(tab.view),
        ),
      ).toBe(false);
    expect(tabsFor("work").map((tab) => tab.view)).toEqual(
      expect.arrayContaining([
        "matrix",
        "activities",
        "notes",
        "observations",
        "history",
        "development",
        "career",
      ]),
    );
    expect(
      routeState(workspacePath("space", "career", "target")),
    ).toMatchObject({
      workspaceId: "space",
      view: "career",
      careerId: "target",
    });
    expect(
      switchWorkspacePath("development", { id: "space", category: "work" }),
    ).toBe("/workspaces/space/development");
    expect(
      switchWorkspacePath("career", { id: "space", category: "sports" }),
    ).toBe("/workspaces/space");
  });
  it("translates dynamic labels in both supported locales", () => {
    for (const locale of ["pt-BR", "en-US"] as const) {
      const i18n = createI18n(locale);
      for (const label of [
        ...Object.values(careerRegions),
        ...Object.values(developmentStatuses),
        ...Object.values(planPriorities),
        ...Object.values(workModes),
      ])
        expect(i18n.exists(label), `${locale}: ${label}`).toBe(true);
    }
  });
});
