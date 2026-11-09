import { useEffect, useRef, useState, useId } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  X,
  Check,
  Plus,
  MoreHorizontal,
  Clock3,
  Flag,
  Trash2,
  ArrowRight,
  Target,
  Compass,
  ChevronDown,
  LoaderCircle,
} from "lucide-react";
import type { Task, Plan, Roadmap, Kind } from "./types";
import { kindLabel, priorityLabel } from "./types";
import {
  dueDay,
  formatDay,
  timeLabel,
  toLocalInput,
  zonedToISO,
} from "./utils";
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Compass size={27} strokeWidth={1.5} />
      </span>
      {!compact && (
        <span>
          la bàn<span className="brand-sub">CÔNG VIỆC</span>
        </span>
      )}
    </div>
  );
}
export function Spinner() {
  return (
    <div className="loading">
      <LoaderCircle className="spin" />
      <span>Đang chuẩn bị không gian của bạn…</span>
    </div>
  );
}
export function Progress({
  value = 0,
  small = false,
}: {
  value?: number;
  small?: boolean;
}) {
  return (
    <div
      className={`progress ${small ? "small" : ""}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${value}%` }} />
    </div>
  );
}
export function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Compass size={30} strokeWidth={1.25} />
      </span>
      <h3>{title}</h3>
      {detail && <p>{detail}</p>}
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const el = ref.current;
    el?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && el) {
        const focusable = Array.from(
          el.querySelectorAll<HTMLElement>(
            'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
          ),
        );
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = scroll;
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "wide" : ""}`}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header>
          <div>
            <span className="eyebrow">LA BÀN CÔNG VIỆC</span>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button className="icon-button" aria-label="Đóng" onClick={onClose}>
            <X />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export function Confirm({
  title,
  detail,
  onClose,
  onConfirm,
}: {
  title: string;
  detail: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted">{detail}</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="button secondary" onClick={onClose}>
          Hủy
        </button>
        <button
          className="button danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              onClose();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Đang xóa…" : "Xác nhận xóa"}
        </button>
      </div>
    </Modal>
  );
}
export function TaskRow({
  task,
  roadmap,
  tz,
  onToggle,
  onEdit,
  onDelete,
  onMove,
  compact = false,
}: {
  task: Task;
  roadmap: Roadmap;
  tz: string;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onMove?: (task: Task, offset: number) => void;
  compact?: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const goal = roadmap.year_goals.find((g) => g.id === task.year_goal_id);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(
    new Date(),
  );
  const late =
    task.status !== "done" && task.due_at && new Date(task.due_at) < new Date();
  const day = dueDay(task, tz);
  return (
    <div
      className={`task-row ${task.status === "done" ? "completed" : ""} ${compact ? "compact" : ""}`}
    >
      <button
        className="task-check"
        aria-label={`${task.status === "done" ? "Bỏ hoàn thành" : "Hoàn thành"}: ${task.title}`}
        aria-pressed={task.status === "done"}
        onClick={() => onToggle(task)}
      >
        {task.status === "done" && <Check size={14} />}
      </button>
      <div className="task-copy">
        <button className="task-title" onClick={() => onEdit(task)}>
          {task.title}
        </button>
        {!compact && task.description && <p>{task.description}</p>}
        <div className="task-meta">
          {goal && (
            <span className="goal-label">
              <Target size={11} />
              {goal.title}
            </span>
          )}
          {task.due_at && (
            <span className={late ? "overdue" : ""}>
              <Clock3 size={11} />
              {day === today
                ? "Hôm nay"
                : formatDay(day!, { day: "numeric", month: "numeric" })}{" "}
              · {timeLabel(task.due_at, tz)}
            </span>
          )}
        </div>
      </div>
      <span
        className={`priority ${task.priority}`}
        title={`Ưu tiên ${priorityLabel[task.priority]}`}
      >
        <span />
        {compact ? "" : priorityLabel[task.priority]}
      </span>
      <div className="menu-wrap">
        <button
          className="icon-button mini"
          onClick={() => setMenu(!menu)}
          aria-label={`Tùy chọn ${task.title}`}
          aria-expanded={menu}
        >
          <MoreHorizontal size={18} />
        </button>
        {menu && (
          <>
            <button
              className="menu-scrim"
              aria-label="Đóng tùy chọn"
              onClick={() => setMenu(false)}
            />
            <div className="dropdown">
              <button
                onClick={() => {
                  setMenu(false);
                  onEdit(task);
                }}
              >
                Chỉnh sửa
              </button>
              {onMove && (
                <>
                  <button
                    onClick={() => {
                      setMenu(false);
                      onMove(task, 1);
                    }}
                  >
                    Chuyển sang ngày mai
                  </button>
                  <button
                    onClick={() => {
                      setMenu(false);
                      onMove(task, 7);
                    }}
                  >
                    Chuyển sang tuần sau
                  </button>
                </>
              )}
              <button
                className="text-danger"
                onClick={() => {
                  setMenu(false);
                  onDelete(task);
                }}
              >
                <Trash2 size={14} /> Xóa công việc
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
export function TaskEditor({
  task,
  roadmap,
  tz,
  onClose,
  onSave,
  initialDate,
}: {
  task?: Task;
  roadmap: Roadmap;
  tz: string;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
  initialDate?: string;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  let selected = "";
  if (task?.week_plan_id) selected = `week:${task.week_plan_id}`;
  else if (task?.month_plan_id) selected = `month:${task.month_plan_id}`;
  else if (task?.quarter_goal_id) selected = `quarter:${task.quarter_goal_id}`;
  else if (task?.year_goal_id) selected = `year:${task.year_goal_id}`;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const relation = String(f.get("relation") || "");
    const body: Record<string, unknown> = {
      title: f.get("title"),
      description: f.get("description"),
      notes: f.get("notes"),
      priority: f.get("priority"),
      status: f.get("status"),
      due_at: null,
      year_goal_id: null,
      quarter_goal_id: null,
      month_plan_id: null,
      week_plan_id: null,
    };
    if (relation) {
      const [kind, id] = relation.split(":");
      body[
        `${kind === "year" ? "year_goal" : kind === "quarter" ? "quarter_goal" : kind === "month" ? "month_plan" : "week_plan"}_id`
      ] = id;
    }
    try {
      body.due_at = zonedToISO(String(f.get("due_at")), tz);
      await onSave(body);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={task ? "Chỉnh sửa công việc" : "Một bước tiến mới"}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <label>
          Tên công việc
          <input
            name="title"
            placeholder="Bạn muốn hoàn thành điều gì?"
            required
            maxLength={200}
            defaultValue={task?.title}
          />
        </label>
        <label>
          Mô tả
          <textarea
            name="description"
            maxLength={10000}
            rows={2}
            placeholder="Thêm một chút chi tiết…"
            defaultValue={task?.description}
          />
        </label>
        <div className="form-grid">
          <label>
            Độ ưu tiên
            <select name="priority" defaultValue={task?.priority || "medium"}>
              <option value="high">Cao</option>
              <option value="medium">Trung bình</option>
              <option value="low">Thấp</option>
            </select>
          </label>
          <label>
            Trạng thái
            <select name="status" defaultValue={task?.status || "todo"}>
              <option value="todo">Chưa hoàn thành</option>
              <option value="done">Đã hoàn thành</option>
            </select>
          </label>
        </div>
        <label>
          Ngày & giờ đến hạn <span className="label-hint">{tz}</span>
          <input
            name="due_at"
            type="datetime-local"
            defaultValue={
              task
                ? toLocalInput(task.due_at, tz)
                : initialDate
                  ? `${initialDate}T09:00`
                  : ""
            }
          />
        </label>
        <label>
          Liên kết với roadmap
          <select name="relation" defaultValue={selected}>
            <option value="">Công việc độc lập</option>
            {(["year", "quarter", "month", "week"] as Kind[]).map((kind) => {
              const list =
                kind === "year"
                  ? roadmap.year_goals
                  : kind === "quarter"
                    ? roadmap.quarter_goals
                    : kind === "month"
                      ? roadmap.month_plans
                      : roadmap.week_plans;
              return (
                <optgroup key={kind} label={kindLabel[kind]}>
                  {list.map((g) => (
                    <option key={g.id} value={`${kind}:${g.id}`}>
                      {g.title}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </label>
        <label>
          Ghi chú
          <textarea
            name="notes"
            maxLength={10000}
            rows={2}
            defaultValue={task?.notes}
            placeholder="Ý tưởng, đường dẫn hoặc ghi chú của bạn"
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Hủy
          </button>
          <button className="button" disabled={busy}>
            <Plus size={16} />
            {busy ? "Đang lưu…" : task ? "Lưu thay đổi" : "Thêm công việc"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function PlanEditor({
  kind,
  plan,
  parentId,
  roadmap,
  onClose,
  onSave,
}: {
  kind: Kind;
  plan?: Plan;
  parentId?: string;
  roadmap: Roadmap;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const parentKey =
    kind === "quarter"
      ? "year_goal_id"
      : kind === "month"
        ? "quarter_goal_id"
        : "month_plan_id";
  const parents =
    kind === "quarter"
      ? roadmap.year_goals
      : kind === "month"
        ? roadmap.quarter_goals
        : roadmap.month_plans;
  const [selected, setSelected] = useState(parentId || plan?.[parentKey] || "");
  const parent = parents.find((p) => p.id === selected);
  const [start, setStart] = useState(
    plan?.start_date ||
      parent?.start_date ||
      new Date().toISOString().slice(0, 10),
  );
  const [end, setEnd] = useState(
    plan?.end_date || parent?.end_date || `${new Date().getFullYear()}-12-31`,
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body: Record<string, unknown> = Object.fromEntries(
      new FormData(e.currentTarget),
    );
    try {
      await onSave(body);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`${plan ? "Chỉnh sửa" : "Tạo"} ${kindLabel[kind].toLocaleLowerCase("vi")}`}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        {kind !== "year" && (
          <label>
            Kế hoạch cấp trên
            <select
              name={parentKey}
              required
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                const p = parents.find((x) => x.id === e.target.value);
                if (p) {
                  setStart(p.start_date);
                  setEnd(p.end_date);
                }
              }}
            >
              <option value="">Chọn kế hoạch…</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Tiêu đề
          <input
            name="title"
            required
            maxLength={200}
            defaultValue={plan?.title}
            placeholder={
              kind === "year"
                ? "Một mục tiêu thật sự có ý nghĩa với bạn…"
                : "Kết quả bạn muốn hướng đến"
            }
          />
        </label>
        <label>
          Kết quả mong muốn
          <textarea
            name="description"
            maxLength={10000}
            rows={2}
            defaultValue={plan?.description}
          />
        </label>
        <div className="form-grid">
          <label>
            Ngày bắt đầu
            <input
              name="start_date"
              required
              type="date"
              value={start}
              min={parent?.start_date}
              max={parent?.end_date}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            Ngày kết thúc
            <input
              name="end_date"
              required
              type="date"
              value={end}
              min={start}
              max={parent?.end_date}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        {kind === "year" && (
          <>
            <label>
              Lý do thực hiện
              <textarea
                name="why"
                maxLength={5000}
                rows={2}
                defaultValue={plan?.why}
              />
            </label>
            <label>
              Độ ưu tiên
              <select name="priority" defaultValue={plan?.priority || "high"}>
                <option value="high">Cao</option>
                <option value="medium">Trung bình</option>
                <option value="low">Thấp</option>
              </select>
            </label>
          </>
        )}
        {(kind === "year" || kind === "quarter") && (
          <label>
            Chỉ số đo lường
            <input
              name="metric"
              maxLength={5000}
              defaultValue={plan?.metric}
              placeholder="Ví dụ: Hoàn thành 12 cuốn sách"
            />
          </label>
        )}
        {kind === "quarter" && (
          <label>
            Các cột mốc
            <textarea
              name="milestones"
              maxLength={5000}
              rows={3}
              defaultValue={plan?.milestones}
            />
          </label>
        )}
        {kind === "month" && (
          <>
            <label>
              Trọng tâm của tháng
              <input name="focus" maxLength={5000} defaultValue={plan?.focus} />
            </label>
            <label>
              Kết quả cần đạt
              <input
                name="outcome"
                maxLength={5000}
                defaultValue={plan?.outcome}
              />
            </label>
          </>
        )}
        {kind === "week" && (
          <label>
            Ba ưu tiên quan trọng nhất
            <textarea
              name="top_priorities"
              maxLength={5000}
              rows={3}
              defaultValue={plan?.top_priorities}
              placeholder="Mỗi ưu tiên một dòng"
            />
          </label>
        )}
        <label>
          Trạng thái
          <select name="status" defaultValue={plan?.status || "active"}>
            <option value="active">Đang thực hiện</option>
            <option value="paused">Tạm dừng</option>
            <option value="completed">Hoàn thành</option>
          </select>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Hủy
          </button>
          <button className="button" disabled={busy}>
            {busy ? "Đang lưu…" : "Lưu kế hoạch"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function PlanTree({
  plan,
  kind,
  roadmap,
  onCreate,
  onEdit,
  onDelete,
}: {
  plan: Plan;
  kind: Kind;
  roadmap: Roadmap;
  onCreate: (kind: Kind, parentId?: string) => void;
  onEdit: (plan: Plan, kind: Kind) => void;
  onDelete: (plan: Plan, kind: Kind) => void;
}) {
  const [open, setOpen] = useState(kind === "year");
  const next: Kind | null =
    kind === "year"
      ? "quarter"
      : kind === "quarter"
        ? "month"
        : kind === "month"
          ? "week"
          : null;
  const children =
    kind === "year"
      ? roadmap.quarter_goals.filter((g) => g.year_goal_id === plan.id)
      : kind === "quarter"
        ? roadmap.month_plans.filter((g) => g.quarter_goal_id === plan.id)
        : kind === "month"
          ? roadmap.week_plans.filter((g) => g.month_plan_id === plan.id)
          : [];
  return (
    <div className={`plan-node ${kind}`}>
      <div className="plan-head">
        <button
          className="plan-expand"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          <ChevronDown className={open ? "" : "rotated"} size={17} />
          <span className="plan-symbol">
            {kind === "year" ? (
              <Target size={20} />
            ) : kind === "quarter" ? (
              <Flag size={17} />
            ) : kind === "month" ? (
              "M"
            ) : (
              "W"
            )}
          </span>
          <span>
            <small>
              {kindLabel[kind]} ·{" "}
              {formatDay(plan.start_date, { month: "numeric", day: "numeric" })}{" "}
              — {formatDay(plan.end_date, { month: "numeric", day: "numeric" })}
            </small>
            <strong>{plan.title}</strong>
          </span>
        </button>
        <div className="plan-progress">
          <span>{plan.progress}%</span>
          <Progress value={plan.progress} small />
        </div>
        <button
          className="icon-button mini"
          onClick={() => onEdit(plan, kind)}
          aria-label={`Chỉnh sửa ${plan.title}`}
        >
          <MoreHorizontal size={19} />
        </button>
      </div>
      {open && (
        <div className="plan-body">
          {plan.description && <p>{plan.description}</p>}
          {plan.why && (
            <p>
              <strong>Lý do:</strong> {plan.why}
            </p>
          )}
          {plan.metric && (
            <div className="plan-detail">
              <Target size={14} />
              {plan.metric}
            </div>
          )}
          {plan.focus && (
            <p>
              <strong>Trọng tâm:</strong> {plan.focus}
            </p>
          )}
          {plan.outcome && (
            <p>
              <strong>Kết quả:</strong> {plan.outcome}
            </p>
          )}
          {plan.milestones && (
            <p className="preserve">
              <strong>Cột mốc:</strong> {plan.milestones}
            </p>
          )}
          {plan.top_priorities && (
            <p className="preserve">
              <strong>Ba ưu tiên:</strong> {plan.top_priorities}
            </p>
          )}
          <div className="plan-status">
            {plan.status === "completed"
              ? "✓ Hoàn thành"
              : plan.status === "paused"
                ? "Tạm dừng"
                : "Đang thực hiện"}
          </div>
          {children.map((child) => (
            <PlanTree
              key={child.id}
              plan={child}
              kind={next!}
              roadmap={roadmap}
              onCreate={onCreate}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
          <div className="plan-actions">
            {next && (
              <button
                className="text-button"
                onClick={() => onCreate(next, plan.id)}
              >
                <Plus size={14} />
                Thêm {kindLabel[next].toLocaleLowerCase("vi")}
              </button>
            )}
            <button
              className="text-button text-danger"
              onClick={() => onDelete(plan, kind)}
            >
              <Trash2 size={13} />
              Xóa
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
