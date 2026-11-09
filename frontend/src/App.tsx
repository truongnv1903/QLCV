import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Plus,
  Sun,
  Map,
  CalendarDays,
  CheckCheck,
  BarChart3,
  Settings2,
  Search,
  Bell,
  ChevronRight,
  ChevronLeft,
  Check,
  LogOut,
  Sparkles,
  Target,
  Flame,
  Compass,
  Clock3,
  Menu,
  X,
  Moon,
  Flag,
  Leaf,
  AlertCircle,
  LoaderCircle,
  Mail,
} from "lucide-react";
import { api, ApiError } from "./api";
import type {
  Task,
  Roadmap,
  User,
  Settings,
  Review,
  Kind,
  Plan,
  Priority,
  PlannerInput,
  PlannerPreview,
} from "./types";
import { EMPTY_ROADMAP, DEFAULT_SETTINGS, priorityLabel } from "./types";
import {
  addDays,
  weekStart,
  dateKey,
  completion,
  dueDay,
  formatDay,
  percent,
  streak,
  weekTasks,
  shiftDue,
  timeLabel,
  withinReminderWindow,
} from "./utils";
import {
  Brand,
  Spinner,
  Progress,
  Empty,
  Modal,
  Confirm,
  TaskEditor,
  TaskRow,
  PlanEditor,
  PlanTree,
} from "./components";

type Page =
  "today" | "roadmap" | "week" | "tasks" | "stats" | "settings" | "profile";
