import { describe, it, expect } from "vitest";
import type { User } from "@supabase/supabase-js";
import { routeState, workspacePath } from "./navigation";
import { avatarForeground, userProfile } from "./user-profile";
import { isStarted, Status } from "./domain";
describe("Desktop contracts", () => {
  it("keeps open and started/unfinished counts exclusive, including paused execution", () => {
    const states: Status[] = [
      "not_started",
      "in_progress",
      "paused",
      "completed",
    ];
    expect(states.filter(isStarted)).toEqual(["in_progress", "paused"]);
    expect(states.filter((s) => s === "not_started" && isStarted(s))).toEqual(
      [],
    );
  });
  it("restores workspace, activity and notebook context directly from URLs", () => {
    expect(routeState("/")).toMatchObject({
      workspaceId: null,
      view: "dashboard",
      activityId: null,
    });
    expect(
      routeState(workspacePath("work", "activities", "activity")),
    ).toMatchObject({
      workspaceId: "work",
      view: "activities",
      activityId: "activity",
    });
    expect(routeState(workspacePath("work", "notes", "note"))).toMatchObject({
      workspaceId: "work",
      view: "notes",
      noteId: "note",
    });
    expect(routeState("/workspaces")).toMatchObject({
      workspaceId: null,
      view: "workspaces",
    });
  });
  it("uses nickname and custom accented initial without changing the saved name", () => {
    const result = userProfile({
      id: "desktop-user",
      aud: "authenticated",
      created_at: "2026-10-22T12:00:00Z",
      app_metadata: {},
      email: "a@test.invalid",
      user_metadata: {
        full_name: "Ana",
        nickname: "Mar",
        avatar_initial: "é",
        avatar_color: "#ffffff",
      },
    } as User);
    expect(result).toMatchObject({
      name: "Ana",
      displayName: "Mar",
      initial: "É",
      color: "#ffffff",
    });
    expect(
      userProfile({
        id: "desktop-user",
        aud: "authenticated",
        created_at: "2026-10-22T12:00:00Z",
        app_metadata: {},
        user_metadata: {
          full_name: "Ana",
          nickname: "Mar",
          avatar_initial: "12",
        },
      } as User).initial,
    ).toBe("M");
  });
  it("chooses at least 4.5:1 text contrast throughout the RGB cube sample", () => {
    const linear = (v: number) =>
      v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    for (let r = 0; r <= 255; r += 17)
      for (let g = 0; g <= 255; g += 17)
        for (let b = 0; b <= 255; b += 17) {
          const color =
            "#" +
            [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
          const lum =
            linear(r / 255) * 0.2126 +
            linear(g / 255) * 0.7152 +
            linear(b / 255) * 0.0722;
          const ratio =
            avatarForeground(color) === "#000000"
              ? (lum + 0.05) / 0.05
              : 1.05 / (lum + 0.05);
          expect(ratio).toBeGreaterThanOrEqual(4.5);
        }
  });
});
