import { describe, it, expect } from "vitest";
import {
  addDays,
  weekStart,
  percent,
  dateKey,
  zonedToISO,
  toLocalInput,
  completion,
  streak,
  weekTasks,
  withinReminderWindow,
} from "./utils";
import type { Task } from "./types";
const task = (patch: Partial<Task>): Task => ({
  id: "a",
  title: "test",
  description: "",
  notes: "",
  status: "todo",
  priority: "medium",
  due_at: null,
  completed_at: null,
  year_goal_id: null,
  quarter_goal_id: null,
  month_plan_id: null,
  week_plan_id: null,
  created_at: "",
  updated_at: "",
  ...patch,
});
describe("calendar calculations", () => {
  it("delivers at-deadline reminders and excludes tasks outside the reminder window", () => {
    const now = new Date("2026-11-08T09:00:00Z");
    expect(withinReminderWindow("2026-11-08T08:59:50Z", now, 0)).toBe(true);
    expect(withinReminderWindow("2026-11-08T09:00:10Z", now, 0)).toBe(false);
    expect(withinReminderWindow("2026-11-08T09:14:00Z", now, 15)).toBe(true);
    expect(withinReminderWindow("2026-11-08T09:16:00Z", now, 15)).toBe(false);
    expect(withinReminderWindow("2026-11-08T08:00:00Z", now, 15)).toBe(false);
  });
  it("uses local timezone across midnight and Monday boundaries", () => {
    expect(dateKey("2026-11-08T18:00:00Z", "Asia/Bangkok")).toBe("2026-11-09");
    expect(weekStart("2026-11-08")).toBe("2026-11-02");
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("round-trips a date entered in the selected timezone", () => {
    const iso = zonedToISO("2026-11-08T09:30", "Asia/Bangkok");
    expect(iso).toBe("2026-11-08T02:30:00.000Z");
    expect(toLocalInput(iso, "Asia/Bangkok")).toBe("2026-11-08T09:30");
  });
  it("rejects nonexistent local time at DST transition", () => {
    expect(() => zonedToISO("2027-03-14T02:30", "America/New_York")).toThrow(
      "không tồn tại",
    );
  });
  it("handles a DST timezone", () => {
    expect(zonedToISO("2026-07-01T09:00", "America/New_York")).toBe(
      "2026-07-01T13:00:00.000Z",
    );
  });
});
describe("real task statistics", () => {
  it("does not report a fake percentage for empty data", () => {
    expect(percent(0, 0)).toBe(0);
    expect(completion([])).toBe(0);
    expect(completion([task({ status: "done" }), task({})])).toBe(50);
  });
  it("groups a week using deadline in settings timezone", () => {
    expect(
      weekTasks(
        [task({ due_at: "2026-11-08T18:00:00Z" })],
        "2026-11-09",
        "Asia/Bangkok",
      ),
    ).toHaveLength(1);
  });
  it("counts distinct consecutive completion days", () => {
    const tasks = [
      task({ status: "done", completed_at: "2026-11-08T02:00:00Z" }),
      task({ status: "done", completed_at: "2026-11-08T03:00:00Z" }),
      task({ status: "done", completed_at: "2026-11-07T02:00:00Z" }),
    ];
    expect(streak(tasks, "2026-11-08", "Asia/Bangkok")).toBe(2);
    expect(streak(tasks, "2026-11-09", "Asia/Bangkok")).toBe(2);
    expect(streak(tasks, "2026-11-10", "Asia/Bangkok")).toBe(0);
  });
});
