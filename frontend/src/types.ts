export type Priority = "high" | "medium" | "low";
export interface User {
  id: string;
  name: string;
  email: string;
  created_at: string;
}
export interface Task {
  id: string;
  title: string;
  description: string;
  notes: string;
  status: "todo" | "done";
  priority: Priority;
  due_at: string | null;
  completed_at: string | null;
  year_goal_id: string | null;
  quarter_goal_id: string | null;
  month_plan_id: string | null;
  week_plan_id: string | null;
  created_at: string;
  updated_at: string;
}
export type Kind = "year" | "quarter" | "month" | "week";
export interface Plan {
  id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  status: "active" | "paused" | "completed";
  progress: number;
  why?: string;
  metric?: string;
  priority?: Priority;
  milestones?: string;
  focus?: string;
  outcome?: string;
  top_priorities?: string;
  year_goal_id?: string;
  quarter_goal_id?: string;
  month_plan_id?: string;
}
export interface Roadmap {
  year_goals: Plan[];
  quarter_goals: Plan[];
  month_plans: Plan[];
  week_plans: Plan[];
}
export interface Settings {
  enabled: boolean;
  daily_time: string;
  timezone: string;
  before_minutes: number;
}
export interface Review {
  id: string;
  week_start: string;
  summary: string;
  wins: string;
  improvements: string;
}
export interface PlannerInput {
  goal: string;
  deadline: string;
  metric: string;
  resources: string;
  hours_per_week: number;
  obstacles: string;
}
export interface PlannerPreview {
  title: string;
  summary: string;
  phases: string[];
  year_goal: Partial<Plan>;
  quarter_goals: Partial<Plan>[];
  month_plan: Partial<Plan>;
  week_plans: Partial<Plan>[];
  tasks: (Partial<Task> & { week_index?: number })[];
  risks: { risk: string; mitigation: string }[];
}
export const EMPTY_ROADMAP: Roadmap = {
  year_goals: [],
  quarter_goals: [],
  month_plans: [],
  week_plans: [],
};
export const DEFAULT_SETTINGS: Settings = {
  enabled: false,
  daily_time: "08:00",
  timezone: "Asia/Bangkok",
  before_minutes: 15,
};
export const priorityLabel: Record<Priority, string> = {
  high: "Cao",
  medium: "Trung bình",
  low: "Thấp",
};
export const kindLabel: Record<Kind, string> = {
  year: "Mục tiêu năm",
  quarter: "Kế hoạch quý",
  month: "Kế hoạch tháng",
  week: "Kế hoạch tuần",
};
