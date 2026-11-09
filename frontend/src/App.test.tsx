// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import type { User, Task, Roadmap, Settings, PlannerPreview } from "./types";
import { DEFAULT_SETTINGS, EMPTY_ROADMAP } from "./types";
import { dateKey } from "./utils";

type RequestLog = {
  path: string;
  method: string;
  body: Record<string, unknown> | undefined;
};
const FIRST: User = {
  id: "user-first",
  name: "Nguyễn Minh",
  email: "minh@example.com",
  created_at: "2026-01-01T00:00:00Z",
};
const SECOND: User = {
  id: "user-second",
  name: "Trần An",
  email: "an@example.com",
  created_at: "2026-01-01T00:00:00Z",
};
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function makeTask(title: string, id = "task-1"): Task {
  return {
    id,
    title,
    description: "",
    notes: "",
    status: "todo",
    priority: "medium",
    due_at: `${dateKey()}T03:00:00Z`,
    completed_at: null,
    year_goal_id: null,
    quarter_goal_id: null,
    month_plan_id: null,
    week_plan_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
function response(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => copy(data),
  } as Response;
}
function setupApi(signedIn = true) {
  const accounts: Record<string, User> = {
    [FIRST.email]: copy(FIRST),
    [SECOND.email]: copy(SECOND),
  };
  const accountTasks: Record<string, Task[]> = {
    [FIRST.email]: [],
    [SECOND.email]: [],
  };
  let current: string | null = signedIn ? FIRST.email : null;
  let roadmap: Roadmap = copy(EMPTY_ROADMAP);
  let settings: Settings = copy(DEFAULT_SETTINGS);
  const requests: RequestLog[] = [];
  let held: ((response: Response) => void) | undefined;
  let holdNext = false;
  const preview: PlannerPreview = {
    title: "Học tiếng Anh",
    summary: "Kế hoạch dựa trên 5 giờ mỗi tuần.",
    phases: ["Xây nền tảng", "Thực hành", "Đánh giá"],
    year_goal: { title: "Học tiếng Anh" },
    quarter_goals: [{ title: "Quý đầu tiên", description: "Xây nền tảng" }],
    month_plan: { title: "Tháng đầu tiên", description: "Chuẩn bị tài liệu" },
    week_plans: [{ title: "Tuần một", top_priorities: "Chọn tài liệu" }],
    tasks: [
      { title: "Xác định trình độ hiện tại", week_index: 0 },
      { title: "Chọn tài liệu", week_index: 0 },
      { title: "Đặt lịch tự học", week_index: 0 },
      {
        title: "Luyện nghe và ghi lại kết quả",
        description: "Thực hành 45 phút",
        week_index: 0,
      },
    ],
    risks: [{ risk: "Thiếu thời gian", mitigation: "Chia thành phiên ngắn" }],
  };
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).replace(/^\/api/, "");
      const method = init?.method || "GET";
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : undefined;
      requests.push({ path, method, body });
      if (path === "/auth/me")
        return current
          ? response(accounts[current])
          : response({ detail: "Chưa đăng nhập" }, 401);
      if (path === "/auth/register") {
        const email = String(body?.email);
        accounts[email] = { ...FIRST, email, name: String(body?.name) };
        accountTasks[email] = [];
        current = email;
        return response(accounts[email], 201);
      }
      if (path === "/auth/login") {
        const email = String(body?.email);
        if (!accounts[email])
          return response({ detail: "Sai thông tin đăng nhập" }, 401);
        current = email;
        return response(accounts[email]);
      }
      if (path === "/auth/logout") {
        current = null;
        return response({ ok: true });
      }
      if (path === "/auth/forgot-password")
        return response({
          message: "Nếu email tồn tại, hướng dẫn đã được gửi.",
        });
      if (path === "/auth/reset-password")
        return response({ message: "Đã đặt lại mật khẩu." });
      if (!current) return response({ detail: "Chưa đăng nhập" }, 401);
      if (path === "/tasks" && method === "GET") {
        if (holdNext) {
          holdNext = false;
          return new Promise<Response>((resolve) => {
            held = resolve;
          });
        }
        return response(accountTasks[current]);
      }
      if (path === "/tasks" && method === "POST") {
        const task = {
          ...makeTask(String(body?.title), `task-${requests.length}`),
          ...body,
        } as Task;
        accountTasks[current].push(task);
        return response(task, 201);
      }
      if (path.startsWith("/tasks/")) {
        const id = path.split("/").pop();
        const task = accountTasks[current].find((t) => t.id === id);
        if (!task) return response({ detail: "Không tìm thấy" }, 404);
        if (method === "DELETE") {
          accountTasks[current] = accountTasks[current].filter(
            (t) => t.id !== id,
          );
          return response({ ok: true });
        }
        Object.assign(task, body);
        if (body?.status === "done")
          task.completed_at = new Date().toISOString();
        if (body?.status === "todo") task.completed_at = null;
        return response(task);
      }
      if (path === "/roadmap") return response(roadmap);
      if (path === "/settings/reminders") {
        if (method === "PUT") settings = body as unknown as Settings;
        return response(settings);
      }
      if (path === "/reviews") return response([]);
      if (path === "/demo/seed") {
        accountTasks[current] = [makeTask("Đọc mười trang sách")];
        return response({ message: "Đã tạo dữ liệu mẫu" });
      }
      if (path === "/planner/preview") return response(preview);
      if (path === "/planner/apply") {
        roadmap = {
          ...copy(EMPTY_ROADMAP),
          year_goals: [
            {
              id: "goal-new",
              title: String(body?.goal),
              description: "",
              start_date: dateKey(),
              end_date: String(body?.deadline),
              status: "active",
              progress: 0,
            },
          ],
        };
        return response({ year_goal_id: "goal-new", message: "Đã lưu" });
      }
      throw new Error(`Unhandled test request: ${method} ${path}`);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return {
    requests,
    accountTasks,
    fetchMock,
    holdTasks() {
      holdNext = true;
    },
    releaseTasks(tasks: Task[]) {
      held?.(response(tasks));
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.stubGlobal(
    "Notification",
    class {
      static permission: NotificationPermission = "default";
      static requestPermission = vi.fn(async () => {
        return "granted" as NotificationPermission;
      });
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function expectDashboard(name = "Minh") {
  await screen.findByRole("heading", {
    name: new RegExp(`Chào ${name}, một ngày mới!`),
  });
}

describe("authentication and private navigation", () => {
  it("keeps unauthenticated visitors on the introduction and supports registration followed by private demo data", async () => {
    const store = setupApi(false);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Chào mừng bạn trở lại." });
    expect(
      screen.queryByRole("navigation", { name: "Điều hướng chính" }),
    ).toBeNull();
    expect(store.requests.some((r) => r.path === "/tasks")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Đăng ký tài khoản" }));
    await user.type(screen.getByLabelText("Tên của bạn"), "Nguyễn Linh");
    await user.type(screen.getByLabelText("Địa chỉ email"), "linh@example.com");
    await user.type(screen.getByLabelText("Mật khẩu"), "a-safe-password-123");
    await user.click(screen.getByRole("button", { name: "Tạo tài khoản" }));
    await expectDashboard("Linh");
    expect(
      store.requests.find((r) => r.path === "/auth/register")?.body,
    ).toEqual({
      name: "Nguyễn Linh",
      email: "linh@example.com",
      password: "a-safe-password-123",
    });
    await user.click(
      screen.getByRole("button", { name: /Khám phá với dữ liệu mẫu/ }),
    );
    await screen.findByRole("button", { name: "Đọc mười trang sách" });
    expect(store.requests.filter((r) => r.path === "/demo/seed")).toHaveLength(
      1,
    );
  });
  it("discards a slow response from the previous account after logout and a different login", async () => {
    const store = setupApi();
    store.holdTasks();
    const user = userEvent.setup();
    render(<App />);
    await expectDashboard();
    await user.click(
      screen.getByRole("button", { name: "Hồ sơ của Nguyễn Minh" }),
    );
    await user.click(screen.getByRole("button", { name: "Đăng xuất" }));
    await screen.findByRole("heading", { name: "Chào mừng bạn trở lại." });
    await user.type(screen.getByLabelText("Địa chỉ email"), SECOND.email);
    await user.type(screen.getByLabelText("Mật khẩu"), "a-safe-password-123");
    await user.click(screen.getByRole("button", { name: "Bắt đầu ngày mới" }));
    await expectDashboard("An");
    store.releaseTasks([makeTask("Bí mật của tài khoản Minh")]);
    await waitFor(() =>
      expect(screen.queryByText("Bí mật của tài khoản Minh")).toBeNull(),
    );
    expect(screen.queryByText("Nguyễn Minh")).toBeNull();
    expect(
      store.requests.filter((r) => r.path === "/auth/logout"),
    ).toHaveLength(1);
  });
  it("returns to sign-in when signing out of an already expired session", async () => {
    const store = setupApi();
    const user = userEvent.setup();
    render(<App />);
    await expectDashboard();
    await user.click(
      screen.getByRole("button", { name: "Hồ sơ của Nguyễn Minh" }),
    );
    store.fetchMock.mockResolvedValueOnce(
      response({ detail: "Phiên đã hết hạn" }, 401),
    );
    await user.click(screen.getByRole("button", { name: "Đăng xuất" }));
    await screen.findByRole("heading", { name: "Chào mừng bạn trở lại." });
    expect(
      screen.queryByRole("navigation", { name: "Điều hướng chính" }),
    ).toBeNull();
  });
  it("opens reset forms from the exact reset_token parameter used in email links", async () => {
    setupApi(false);
    window.history.replaceState(
      {},
      "",
      "/?reset_token=a-real-reset-token-123456",
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Đặt lại mật khẩu." });
    await user.type(screen.getByLabelText("Mật khẩu"), "new-safe-password-123");
    await user.click(screen.getByRole("button", { name: "Gửi yêu cầu" }));
    await screen.findByRole("heading", { name: "Chào mừng bạn trở lại." });
    expect(window.location.search).toBe("");
  });
});

describe("task management through the real forms", () => {
  it("creates, completes, edits and confirms deletion while persisting via the API", async () => {
    const store = setupApi();
    const user = userEvent.setup();
    render(<App />);
    await expectDashboard();
    await user.click(screen.getByRole("button", { name: "Thêm công việc" }));
    let dialog = screen.getByRole("dialog");
    await user.type(
      within(dialog).getByLabelText("Tên công việc"),
      "Viết kế hoạch cá nhân",
    );
    await user.type(
      within(dialog).getByLabelText("Mô tả"),
      "Một bước nhỏ hôm nay",
    );
    await user.selectOptions(
      within(dialog).getByLabelText("Độ ưu tiên"),
      "high",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Thêm công việc" }),
    );
    await screen.findByRole("button", { name: "Viết kế hoạch cá nhân" });
    const create = store.requests.find(
      (r) => r.path === "/tasks" && r.method === "POST",
    );
    expect(create?.body).toMatchObject({
      title: "Viết kế hoạch cá nhân",
      description: "Một bước nhỏ hôm nay",
      priority: "high",
      status: "todo",
    });
    expect(create?.body?.due_at).toMatch(/T02:00:00\.000Z$/);
    expect(create?.body).not.toHaveProperty("user_id");
    await user.click(
      screen.getByRole("button", { name: "Hoàn thành: Viết kế hoạch cá nhân" }),
    );
    await screen.findByRole("button", {
      name: "Bỏ hoàn thành: Viết kế hoạch cá nhân",
    });
    expect(
      store.requests.some(
        (r) => r.method === "PATCH" && r.body?.status === "done",
      ),
    ).toBe(true);
    await user.click(
      screen.getByRole("button", { name: "Viết kế hoạch cá nhân" }),
    );
    dialog = screen.getByRole("dialog");
    await user.clear(within(dialog).getByLabelText("Tên công việc"));
    await user.type(
      within(dialog).getByLabelText("Tên công việc"),
      "Kế hoạch đã chỉnh sửa",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Lưu thay đổi" }),
    );
    await screen.findByRole("button", { name: "Kế hoạch đã chỉnh sửa" });
    await user.click(
      screen.getByRole("button", { name: "Tùy chọn Kế hoạch đã chỉnh sửa" }),
    );
    await user.click(screen.getByRole("button", { name: "Xóa công việc" }));
    expect(store.requests.some((r) => r.method === "DELETE")).toBe(false);
    dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Xác nhận xóa" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Kế hoạch đã chỉnh sửa" }),
      ).toBeNull(),
    );
    expect(store.requests.filter((r) => r.method === "DELETE")).toHaveLength(1);
  });
});

describe("planning and user-controlled reminders", () => {
  it("previews a proposed roadmap without saving until the user explicitly confirms", async () => {
    const store = setupApi();
    const user = userEvent.setup();
    render(<App />);
    await expectDashboard();
    await user.click(
      screen.getByRole("button", { name: "Vẽ hướng đi đầu tiên" }),
    );
    let dialog = screen.getByRole("dialog");
    await user.type(
      within(dialog).getByLabelText("Bạn muốn đạt được điều gì?"),
      "Học tiếng Anh",
    );
    await user.type(
      within(dialog).getByLabelText("Kết quả có thể đo lường"),
      "Đạt IELTS 7.0",
    );
    await user.type(
      within(dialog).getByLabelText("Năng lực & nguồn lực hiện tại"),
      "Trình độ B1 và sách tự học",
    );
    await user.type(
      within(dialog).getByLabelText("Trở ngại chính"),
      "Ít thời gian",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Tạo bản gợi ý" }),
    );
    await screen.findByRole("heading", { name: "Hướng đi dành cho bạn" });
    expect(
      store.requests.filter((r) => r.path === "/planner/preview"),
    ).toHaveLength(1);
    expect(
      store.requests.filter((r) => r.path === "/planner/apply"),
    ).toHaveLength(0);
    dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("Luyện nghe và ghi lại kết quả"),
    ).toBeTruthy();
    const todaySection = within(dialog).getByRole("heading", {
      name: "Những bước có thể bắt đầu ngay",
    }).parentElement!;
    expect(todaySection.querySelectorAll("div")).toHaveLength(3);
    expect(
      within(todaySection).queryByText("Luyện nghe và ghi lại kết quả"),
    ).toBeNull();
    await user.click(
      within(dialog).getByRole("button", { name: "Xác nhận & lưu roadmap" }),
    );
    await screen.findByRole("heading", { name: "Từ mục tiêu đến hành động." });
    expect(
      store.requests.filter((r) => r.path === "/planner/apply"),
    ).toHaveLength(1);
    expect(
      store.requests.find((r) => r.path === "/planner/apply")?.body,
    ).toEqual(store.requests.find((r) => r.path === "/planner/preview")?.body);
  });
  it("requests browser permission only after an explicit enable action and saves reminder settings", async () => {
    const store = setupApi();
    const permission = vi.fn(async () => "granted" as NotificationPermission);
    vi.stubGlobal(
      "Notification",
      class {
        static permission: NotificationPermission = "default";
        static requestPermission = permission;
      },
    );
    const user = userEvent.setup();
    render(<App />);
    await expectDashboard();
    expect(permission).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cài đặt" }));
    await screen.findByRole("heading", { name: "Một không gian vừa vặn." });
    expect(permission).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("switch", { name: "Bật thông báo trình duyệt" }),
    );
    expect(permission).toHaveBeenCalledTimes(1);
    expect(
      screen
        .getByRole("switch", { name: "Bật thông báo trình duyệt" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    await user.selectOptions(screen.getByLabelText("Múi giờ"), "Asia/Tokyo");
    await user.click(screen.getByRole("button", { name: "Lưu cài đặt" }));
    await waitFor(() =>
      expect(
        store.requests.find(
          (r) => r.path === "/settings/reminders" && r.method === "PUT",
        )?.body,
      ).toMatchObject({
        enabled: true,
        timezone: "Asia/Tokyo",
        daily_time: "08:00",
        before_minutes: 15,
      }),
    );
    expect(
      screen.getByText(/Khi đóng tab, hệ thống chưa gửi Web Push/),
    ).toBeTruthy();
  });
  it("handles notification permission errors without enabling or saving reminders", async () => {
    const store = setupApi();
    const permission = vi.fn(async () => {
      throw new Error("Browser does not support this permission flow");
    });
    vi.stubGlobal(
      "Notification",
      class {
        static permission: NotificationPermission = "default";
        static requestPermission = permission;
      },
    );
    const user = userEvent.setup();
    render(<App />);
    await expectDashboard();
    await user.click(screen.getByRole("button", { name: "Cài đặt" }));
    await user.click(
      screen.getByRole("switch", { name: "Bật thông báo trình duyệt" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Không thể yêu cầu quyền thông báo",
    );
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe(
      "false",
    );
    expect(store.requests.some((request) => request.method === "PUT")).toBe(
      false,
    );
  });
  it("offers the mobile navigation controls and seven days in a virtual DOM", async () => {
    setupApi();
    Object.defineProperty(window, "innerWidth", {
      value: 390,
      writable: true,
      configurable: true,
    });
    const user = userEvent.setup();
    render(<App />);
    await expectDashboard();
    await user.click(screen.getByRole("button", { name: "Mở menu" }));
    expect(screen.getByRole("button", { name: "Đóng menu" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Kế hoạch tuần" }));
    await screen.findByRole("heading", {
      name: "Tạo nhịp điệu của riêng bạn.",
    });
    expect(
      screen.getAllByRole("button", { name: /Thêm công việc ngày/ }),
    ).toHaveLength(7);
  });
});
