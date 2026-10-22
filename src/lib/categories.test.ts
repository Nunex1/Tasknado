import { describe, it, expect } from "vitest";
import {
  quadrant,
  priorityFor,
  isOverdue,
  type Activity,
  type WorkAttributes,
} from "./domain";
const work: WorkAttributes = {
  hasScheduledDate: false,
  scheduledDate: null,
  scheduledTime: null,
  isUrgent: null,
  isImportant: null,
};
describe("Workspace planning", () => {
  it("maps all independent priority choices, including partial classification", () => {
    for (const q of ["q1", "q2", "q3", "q4", "unclassified"] as const)
      expect(quadrant({ ...work, ...priorityFor(q) })).toBe(q);
    expect(quadrant({ ...work, isUrgent: true })).toBe("unclassified");
    expect(quadrant({ ...work, isImportant: false })).toBe("unclassified");
  });
  it("keeps scheduled dates independent of priority and treats date-only tasks as due through the local day", () => {
    const scheduled = {
      ...work,
      hasScheduledDate: true,
      scheduledDate: "2026-10-21",
    };
    const activity = {
      status: "in_progress",
      category_attributes: { work: scheduled },
    } as Activity;
    expect(quadrant(scheduled)).toBe("unclassified");
    expect(isOverdue(activity, new Date("2026-10-21T14:00:00"))).toBe(false);
    expect(isOverdue(activity, new Date("2026-10-22T00:00:00"))).toBe(true);
    expect(
      isOverdue(
        { ...activity, status: "completed" },
        new Date("2026-10-22T00:00:00"),
      ),
    ).toBe(false);
    expect(
      isOverdue(
        {
          ...activity,
          category_attributes: {
            work: { ...scheduled, scheduledTime: "13:00" },
          },
        },
        new Date("2026-10-21T14:00:00"),
      ),
    ).toBe(true);
  });
});
