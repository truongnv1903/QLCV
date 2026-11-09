import type { Task } from "./types";
export const dateKey = (
  date: Date | string = new Date(),
  timezone = "Asia/Bangkok",
) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function weekStart(day: string) {
  const n = new Date(`${day}T12:00:00Z`).getUTCDay();
  return addDays(day, -((n + 6) % 7));
}
export function percent(done: number, total: number) {
  return total ? Math.round((done / total) * 100) : 0;
}
export function dueDay(task: Task, tz: string) {
  return task.due_at ? dateKey(task.due_at, tz) : null;
}
export function completion(tasks: Task[]) {
  return percent(tasks.filter((t) => t.status === "done").length, tasks.length);
}
export function weekTasks(tasks: Task[], start: string, tz: string) {
  return tasks.filter((t) => {
    const day = dueDay(t, tz);
    return day !== null && day >= start && day <= addDays(start, 6);
  });
}
export function streak(tasks: Task[], today: string, tz: string) {
  const days = new Set(
    tasks
      .filter((t) => t.status === "done" && t.completed_at)
      .map((t) => dateKey(t.completed_at!, tz)),
  );
  let day = days.has(today) ? today : addDays(today, -1);
  let result = 0;
  while (days.has(day)) {
    result++;
    day = addDays(day, -1);
  }
  return result;
}
export function formatDay(
  day: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" },
) {
  return new Intl.DateTimeFormat("vi-VN", {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}
export function timeLabel(date: string, tz: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  }).format(new Date(date));
}
export function toLocalInput(date: string | null, tz: string) {
  if (!date) return "";
  const f = new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(date));
  return f.replace(" ", "T");
}
export function zonedToISO(value: string, tz: string) {
  if (!value) return null;
  const wanted = new Date(`${value}:00Z`).getTime();
  let guess = wanted;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(new Date(guess));
    const shown = new Date(parts.replace(" ", "T") + "Z").getTime();
    guess += wanted - shown;
  }
  const iso = new Date(guess).toISOString();
  if (toLocalInput(iso, tz) !== value)
    throw new Error(
      "Giờ này không tồn tại trong múi giờ đã chọn. Vui lòng chọn giờ khác.",
    );
  return iso;
}
export function shiftDue(task: Task, day: string, tz: string) {
  const local = toLocalInput(task.due_at, tz);
  return zonedToISO(`${day}T${local ? local.slice(11, 16) : "09:00"}`, tz);
}

export function withinReminderWindow(
  dueAt: string,
  now: Date,
  beforeMinutes: number,
) {
  const remaining = new Date(dueAt).getTime() - now.getTime();
  // Allow one polling interval of delay, including reminders requested exactly at the deadline.
  return remaining >= -30000 && remaining <= beforeMinutes * 60000;
}