const NAV: { id: Page; label: string; icon: typeof Sun }[] = [
  { id: "today", label: "Hôm nay", icon: Sun },
  { id: "roadmap", label: "Roadmap", icon: Map },
  { id: "week", label: "Kế hoạch tuần", icon: CalendarDays },
  { id: "tasks", label: "Tất cả công việc", icon: CheckCheck },
  { id: "stats", label: "Thống kê", icon: BarChart3 },
];
const TITLES: Record<Page, string> = {
  today: "Hôm nay",
  roadmap: "Roadmap của bạn",
  week: "Kế hoạch tuần",
  tasks: "Tất cả công việc",
  stats: "Thống kê tiến độ",
  settings: "Cài đặt",
  profile: "Hồ sơ cá nhân",
};
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [boot, setBoot] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [roadmap, setRoadmap] = useState<Roadmap>(EMPTY_ROADMAP);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [page, setPage] = useState<Page>("today");
  const [toast, setToast] = useState("");
  const [mobile, setMobile] = useState(false);
  const [taskEditor, setTaskEditor] = useState<{
    task?: Task;
    date?: string;
  } | null>(null);
  const [planEditor, setPlanEditor] = useState<{
    kind: Kind;
    plan?: Plan;
    parentId?: string;
  } | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    detail: string;
    fn: () => Promise<void>;
  } | null>(null);
  const [planner, setPlanner] = useState(false);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("laban-theme") || "light",
  );
  const [clock, setClock] = useState(() => new Date());
  const sessionVersion = useRef(0);
  const today = dateKey(clock, settings.timezone);
  const start = weekStart(today);
  const week = weekTasks(tasks, start, settings.timezone);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("laban-theme", theme);
  }, [theme]);
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  const load = useCallback(async () => {
    const generation = sessionVersion.current;
    setError("");
    setLoading(true);
    try {
      const [t, r, s, w] = await Promise.all([
        api<Task[]>("/tasks"),
        api<Roadmap>("/roadmap"),
        api<Settings>("/settings/reminders"),
        api<Review[]>("/reviews"),
      ]);
      if (generation !== sessionVersion.current) return;
      setTasks(t);
      setRoadmap(r);
      setSettings(s);
      setReviews(w);
    } catch (err) {
      if (generation !== sessionVersion.current) return;
      if (err instanceof ApiError && err.status === 401) {
        sessionVersion.current++;
        setUser(null);
        setTasks([]);
        setRoadmap(EMPTY_ROADMAP);
        setReviews([]);
        setSettings(DEFAULT_SETTINGS);
        setTaskEditor(null);
        setPlanEditor(null);
        setConfirm(null);
        setPlanner(false);
      } else setError((err as Error).message);
    } finally {
      if (generation === sessionVersion.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    let alive = true;
    api<User>("/auth/me")
      .then((u) => {
        if (alive) {
          setUser(u);
          void load();
        }
      })
      .catch((err) => {
        if (alive && !(err instanceof ApiError && err.status === 401))
          setError((err as Error).message);
      })
      .finally(() => {
        if (alive) setBoot(false);
      });
    return () => {
      alive = false;
    };
  }, [load]);
  async function action(fn: () => Promise<unknown>, message?: string) {
    const generation = sessionVersion.current;
    try {
      await fn();
      if (generation !== sessionVersion.current) return;
      await load();
      if (message) setToast(message);
    } catch (err) {
      if (generation !== sessionVersion.current) return;
      if (err instanceof ApiError && err.status === 401) {
        sessionVersion.current++;
        setUser(null);
        setTasks([]);
        setRoadmap(EMPTY_ROADMAP);
        setReviews([]);
        setSettings(DEFAULT_SETTINGS);
        setTaskEditor(null);
        setPlanEditor(null);
        setConfirm(null);
        setPlanner(false);
        notificationKeys.current.clear();
      }
      setToast((err as Error).message);
      throw err;
    }
  }
  async function safeAction(fn: () => Promise<unknown>, message?: string) {
    try {
      await action(fn, message);
    } catch {
      /* error shown in toast */
    }
  }
  const navigate = (p: Page) => {
    setPage(p);
    setMobile(false);
    window.scrollTo(0, 0);
  };
  const toggle = (task: Task) =>
    void safeAction(
      () =>
        api(`/tasks/${task.id}`, "PATCH", {
          status: task.status === "done" ? "todo" : "done",
        }),
      task.status === "done"
        ? "Đã chuyển về chưa hoàn thành."
        : "Thêm một bước tiến. Làm tốt lắm!",
    );
  const move = (task: Task, offset: number) =>
    void safeAction(
      () =>
        api(`/tasks/${task.id}`, "PATCH", {
          due_at: shiftDue(task, addDays(today, offset), settings.timezone),
        }),
      "Đã chuyển lịch công việc.",
    );
  const deleteTask = (task: Task) =>
    setConfirm({
      title: "Xóa công việc?",
      detail: `“${task.title}” sẽ bị xóa vĩnh viễn.`,
      fn: () =>
        action(() => api(`/tasks/${task.id}`, "DELETE"), "Đã xóa công việc."),
    });
  const deletePlan = (plan: Plan, kind: Kind) =>
    setConfirm({
      title: "Xóa kế hoạch?",
      detail: `Xóa “${plan.title}” và các kế hoạch con. Công việc được giữ lại và gỡ liên kết.`,
      fn: () =>
        action(
          () => api(`/roadmap/${kind}/${plan.id}`, "DELETE"),
          "Đã xóa kế hoạch.",
        ),
    });
  const taskProps = {
    roadmap,
    tz: settings.timezone,
    onToggle: toggle,
    onEdit: (t: Task) => setTaskEditor({ task: t }),
    onDelete: deleteTask,
    onMove: move,
  };
  const seed = () =>
    void safeAction(
      () => api("/demo/seed", "POST"),
      "Không gian mẫu đã sẵn sàng. Dữ liệu này chỉ thuộc tài khoản của bạn.",
    );
  const notificationKeys = useRef(new Set<string>());
  useEffect(() => {
    if (
      !user ||
      !settings.enabled ||
      typeof Notification === "undefined" ||
      Notification.permission !== "granted"
    )
      return;
    function notify(title: string, options: NotificationOptions) {
      try {
        new Notification(title, options);
      } catch {
        setToast(
          "Trình duyệt chưa thể hiển thị thông báo. Hãy kiểm tra quyền thông báo.",
        );
      }
    }
    function check() {
      const now = new Date();
      const day = dateKey(now, settings.timezone);
      const localTime = timeLabel(now.toISOString(), settings.timezone);
      const dailyKey = `daily:${user!.id}:${day}`;
      if (
        localTime === settings.daily_time &&
        !notificationKeys.current.has(dailyKey)
      ) {
        notificationKeys.current.add(dailyKey);
        const count = tasks.filter(
          (t) => t.status === "todo" && dueDay(t, settings.timezone) === day,
        ).length;
        notify("La Bàn Công Việc", {
          body: count
            ? `Bạn có ${count} việc hôm nay. Bắt đầu bằng một bước nhỏ nhé.`
            : "Một ngày mới, một bước tiến mới. Cùng lên kế hoạch hôm nay nhé.",
          icon: "/compass.svg",
        });
      }
      for (const t of tasks) {
        if (t.status === "done" || !t.due_at) continue;
        const key = `task:${user!.id}:${t.id}:${t.due_at}:${settings.before_minutes}`;
        if (
          withinReminderWindow(t.due_at, now, settings.before_minutes) &&
          !notificationKeys.current.has(key)
        ) {
          notificationKeys.current.add(key);
          notify("Sắp đến giờ rồi", {
            body: t.title,
            icon: "/compass.svg",
          });
        }
      }
    }
    check();
    const timer = setInterval(check, 15000);
    return () => clearInterval(timer);
  }, [user, settings, tasks]);
  async function logout() {
    try {
      await api("/auth/logout", "POST");
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        setToast((err as Error).message);
        return;
      }
    }
    sessionVersion.current++;
    setUser(null);
    setSettings(DEFAULT_SETTINGS);
    setTaskEditor(null);
    setPlanEditor(null);
    setConfirm(null);
    setPlanner(false);
    setTasks([]);
    setRoadmap(EMPTY_ROADMAP);
    setReviews([]);
    notificationKeys.current.clear();
    setPage("today");
  }
  if (boot) return <Spinner />;
  if (!user)
    return (
      <>
        <Auth
          onAuth={async (u) => {
            sessionVersion.current++;
            setTasks([]);
            setRoadmap(EMPTY_ROADMAP);
            setSettings(DEFAULT_SETTINGS);
            setReviews([]);
            setTaskEditor(null);
            setPlanEditor(null);
            setConfirm(null);
            setPlanner(false);
            setError("");
            setUser(u);
            setPage("today");
            await load();
          }}
          globalError={error}
        />
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </>
    );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Đến nội dung chính
      </a>
      {mobile && (
        <button
          className="sidebar-backdrop"
          aria-label="Đóng bảng điều hướng"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-close"
            aria-label="Đóng menu"
            onClick={() => setMobile(false)}
          >
            <X />
          </button>
        </div>
        <div className="workspace-label">
          <span className="workspace-dot" /> KHÔNG GIAN CÁ NHÂN
        </div>
        <nav aria-label="Điều hướng chính">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              onClick={() => navigate(id)}
            >
              <Icon size={19} strokeWidth={1.65} />
              <span>{label}</span>
              {id === "today" &&
                tasks.filter(
                  (t) =>
                    dueDay(t, settings.timezone) === today &&
                    t.status === "todo",
                ).length > 0 && (
                  <small>
                    {
                      tasks.filter(
                        (t) =>
                          dueDay(t, settings.timezone) === today &&
                          t.status === "todo",
                      ).length
                    }
                  </small>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-tip">
          <span className="tip-icon">
            <Leaf size={21} />
          </span>
          <p>
            Đi chậm cũng được.
            <br />
            <strong>Miễn là đúng hướng.</strong>
          </p>
          <span>Mỗi bước nhỏ đều có ý nghĩa.</span>
        </div>
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${page === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
          >
            <Settings2 size={19} />
            Cài đặt
          </button>
          <button
            className={`user-card ${page === "profile" ? "selected" : ""}`}
            aria-label={`Hồ sơ của ${user.name}`}
            onClick={() => navigate("profile")}
          >
            <span className="avatar">{user.name.charAt(0).toUpperCase()}</span>
            <span>
              <strong>{user.name}</strong>
              <small>Hành trình của bạn</small>
            </span>
            <ChevronRight size={17} />
          </button>
        </div>
      </aside>
      <div className="app-content">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button menu-toggle"
              aria-label="Mở menu"
              onClick={() => setMobile(true)}
            >
              <Menu size={22} />
            </button>
            <span>Không gian của bạn</span>
            <ChevronRight size={13} />
            <strong>{TITLES[page]}</strong>
          </div>
          <div className="topbar-right">
            <span className="today-label">
              <CalendarDays size={14} />
              {formatDay(today, {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
            </span>
            <button
              className="icon-button"
              onClick={() => navigate("settings")}
              aria-label="Cài đặt nhắc việc"
            >
              <Bell size={19} />
              {settings.enabled && <i className="notification-dot" />}
            </button>
            <span className="avatar small">
              {user.name.charAt(0).toUpperCase()}
            </span>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button className="text-button" onClick={() => void load()}>
                Thử lại
              </button>
            </div>
          )}
          {loading && (
            <div className="refresh-indicator" aria-label="Đang cập nhật">
              <LoaderCircle className="spin" size={16} />
            </div>
          )}
          {page === "today" && (
            <Today
              user={user}
              tasks={tasks}
              roadmap={roadmap}
              today={today}
              tz={settings.timezone}
              week={week}
              taskProps={taskProps}
              onAdd={() => setTaskEditor({ date: today })}
              onPlanner={() => setPlanner(true)}
              onPage={navigate}
              onSeed={seed}
            />
          )}
          {page === "tasks" && (
            <Tasks
              tasks={tasks}
              taskProps={taskProps}
              onAdd={() => setTaskEditor({ date: today })}
            />
          )}
          {page === "roadmap" && (
            <section className="page">
              <PageHeading
                eyebrow="NHÌN XA · ĐI TỪNG BƯỚC"
                title="Từ mục tiêu đến hành động."
                description="Một hướng đi rõ ràng cho những điều quan trọng với bạn."
                action={
                  <>
                    <button
                      className="button secondary"
                      onClick={() => setPlanner(true)}
                    >
                      <Sparkles size={16} />
                      Gợi ý kế hoạch
                    </button>
                    <button
                      className="button"
                      onClick={() => setPlanEditor({ kind: "year" })}
                    >
                      <Plus size={17} />
                      Mục tiêu năm
                    </button>
                  </>
                }
              />
              <div className="roadmap-flow">
                {[
                  "Mục tiêu năm",
                  "Kế hoạch quý",
                  "Kế hoạch tháng",
                  "Kế hoạch tuần",
                  "Việc mỗi ngày",
                ].map((x, i) => (
                  <span key={x}>
                    <b>{String(i + 1).padStart(2, "0")}</b>
                    {x}
                    {i < 4 && <ArrowRight size={14} />}
                  </span>
                ))}
              </div>
              {roadmap.year_goals.length ? (
                <div className="roadmap-tree">
                  {roadmap.year_goals.map((g) => (
                    <PlanTree
                      key={g.id}
                      plan={g}
                      kind="year"
                      roadmap={roadmap}
                      onCreate={(kind, parentId) =>
                        setPlanEditor({ kind, parentId })
                      }
                      onEdit={(plan, kind) => setPlanEditor({ kind, plan })}
                      onDelete={deletePlan}
                    />
                  ))}
                </div>
              ) : (
                <div className="panel">
                  <Empty
                    title="Hành trình bắt đầu bằng một mục tiêu."
                    detail="Thêm mục tiêu năm đầu tiên, hoặc để La Bàn gợi ý những bước đi phù hợp với bạn."
                    action={
                      <button
                        className="button"
                        onClick={() => setPlanEditor({ kind: "year" })}
                      >
                        <Plus size={16} />
                        Tạo mục tiêu đầu tiên
                      </button>
                    }
                  />
                </div>
              )}
            </section>
          )}
          {page === "week" && (
            <Week
              tasks={tasks}
              roadmap={roadmap}
              today={today}
              tz={settings.timezone}
              reviews={reviews}
              taskProps={taskProps}
              onAdd={(date) => setTaskEditor({ date })}
              onSaveReview={async (day, body) => {
                await action(
                  () => api(`/reviews/${day}`, "PUT", body),
                  "Đã lưu tổng kết tuần.",
                );
              }}
            />
          )}
          {page === "stats" && (
            <Stats
              tasks={tasks}
              roadmap={roadmap}
              today={today}
              tz={settings.timezone}
            />
          )}
          {page === "settings" && (
            <SettingsPage
              settings={settings}
              theme={theme}
              setTheme={setTheme}
              onSave={async (s) => {
                await action(
                  () => api("/settings/reminders", "PUT", s),
                  "Đã lưu cài đặt nhắc việc.",
                );
              }}
            />
          )}
          {page === "profile" && (
            <Profile
              user={user}
              onSave={async (name) => {
                const generation = sessionVersion.current;
                const u = await api<User>("/profile", "PATCH", { name });
                if (generation !== sessionVersion.current) return;
                setUser(u);
                setToast("Đã cập nhật hồ sơ.");
              }}
              onLogout={() => void logout()}
            />
          )}
          <footer className="app-footer">
            <Compass size={13} />
            <span>Mỗi ngày một bước tiến.</span>
            <span>La Bàn Công Việc</span>
          </footer>
        </main>
      </div>
      {taskEditor && (
        <TaskEditor
          task={taskEditor.task}
          initialDate={taskEditor.date}
          roadmap={roadmap}
          tz={settings.timezone}
          onClose={() => setTaskEditor(null)}
          onSave={async (body) => {
            await action(
              () =>
                api(
                  taskEditor.task ? `/tasks/${taskEditor.task.id}` : "/tasks",
                  taskEditor.task ? "PATCH" : "POST",
                  body,
                ),
              "Đã lưu công việc.",
            );
          }}
        />
      )}
      {planEditor && (
        <PlanEditor
          {...planEditor}
          roadmap={roadmap}
          onClose={() => setPlanEditor(null)}
          onSave={async (body) => {
            await action(
              () =>
                api(
                  `/roadmap/${planEditor.kind}${planEditor.plan ? `/${planEditor.plan.id}` : ""}`,
                  planEditor.plan ? "PATCH" : "POST",
                  body,
                ),
              "Đã lưu kế hoạch.",
            );
          }}
        />
      )}
      {confirm && (
        <Confirm
          title={confirm.title}
          detail={confirm.detail}
          onClose={() => setConfirm(null)}
          onConfirm={confirm.fn}
        />
      )}{" "}
      {planner && (
        <Planner
          onClose={() => setPlanner(false)}
          onApply={async (input) => {
            await action(
              () => api("/planner/apply", "POST", input),
              "Đã thêm roadmap mới. Bắt đầu hành trình thôi!",
            );
            setPlanner(false);
            setPage("roadmap");
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button
            className="icon-button mini"
            aria-label="Đóng thông báo"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="heading-actions">{action}</div>}
    </div>
  );
}
function Auth({
  onAuth,
  globalError,
}: {
  onAuth: (user: User) => Promise<void>;
  globalError: string;
}) {
  const resetParams = new URLSearchParams(window.location.search);
  const resetToken = resetParams.get("reset_token") || resetParams.get("token");
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">(
    resetToken ? "reset" : "login",
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      if (mode === "login" || mode === "register") {
        const body =
          mode === "register"
            ? {
                name: f.get("name"),
                email: f.get("email"),
                password: f.get("password"),
              }
            : { email: f.get("email"), password: f.get("password") };
        await onAuth(await api<User>(`/auth/${mode}`, "POST", body));
      } else {
        const body =
          mode === "forgot"
            ? { email: f.get("email") }
            : { token: resetToken, password: f.get("password") };
        const r = await api<{ message: string }>(
          `/auth/${mode === "forgot" ? "forgot-password" : "reset-password"}`,
          "POST",
          body,
        );
        setMessage(r.message);
        if (mode === "reset") {
          window.history.replaceState({}, "", window.location.pathname);
          setMode("login");
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function change(m: typeof mode) {
    setMode(m);
    setError("");
    setMessage("");
  }
  return (
    <div className="auth-shell">
      <section className="auth-story">
        <Brand />
        <div className="auth-story-content">
          <span className="auth-pill">
            <span /> MỖI NGÀY MỘT BƯỚC TIẾN
          </span>
          <h1>
            Biết mình đi đâu.
            <br />
            <em>Bắt đầu từ hôm nay.</em>
          </h1>
          <p>
            Biến những mục tiêu lớn thành bước đi nhỏ.
            <br />
            Dành thời gian cho điều thật sự quan trọng.
          </p>
          <div className="compass-art" aria-hidden="true">
            <div className="orbit outer" />
            <div className="orbit inner" />
            <span className="north">N</span>
            <span className="east">E</span>
            <span className="south">S</span>
            <span className="west">W</span>
            <div className="needle" />
            <div className="needle-center" />
            <div className="orbit-label">
              <span />
              <span>Một hướng đi. Ngàn bước nhỏ.</span>
            </div>
          </div>
        </div>
        <span className="auth-copyright">
          © {new Date().getFullYear()} La Bàn Công Việc · Không gian cho hành
          trình của bạn
        </span>
      </section>
      <section className="auth-form-section">
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        <div className="auth-form">
          <div className="eyebrow">HÀNH TRÌNH CỦA RIÊNG BẠN</div>
          <h2>
            {mode === "login"
              ? "Chào mừng bạn trở lại."
              : mode === "register"
                ? "Một khởi đầu mới."
                : mode === "forgot"
                  ? "Tìm lại lối vào."
                  : "Đặt lại mật khẩu."}
          </h2>
          <p>
            {mode === "login"
              ? "Cùng tiếp tục những điều bạn đang theo đuổi."
              : mode === "register"
                ? "Tạo tài khoản và vẽ hướng đi của riêng bạn."
                : mode === "forgot"
                  ? "Nhập email để nhận hướng dẫn đặt lại mật khẩu."
                  : "Chọn một mật khẩu mới để tiếp tục hành trình."}
          </p>
          {(mode === "login" || mode === "register") && (
            <div className="auth-tabs">
              <button
                className={mode === "login" ? "selected" : ""}
                onClick={() => change("login")}
              >
                Đăng nhập
              </button>
              <button
                className={mode === "register" ? "selected" : ""}
                onClick={() => change("register")}
              >
                Đăng ký tài khoản
              </button>
            </div>
          )}
          <form onSubmit={submit}>
            {mode === "register" && (
              <label>
                Tên của bạn
                <input
                  name="name"
                  autoComplete="name"
                  placeholder="Bạn muốn được gọi là gì?"
                  required
                  minLength={2}
                  maxLength={100}
                />
              </label>
            )}
            {mode !== "reset" && (
              <label>
                Địa chỉ email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="ban@email.com"
                  required
                  maxLength={254}
                />
              </label>
            )}
            {mode !== "forgot" && (
              <label>
                Mật khẩu
                <input
                  name="password"
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  required
                  minLength={mode === "login" ? 1 : 10}
                  maxLength={128}
                  placeholder={
                    mode === "login"
                      ? "Nhập mật khẩu của bạn"
                      : "Ít nhất 10 ký tự"
                  }
                />
              </label>
            )}
            {mode === "login" && (
              <button
                className="forgot-link"
                type="button"
                onClick={() => change("forgot")}
              >
                Quên mật khẩu?
              </button>
            )}
            {(error || globalError) && (
              <p className="error" role="alert">
                {error || globalError}
              </p>
            )}
            {message && (
              <p className="success" role="status">
                <Mail size={16} />
                {message}
              </p>
            )}
            <button className="button auth-submit" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={18} />
              ) : mode === "login" ? (
                "Bắt đầu ngày mới"
              ) : mode === "register" ? (
                "Tạo tài khoản"
              ) : (
                "Gửi yêu cầu"
              )}
              {!busy && <ArrowRight size={18} />}
            </button>
          </form>
          {(mode === "forgot" || mode === "reset") && (
            <button
              className="text-button back-login"
              onClick={() => change("login")}
            >
              <ArrowLeft size={15} />
              Quay lại đăng nhập
            </button>
          )}
          <div className="auth-note">
            <span className="tiny-shield">
              <Check size={12} />
            </span>
            Dữ liệu riêng tư. Hành trình của riêng bạn.
          </div>
        </div>
        <div className="auth-bottom-note">
          Từng bước nhỏ hôm nay, một tương lai khác ngày mai.
        </div>
      </section>
    </div>
  );
}

type TaskProps = Omit<Parameters<typeof TaskRow>[0], "task">;
function Today({
  user,
  tasks,
  roadmap,
  today,
  tz,
  week,
  taskProps,
  onAdd,
  onPlanner,
  onPage,
  onSeed,
}: {
  user: User;
  tasks: Task[];
  roadmap: Roadmap;
  today: string;
  tz: string;
  week: Task[];
  taskProps: TaskProps;
  onAdd: () => void;
  onPlanner: () => void;
  onPage: (p: Page) => void;
  onSeed: () => void;
}) {
  const [tab, setTab] = useState<"today" | "overdue" | "upcoming">("today");
  const dayTasks = tasks.filter((t) => dueDay(t, tz) === today);
  const late = tasks.filter(
    (t) => t.status === "todo" && t.due_at && new Date(t.due_at) < new Date(),
  );
  const upcoming = tasks.filter(
    (t) =>
      t.status === "todo" &&
      dueDay(t, tz) !== null &&
      dueDay(t, tz)! > today &&
      dueDay(t, tz)! <= addDays(today, 7),
  );
  const shown =
    tab === "today" ? dayTasks : tab === "overdue" ? late : upcoming;
  const sorted = [...shown].sort(
    (a, b) =>
      Number(a.status === "done") - Number(b.status === "done") ||
      { high: 0, medium: 1, low: 2 }[a.priority] -
        { high: 0, medium: 1, low: 2 }[b.priority],
  );
  const goal = [...roadmap.year_goals]
    .filter((g) => g.status === "active")
    .sort(
      (a, b) =>
        ({ high: 0, medium: 1, low: 2 })[a.priority || "medium"] -
        { high: 0, medium: 1, low: 2 }[b.priority || "medium"],
    )[0];
  const quarter = roadmap.quarter_goals.find(
    (g) =>
      g.year_goal_id === goal?.id &&
      g.start_date <= today &&
      g.end_date >= today,
  );
  const next = [...tasks]
    .filter((t) => t.status === "todo")
    .sort(
      (a, b) =>
        ({ high: 0, medium: 1, low: 2 })[a.priority] -
          { high: 0, medium: 1, low: 2 }[b.priority] ||
        (a.due_at || "z").localeCompare(b.due_at || "z"),
    )[0];
  const done = dayTasks.filter((t) => t.status === "done").length;
  const dayName = formatDay(today, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return (
    <section className="page today-page">
      <PageHeading
        eyebrow={dayName.toLocaleUpperCase("vi")}
        title={`Chào ${user.name.split(" ").filter(Boolean).pop()}, một ngày mới!`}
        description="Không cần làm tất cả. Chỉ cần tiến một bước đúng hướng."
        action={
          <button className="button" onClick={onAdd}>
            <Plus size={18} />
            Thêm công việc
          </button>
        }
      />
      <div className="daily-hero">
        <div className="hero-content">
          <span className="hero-eyebrow">
            <span /> LA BÀN CỦA BẠN
          </span>
          <h2>
            {goal ? (
              goal.title
            ) : (
              <>
                Mỗi hành trình lớn
                <br />
                bắt đầu từ một bước nhỏ.
              </>
            )}
          </h2>
          <p>
            {goal
              ? goal.why ||
                goal.description ||
                "Tập trung vào điều quan trọng, từng chút một mỗi ngày."
              : "Đặt một mục tiêu có ý nghĩa. La Bàn sẽ giúp bạn tìm ra bước tiếp theo."}
          </p>
          <button
            onClick={() => (goal ? onPage("roadmap") : onPlanner())}
            className="hero-link"
          >
            {goal ? "Xem hành trình của bạn" : "Vẽ hướng đi đầu tiên"}
            <ArrowUpRight size={17} />
          </button>
        </div>
        <div className="hero-compass" aria-hidden="true">
          <div className="hero-compass-ring">
            <span>N</span>
            <Compass size={100} strokeWidth={0.55} />
            <b>S</b>
          </div>
          <i className="hero-orbit" />
        </div>
        <div className="hero-progress">
          <span>TIẾN ĐỘ MỤC TIÊU NĂM</span>
          <div>
            <strong>
              {goal?.progress || 0}
              <small>%</small>
            </strong>
            <span>
              {goal ? "Từng bước đến đích" : "Một khởi đầu đầy tiềm năng"}
            </span>
          </div>
          <Progress value={goal?.progress || 0} />
          {quarter && (
            <small>
              Quý hiện tại <b>{quarter.progress}%</b>
            </small>
          )}
        </div>
      </div>
      <div className="stat-cards">
        <Stat
          icon={<CheckCheck size={21} />}
          title="Việc hôm nay"
          value={`${done}`}
          suffix={`/ ${dayTasks.length}`}
          note={
            dayTasks.length
              ? `${dayTasks.length - done} việc đang chờ bạn`
              : "Sẵn sàng cho một ngày mới"
          }
          color="green"
        />
        <Stat
          icon={<CalendarDays size={21} />}
          title="Tiến độ tuần"
          value={`${completion(week)}`}
          suffix="%"
          note={`${week.filter((t) => t.status === "done").length} / ${week.length} công việc hoàn thành`}
          color="blue"
        />
        <Stat
          icon={<Flame size={21} />}
          title="Chuỗi ngày nỗ lực"
          value={`${streak(tasks, today, tz)}`}
          suffix="ngày"
          note="Mỗi ngày đều có ý nghĩa"
          color="orange"
        />
      </div>
      <div className="dashboard-columns">
        <div className="dashboard-main">
          <section className="panel task-panel">
            <div className="panel-heading">
              <h2>
                Công việc của bạn{" "}
                <span className="count-badge">{dayTasks.length}</span>
              </h2>
              <button className="text-button" onClick={() => onPage("tasks")}>
                Xem tất cả
                <ArrowUpRight size={15} />
              </button>
            </div>
            <div className="tabs task-tabs">
              <button
                className={tab === "today" ? "active" : ""}
                onClick={() => setTab("today")}
              >
                Hôm nay <span>{dayTasks.length}</span>
              </button>
              <button
                className={tab === "overdue" ? "active" : ""}
                onClick={() => setTab("overdue")}
              >
                Quá hạn{" "}
                {late.length > 0 && (
                  <span className="late-count">{late.length}</span>
                )}
              </button>
              <button
                className={tab === "upcoming" ? "active" : ""}
                onClick={() => setTab("upcoming")}
              >
                Sắp đến hạn
              </button>
            </div>
            {sorted.length ? (
              <div className="task-list">
                {sorted.map((task) => (
                  <TaskRow key={task.id} task={task} {...taskProps} />
                ))}
              </div>
            ) : (
              <Empty
                title={
                  tab === "today"
                    ? "Một ngày còn nhiều khả năng."
                    : tab === "overdue"
                      ? "Không có công việc quá hạn."
                      : "Bạn đã có khoảng trống phía trước."
                }
                detail={
                  tab === "today"
                    ? "Chọn một việc nhỏ để bắt đầu ngày mới."
                    : "Hãy giữ nhịp độ phù hợp với bạn."
                }
                action={
                  tab === "today" ? (
                    <button className="text-button" onClick={onAdd}>
                      <Plus size={15} />
                      Thêm việc đầu tiên
                    </button>
                  ) : undefined
                }
              />
            )}
            <button className="add-task-inline" onClick={onAdd}>
              <Plus size={17} />
              Thêm một công việc mới
            </button>
          </section>
          <section className="panel weekly-panel">
            <div className="panel-heading">
              <h2>Nhịp điệu tuần này</h2>
              <button className="text-button" onClick={() => onPage("week")}>
                Xem tuần
                <ArrowUpRight size={15} />
              </button>
            </div>
            <div className="week-rhythm">
              {Array.from({ length: 7 }, (_, i) => {
                const day = addDays(weekStart(today), i);
                const items = tasks.filter((t) => dueDay(t, tz) === day);
                const count = items.filter((t) => t.status === "done").length;
                return (
                  <div key={day} className={day === today ? "is-today" : ""}>
                    <span>{i === 6 ? "CN" : `T${i + 2}`}</span>
                    <div className="rhythm-bar">
                      <i
                        style={{
                          height: items.length
                            ? `${Math.max(8, percent(count, Math.max(...Array.from({ length: 7 }, (_, j) => tasks.filter((t) => dueDay(t, tz) === addDays(weekStart(today), j)).length), 1)))}%`
                            : "4%",
                        }}
                      />
                    </div>
                    <strong>{day.slice(-2)}</strong>
                    <small>
                      {count}/{items.length}
                    </small>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
        <aside className="dashboard-aside">
          <section className="next-card">
            <span className="eyebrow">
              <Sparkles size={14} /> BƯỚC TIẾP THEO
            </span>
            <h3>{next ? "Một việc nên làm ngay." : "Bạn muốn đi đến đâu?"}</h3>
            <p>
              {next
                ? "Ưu tiên một bước cụ thể để giữ nhịp hành trình."
                : "Từ một ý tưởng lớn, tìm ra những việc bạn có thể bắt đầu hôm nay."}
            </p>
            {next ? (
              <>
                <div className="next-task">
                  <span className={`priority ${next.priority}`}>
                    <Flag size={12} />
                    {priorityLabel[next.priority]}
                  </span>
                  <h4>{next.title}</h4>
                  {next.due_at && (
                    <small>
                      <Clock3 size={12} />
                      {formatDay(dueDay(next, tz)!)} ·{" "}
                      {timeLabel(next.due_at, tz)}
                    </small>
                  )}
                </div>
                <button
                  className="button light"
                  onClick={() => taskProps.onEdit(next)}
                >
                  Bắt đầu từ đây
                  <ArrowRight size={16} />
                </button>
              </>
            ) : (
              <button className="button light" onClick={onPlanner}>
                Gợi ý kế hoạch
                <ArrowRight size={16} />
              </button>
            )}
            <small className="rule-note">
              Gợi ý dựa trên độ ưu tiên & thời hạn.
            </small>
          </section>
          <section className="quote-card">
            <span>“</span>
            <p>Thành công là tổng của những nỗ lực nhỏ, lặp lại mỗi ngày.</p>
            <small>GỬI BẠN MỘT CHÚT ĐỘNG LỰC</small>
            <div className="quote-drawing">
              <Leaf size={44} strokeWidth={0.8} />
            </div>
          </section>
          {tasks.length === 0 && roadmap.year_goals.length === 0 && (
            <button className="sample-button" onClick={onSeed}>
              <Compass size={17} />
              <span>
                Khám phá với dữ liệu mẫu
                <small>Chỉ tạo trong tài khoản của bạn</small>
              </span>
              <ArrowRight size={15} />
            </button>
          )}
        </aside>
      </div>
    </section>
  );
}
function Stat({
  icon,
  title,
  value,
  suffix,
  note,
  color,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  suffix: string;
  note: string;
  color: string;
}) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${color}`}>{icon}</div>
      <div>
        <span className="stat-label">{title}</span>
        <div className="stat-number">
          {value}
          <small>{suffix}</small>
        </div>
        <p>{note}</p>
      </div>
    </div>
  );
}
function Tasks({
  tasks,
  taskProps,
  onAdd,
}: {
  tasks: Task[];
  taskProps: TaskProps;
  onAdd: () => void;
}) {
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [query, setQuery] = useState("");
  const filtered = tasks
    .filter(
      (t) =>
        (status === "all" || t.status === status) &&
        (priority === "all" || t.priority === priority) &&
        t.title.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi")),
    )
    .sort(
      (a, b) =>
        Number(a.status === "done") - Number(b.status === "done") ||
        (a.due_at || "z").localeCompare(b.due_at || "z"),
    );
  return (
    <section className="page">
      <PageHeading
        eyebrow="SẮP XẾP · TẬP TRUNG · HOÀN THÀNH"
        title="Dành chỗ cho điều quan trọng."
        description={`${tasks.length} công việc trên hành trình của bạn.`}
        action={
          <button className="button" onClick={onAdd}>
            <Plus size={17} />
            Thêm công việc
          </button>
        }
      />
      <div className="panel">
        <div className="filter-bar">
          <label className="search-input">
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm công việc…"
              aria-label="Tìm công việc"
            />
          </label>
          <label className="sr-only" htmlFor="filter-status">
            Lọc trạng thái
          </label>
          <select
            id="filter-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">Mọi trạng thái</option>
            <option value="todo">Chưa hoàn thành</option>
            <option value="done">Đã hoàn thành</option>
          </select>
          <label className="sr-only" htmlFor="filter-priority">
            Lọc độ ưu tiên
          </label>
          <select
            id="filter-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="all">Mọi độ ưu tiên</option>
            <option value="high">Ưu tiên cao</option>
            <option value="medium">Ưu tiên trung bình</option>
            <option value="low">Ưu tiên thấp</option>
          </select>
        </div>
        {filtered.length ? (
          <div className="task-list all-tasks">
            {filtered.map((task) => (
              <TaskRow key={task.id} task={task} {...taskProps} />
            ))}
          </div>
        ) : (
          <Empty
            title={
              tasks.length
                ? "Không tìm thấy công việc phù hợp."
                : "Một tâm trí gọn gàng bắt đầu từ đây."
            }
            detail={
              tasks.length
                ? "Thử điều chỉnh bộ lọc hoặc từ khóa."
                : "Thêm công việc đầu tiên để dành tâm trí cho việc thực hiện."
            }
            action={
              !tasks.length ? (
                <button className="button" onClick={onAdd}>
                  <Plus size={16} />
                  Thêm công việc
                </button>
              ) : undefined
            }
          />
        )}
        <div className="list-footer">
          {filtered.length} công việc ·{" "}
          {filtered.filter((t) => t.status === "done").length} đã hoàn thành
        </div>
      </div>
    </section>
  );
}
function Week({
  tasks,
  today,
  tz,
  reviews,
  taskProps,
  onAdd,
  onSaveReview,
}: {
  tasks: Task[];
  roadmap: Roadmap;
  today: string;
  tz: string;
  reviews: Review[];
  taskProps: TaskProps;
  onAdd: (date: string) => void;
  onSaveReview: (day: string, body: Record<string, string>) => Promise<void>;
}) {
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const start = addDays(weekStart(today), offset * 7);
  const weekly = weekTasks(tasks, start, tz);
  const review = reviews.find((r) => r.week_start === start);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSaveReview(
        start,
        Object.fromEntries(new FormData(e.currentTarget)) as Record<
          string,
          string
        >,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="page week-page">
      <PageHeading
        eyebrow="MỘT TUẦN CÓ CHỦ ĐÍCH"
        title="Tạo nhịp điệu của riêng bạn."
        description="Sắp xếp thời gian, giữ chỗ cho những ưu tiên."
        action={
          <button className="button" onClick={() => onAdd(today)}>
            <Plus size={17} />
            Thêm công việc
          </button>
        }
      />
      <div className="week-toolbar">
        <div className="week-selector">
          <button
            className="icon-button"
            aria-label="Tuần trước"
            onClick={() => setOffset(offset - 1)}
          >
            <ChevronLeft size={19} />
          </button>
          <h2>
            {formatDay(start, { day: "numeric", month: "numeric" })} —{" "}
            {formatDay(addDays(start, 6), {
              day: "numeric",
              month: "numeric",
              year: "numeric",
            })}
          </h2>
          <button
            className="icon-button"
            aria-label="Tuần tiếp theo"
            onClick={() => setOffset(offset + 1)}
          >
            <ChevronRight size={19} />
          </button>
          <button className="text-button" onClick={() => setOffset(0)}>
            Tuần này
          </button>
        </div>
        <span>
          <b>
            {weekly.filter((t) => t.status === "done").length}/{weekly.length}
          </b>{" "}
          công việc · <b>{completion(weekly)}%</b> hoàn thành
        </span>
      </div>
      <div className="week-board">
        {Array.from({ length: 7 }, (_, i) => {
          const day = addDays(start, i);
          const items = tasks
            .filter((t) => dueDay(t, tz) === day)
            .sort(
              (a, b) =>
                Number(a.status === "done") - Number(b.status === "done"),
            );
          return (
            <section
              key={day}
              className={`day-column ${day === today ? "current" : ""}`}
            >
              <header>
                <div>
                  <span>
                    {i === 6
                      ? "CHỦ NHẬT"
                      : `THỨ ${["HAI", "BA", "TƯ", "NĂM", "SÁU", "BẢY"][i]}`}
                  </span>
                  <strong>{day.slice(-2)}</strong>
                </div>
                <button
                  className="icon-button mini"
                  onClick={() => onAdd(day)}
                  aria-label={`Thêm công việc ngày ${day}`}
                >
                  <Plus size={17} />
                </button>
              </header>
              <div className="day-tasks">
                {items.map((task) => (
                  <TaskRow key={task.id} task={task} {...taskProps} compact />
                ))}
                {!items.length && (
                  <button className="day-empty" onClick={() => onAdd(day)}>
                    <Plus size={15} />
                    Thêm việc
                  </button>
                )}
              </div>
              <footer>
                {items.filter((t) => t.status === "done").length}/{items.length}{" "}
                hoàn thành
              </footer>
            </section>
          );
        })}
      </div>
      <div className="week-bottom">
        <div className="panel review-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">DỪNG LẠI MỘT CHÚT</span>
              <h2>Tổng kết tuần</h2>
            </div>
            <Leaf size={25} strokeWidth={1} />
          </div>
          <form key={start + String(review?.id)} onSubmit={submit}>
            <label>
              Tuần này của bạn thế nào?
              <textarea
                name="summary"
                maxLength={10000}
                rows={3}
                defaultValue={review?.summary}
                placeholder="Nhìn lại những điều bạn đã làm, những điều bạn đã học…"
              />
            </label>
            <div className="form-grid">
              <label>
                Điều bạn tự hào
                <textarea
                  name="wins"
                  maxLength={10000}
                  rows={2}
                  defaultValue={review?.wins}
                  placeholder="Những bước tiến dù nhỏ"
                />
              </label>
              <label>
                Điều muốn làm tốt hơn
                <textarea
                  name="improvements"
                  maxLength={10000}
                  rows={2}
                  defaultValue={review?.improvements}
                  placeholder="Mang theo vào tuần tới"
                />
              </label>
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="button" disabled={busy}>
              {busy ? "Đang lưu…" : "Lưu tổng kết tuần"}
              <Check size={16} />
            </button>
          </form>
        </div>
        <div className="panel carryover">
          <span className="eyebrow">GIỮ NHỊP HÀNH TRÌNH</span>
          <h2>Một cơ hội để tiếp tục.</h2>
          <p>
            {weekly.filter((t) => t.status === "todo").length} việc chưa hoàn
            thành trong tuần này. Bạn có thể chuyển từng việc sang ngày mai hoặc
            tuần sau trong menu của công việc.
          </p>
          <p className="muted small-copy">
            Kế hoạch có thể thay đổi. Hướng đi vẫn ở đó.
          </p>
          <ArrowUpRight size={32} strokeWidth={1} />
        </div>
      </div>
    </section>
  );
}
function Stats({
  tasks,
  roadmap,
  today,
  tz,
}: {
  tasks: Task[];
  roadmap: Roadmap;
  today: string;
  tz: string;
}) {
  const weekly = weekTasks(tasks, weekStart(today), tz);
  const monthly = tasks.filter(
    (t) => dueDay(t, tz)?.slice(0, 7) === today.slice(0, 7),
  );
  const done = tasks.filter((t) => t.status === "done").length;
  const overdue = tasks.filter(
    (t) => t.status === "todo" && t.due_at && new Date(t.due_at) < new Date(),
  ).length;
  const trends = Array.from({ length: 6 }, (_, i) => {
    const start = addDays(weekStart(today), (i - 5) * 7);
    const items = weekTasks(tasks, start, tz);
    return {
      start,
      total: items.length,
      done: items.filter((t) => t.status === "done").length,
    };
  });
  const max = Math.max(...trends.map((w) => w.total), 1);
  return (
    <section className="page">
      <PageHeading
        eyebrow="NHỮNG BƯỚC TIẾN ĐỀU ĐƯỢC GHI NHẬN"
        title="Nhìn lại để đi xa hơn."
        description="Dữ liệu thực từ hành trình của bạn, từng ngày một."
      />
      <div className="stat-cards">
        <Stat
          icon={<CalendarDays size={21} />}
          title="Hoàn thành tuần này"
          value={String(completion(weekly))}
          suffix="%"
          note={`${weekly.filter((t) => t.status === "done").length} / ${weekly.length} công việc`}
          color="green"
        />
        <Stat
          icon={<BarChart3 size={21} />}
          title="Hoàn thành tháng này"
          value={String(completion(monthly))}
          suffix="%"
          note={`${monthly.filter((t) => t.status === "done").length} / ${monthly.length} công việc`}
          color="blue"
        />
        <Stat
          icon={<CheckCheck size={21} />}
          title="Tổng việc hoàn thành"
          value={String(done)}
          suffix="việc"
          note={`${tasks.length - done} chưa hoàn thành · ${overdue} quá hạn`}
          color="orange"
        />
      </div>
      <div className="stats-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Những tuần gần đây</h2>
            <span className="legend">
              <i />
              Đã hoàn thành
            </span>
          </div>
          <div className="trend-chart">
            {trends.map((w) => (
              <div key={w.start}>
                <div className="trend-bar">
                  <span
                    style={{ height: `${Math.max((w.total / max) * 100, 2)}%` }}
                  >
                    <i style={{ height: `${percent(w.done, w.total)}%` }} />
                    <b>
                      {w.done}/{w.total}
                    </b>
                  </span>
                </div>
                <small>
                  {formatDay(w.start, { day: "numeric", month: "numeric" })}
                </small>
              </div>
            ))}
          </div>
          <p className="chart-note">
            Công việc được nhóm theo ngày đến hạn trong múi giờ {tz}.
          </p>
        </section>
        <section className="panel priority-panel">
          <div className="panel-heading">
            <h2>Phân bố ưu tiên</h2>
            <Flag size={18} />
          </div>
          {(["high", "medium", "low"] as Priority[]).map((p) => {
            const items = tasks.filter((t) => t.priority === p);
            return (
              <div className="priority-stat" key={p}>
                <div>
                  <span className={`priority ${p}`}>
                    <span />
                    {priorityLabel[p]}
                  </span>
                  <strong>
                    {items.length}
                    <small> công việc</small>
                  </strong>
                </div>
                <Progress value={percent(items.length, tasks.length)} />
                <small>
                  {items.filter((t) => t.status === "done").length} đã hoàn
                  thành
                </small>
              </div>
            );
          })}
        </section>
      </div>
      <section className="panel goals-stats">
        <div className="panel-heading">
          <h2>Mục tiêu & cột mốc</h2>
          <Target size={19} />
        </div>
        {roadmap.year_goals.length ? (
          roadmap.year_goals.map((g) => (
            <div className="goal-stat" key={g.id}>
              <div>
                <h3>{g.title}</h3>
                <b>{g.progress}%</b>
              </div>
              <Progress value={g.progress} />
              <div className="quarter-stats">
                {roadmap.quarter_goals
                  .filter((q) => q.year_goal_id === g.id)
                  .map((q) => (
                    <div key={q.id}>
                      <span>{q.title}</span>
                      <strong>{q.progress}%</strong>
                      <Progress value={q.progress} small />
                    </div>
                  ))}
              </div>
            </div>
          ))
        ) : (
          <Empty
            title="Chưa có mục tiêu để thống kê."
            detail="Tạo roadmap và liên kết công việc để theo dõi tiến độ thực tế."
          />
        )}
      </section>
    </section>
  );
}
function SettingsPage({
  settings,
  theme,
  setTheme,
  onSave,
}: {
  settings: Settings;
  theme: string;
  setTheme: (s: string) => void;
  onSave: (s: Settings) => Promise<void>;
}) {
  const [draft, setDraft] = useState(settings);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState(() =>
    typeof Notification === "undefined"
      ? "unsupported"
      : Notification.permission,
  );
  useEffect(() => setDraft(settings), [settings]);
  async function toggle() {
    if (draft.enabled) {
      setDraft({ ...draft, enabled: false });
      return;
    }
    if (typeof Notification === "undefined") {
      setError("Trình duyệt này chưa hỗ trợ thông báo.");
      return;
    }
    let p = Notification.permission;
    if (p === "default") {
      try {
        p = await Notification.requestPermission();
      } catch {
        setError(
          "Không thể yêu cầu quyền thông báo. Vui lòng thử lại trong trình duyệt hỗ trợ.",
        );
        return;
      }
    }
    setPermission(p);
    if (p === "granted") {
      setDraft({ ...draft, enabled: true });
      setError("");
    } else
      setError(
        "Thông báo đang bị chặn. Hãy cho phép thông báo trong cài đặt của trình duyệt rồi thử lại.",
      );
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave(draft);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="page narrow-page">
      <PageHeading
        eyebrow="THEO CÁCH CỦA BẠN"
        title="Một không gian vừa vặn."
        description="Chọn nhịp nhắc việc và giao diện phù hợp với bạn."
      />
      <section className="panel settings-panel">
        <div className="panel-heading">
          <h2>
            <Bell size={19} />
            Nhắc việc
          </h2>
          <span className="tag">Khi ứng dụng đang mở</span>
        </div>
        <form onSubmit={submit}>
          <div className="setting-toggle">
            <div>
              <strong>Bật thông báo trình duyệt</strong>
              <p>Nhắc nhẹ để bạn giữ nhịp mỗi ngày.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draft.enabled}
              aria-label="Bật thông báo trình duyệt"
              className={`switch ${draft.enabled ? "on" : ""}`}
              onClick={() => void toggle()}
            >
              <span />
            </button>
          </div>
          <div className="permission-status">
            <span
              className={permission === "granted" ? "green-dot" : "gray-dot"}
            />
            Quyền trình duyệt:{" "}
            <strong>
              {permission === "granted"
                ? "Đã cho phép"
                : permission === "denied"
                  ? "Đã chặn"
                  : permission === "unsupported"
                    ? "Không hỗ trợ"
                    : "Chưa yêu cầu"}
            </strong>
          </div>
          <div className="form-grid">
            <label>
              Giờ nhắc mỗi ngày
              <input
                type="time"
                required
                value={draft.daily_time}
                onChange={(e) =>
                  setDraft({ ...draft, daily_time: e.target.value })
                }
              />
            </label>
            <label>
              Nhắc trước thời hạn
              <select
                value={draft.before_minutes}
                onChange={(e) =>
                  setDraft({ ...draft, before_minutes: Number(e.target.value) })
                }
              >
                {Array.from(
                  new Set([draft.before_minutes, 0, 5, 10, 15, 30, 60, 120]),
                )
                  .sort((a, b) => a - b)
                  .map((n) => (
                    <option value={n} key={n}>
                      {n === 0
                        ? "Đúng hạn"
                        : n < 60
                          ? `${n} phút`
                          : `${n / 60} giờ`}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <label>
            Múi giờ
            <select
              value={draft.timezone}
              onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
            >
              {Array.from(
                new Set([
                  draft.timezone,
                  "Asia/Bangkok",
                  "Asia/Ho_Chi_Minh",
                  "Asia/Tokyo",
                  "Asia/Singapore",
                  "Europe/London",
                  "Europe/Paris",
                  "America/New_York",
                  "America/Los_Angeles",
                  "Australia/Sydney",
                  "UTC",
                ]),
              ).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <div className="info-box">
            <AlertCircle size={18} />
            <p>
              Thông báo chỉ hoạt động khi bạn đang mở ứng dụng và trình duyệt
              cho phép. Khi đóng tab, hệ thống chưa gửi Web Push hoặc email nhắc
              việc.
            </p>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button className="button" disabled={busy}>
              {busy ? "Đang lưu…" : "Lưu cài đặt"}
              <Check size={16} />
            </button>
          </div>
        </form>
      </section>
      <section className="panel settings-panel">
        <div className="panel-heading">
          <h2>
            <Sun size={20} />
            Giao diện
          </h2>
        </div>
        <p className="muted">Một không gian dễ chịu cho mắt và tâm trí.</p>
        <div className="theme-options">
          <button
            className={theme === "light" ? "selected" : ""}
            onClick={() => setTheme("light")}
          >
            <Sun size={20} />
            <span>Sáng dịu</span>
            {theme === "light" && <Check size={16} />}
          </button>
          <button
            className={theme === "dark" ? "selected" : ""}
            onClick={() => setTheme("dark")}
          >
            <Moon size={20} />
            <span>Tối tĩnh lặng</span>
            {theme === "dark" && <Check size={16} />}
          </button>
        </div>
      </section>
    </section>
  );
}
function Profile({
  user,
  onSave,
  onLogout,
}: {
  user: User;
  onSave: (name: string) => Promise<void>;
  onLogout: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave(String(new FormData(e.currentTarget).get("name")));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="page narrow-page">
      <PageHeading
        eyebrow="NGƯỜI DẪN ĐƯỜNG LÀ BẠN"
        title="Hành trình mang tên bạn."
        description="Quản lý thông tin tài khoản của mình."
      />
      <section className="panel profile-panel">
        <div className="profile-intro">
          <span className="avatar large">
            {user.name.charAt(0).toUpperCase()}
          </span>
          <div>
            <h2>{user.name}</h2>
            <p>{user.email}</p>
            <small>
              Đồng hành từ{" "}
              {new Intl.DateTimeFormat("vi-VN", {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "Asia/Bangkok",
              }).format(new Date(user.created_at))}
            </small>
          </div>
        </div>
        <form onSubmit={submit}>
          <label>
            Tên hiển thị
            <input
              name="name"
              defaultValue={user.name}
              required
              minLength={2}
              maxLength={100}
            />
          </label>
          <label>
            Địa chỉ email
            <input value={user.email} disabled type="email" />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button className="button" disabled={busy}>
              {busy ? "Đang lưu…" : "Lưu hồ sơ"}
              <Check size={16} />
            </button>
          </div>
        </form>
      </section>
      <section className="panel logout-panel">
        <div>
          <h3>Hẹn gặp lại, {user.name.split(" ").pop()}.</h3>
          <p>Dữ liệu của bạn được lưu an toàn cho lần trở lại.</p>
        </div>
        <button className="button secondary" onClick={onLogout}>
          <LogOut size={17} />
          Đăng xuất
        </button>
      </section>
    </section>
  );
}
function Planner({
  onClose,
  onApply,
}: {
  onClose: () => void;
  onApply: (input: PlannerInput) => Promise<void>;
}) {
  const [input, setInput] = useState<PlannerInput | null>(null);
  const [preview, setPreview] = useState<PlannerPreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const data: PlannerInput = {
      goal: String(f.get("goal")),
      deadline: String(f.get("deadline")),
      metric: String(f.get("metric")),
      resources: String(f.get("resources")),
      hours_per_week: Number(f.get("hours_per_week")),
      obstacles: String(f.get("obstacles")),
    };
    try {
      setPreview(await api<PlannerPreview>("/planner/preview", "POST", data));
      setInput(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!input) return;
    setBusy(true);
    setError("");
    try {
      await onApply(input);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        preview
          ? "Hướng đi dành cho bạn"
          : "Một mục tiêu, những bước đi rõ ràng."
      }
      onClose={onClose}
      wide
    >
      <div className="planner-note">
        <Sparkles size={18} />
        <p>
          Gợi ý theo quy tắc, dựa trên thời gian và nguồn lực của bạn. Bạn luôn
          là người quyết định hướng đi.
        </p>
      </div>
      {!preview ? (
        <form onSubmit={submit}>
          <label>
            Bạn muốn đạt được điều gì?
            <input
              name="goal"
              required
              minLength={3}
              maxLength={200}
              placeholder="Ví dụ: Đạt IELTS 7.0"
            />
          </label>
          <div className="form-grid">
            <label>
              Thời hạn
              <input
                name="deadline"
                type="date"
                required
                min={addDays(dateKey(), 1)}
                defaultValue={`${new Date().getFullYear()}-12-31`}
              />
            </label>
            <label>
              Số giờ có thể dành mỗi tuần
              <input
                name="hours_per_week"
                type="number"
                required
                min={1}
                max={80}
                defaultValue={5}
              />
            </label>
          </div>
          <label>
            Kết quả có thể đo lường
            <input
              name="metric"
              required
              maxLength={2000}
              placeholder="Ví dụ: Điểm thi IELTS tổng thể 7.0"
            />
          </label>
          <label>
            Năng lực & nguồn lực hiện tại
            <textarea
              name="resources"
              rows={2}
              required
              maxLength={2000}
              placeholder="Bạn đang ở đâu? Bạn có những nguồn lực nào?"
            />
          </label>
          <label>
            Trở ngại chính
            <textarea
              name="obstacles"
              rows={2}
              maxLength={2000}
              placeholder="Điều gì có thể khiến bạn chậm lại?"
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              className="button secondary"
              type="button"
              onClick={onClose}
            >
              Để sau
            </button>
            <button className="button" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Sparkles size={17} />
              )}
              Tạo bản gợi ý
            </button>
          </div>
        </form>
      ) : (
        <div className="planner-preview">
          <h3>{preview.title}</h3>
          <p>{preview.summary}</p>
          <div className="preview-section">
            <h4>
              <Map size={17} />
              Các giai đoạn chính
            </h4>
            <ol>
              {preview.phases.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ol>
          </div>
          <div className="preview-section">
            <h4>
              <Flag size={17} />
              Mục tiêu theo quý
            </h4>
            {preview.quarter_goals.map((p, i) => (
              <div className="preview-plan" key={i}>
                <strong>{p.title}</strong>
                <p>{p.description}</p>
                {p.start_date && (
                  <small>
                    {formatDay(p.start_date)} —{" "}
                    {p.end_date && formatDay(p.end_date)}
                  </small>
                )}
              </div>
            ))}
          </div>
          <div className="preview-section">
            <h4>
              <CalendarDays size={17} />
              Tháng đầu tiên
            </h4>
            <p>
              <strong>{preview.month_plan.title}</strong> —{" "}
              {preview.month_plan.description}
            </p>
          </div>
          <div className="preview-section">
            <h4>
              <CheckCheck size={17} />
              {preview.week_plans.length === 4
                ? "Bốn tuần đầu"
                : "Các tuần đầu"}
            </h4>
            {preview.week_plans.map((w, i) => (
              <div className="preview-plan" key={i}>
                <strong>{w.title}</strong>
                <p>{w.top_priorities || w.description}</p>
                {w.start_date && (
                  <small>
                    {formatDay(w.start_date)} —{" "}
                    {w.end_date && formatDay(w.end_date)}
                  </small>
                )}
                <ul className="preview-week-tasks">
                  {preview.tasks
                    .filter(
                      (task, index) => index >= 3 && task.week_index === i,
                    )
                    .map((task, index) => (
                      <li key={index}>
                        <strong>{task.title}</strong>
                        <p>{task.description}</p>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="preview-section start-today">
            <h4>
              <Sun size={17} />
              Những bước có thể bắt đầu ngay
            </h4>
            {preview.tasks.slice(0, 3).map((t, i) => (
              <div key={i}>
                <span>{i + 1}</span>
                <p>{t.title}</p>
              </div>
            ))}
          </div>
          <div className="preview-section">
            <h4>
              <AlertCircle size={17} />
              Rủi ro & cách xử lý
            </h4>
            {preview.risks.map((r, i) => (
              <p key={i}>
                <strong>{r.risk}</strong>
                <br />
                {r.mitigation}
              </p>
            ))}
          </div>
          <div className="info-box">
            <Check size={18} />
            <p>
              Khi xác nhận, một roadmap mới sẽ được thêm vào tài khoản. Những kế
              hoạch hiện có của bạn được giữ nguyên.
            </p>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setPreview(null);
                setError("");
              }}
            >
              <ArrowLeft size={16} />
              Chỉnh lại thông tin
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() => void apply()}
            >
              {busy ? "Đang lưu…" : "Xác nhận & lưu roadmap"}
              <Check size={16} />
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
