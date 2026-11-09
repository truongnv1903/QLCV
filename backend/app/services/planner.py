"""Rule-based planning provider; persistence is separate so an AI provider can replace it.

Quarters are rolling 90-day stages from the requested start, not calendar quarters.
The first month is 28 days. A short deadline compresses the number of actual weeks.
"""
import unicodedata
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from ..schemas import PlannerInput


def _work_templates(goal: str) -> list[tuple[str, str]]:
    normalized = "".join(c for c in unicodedata.normalize("NFD", goal.lower()) if unicodedata.category(c) != "Mn")
    if any(word in normalized for word in ["hoc", "ielts", "tieng", "learn", "chung chi", "doc sach"]):
        return [("Đánh giá kiến thức và chọn nội dung học", "Chọn một nội dung cụ thể của mục tiêu; kiểm tra kiến thức hiện tại để tìm điểm cần cải thiện."), ("Thực hành một bài tập có kết quả kiểm tra được", "Tập trung vào phần kiến thức còn yếu, hoàn thành bài tập và lưu lại kết quả."), ("Tự kiểm tra và ghi lại lỗi cần sửa", "So sánh kết quả với chỉ số mục tiêu; chọn một lỗi quan trọng để khắc phục ở phiên tiếp theo.")]
    if any(word in normalized for word in ["suc khoe", "chay", "the duc", "gym", "thoi quen", "health"]):
        return [("Lên lịch một phiên thực hành phù hợp", "Chọn thời gian và hoạt động phù hợp với khả năng hiện tại; chuẩn bị những gì cần thiết."), ("Thực hiện phiên thực hành đã lên lịch", "Thực hành trong giới hạn thoải mái, ghi nhận thời gian thực tế và cảm nhận sau phiên."), ("Ghi lại nhịp duy trì và điều chỉnh tuần tới", "Đối chiếu chỉ số đã chọn với kết quả thực tế; ưu tiên tính đều đặn và điều chỉnh khối lượng phù hợp.")]
    if any(word in normalized for word in ["tiet kiem", "tai chinh", "ngan sach", "finance", "chi tieu"]):
        return [("Ghi nhận thu chi và số liệu hiện tại", "Tổng hợp dữ liệu thực tế liên quan đến chỉ số mục tiêu; không ước lượng khi đã có số liệu."), ("Chọn một điều chỉnh nhỏ trong ngân sách", "Chọn một thay đổi có thể thực hiện tuần này; ghi rõ số tiền và thời điểm kiểm tra."), ("Kiểm tra thay đổi và cập nhật bảng theo dõi", "Đối chiếu thu chi thực tế với dự kiến và điều chỉnh kế hoạch cho tuần tiếp theo.")]
    if any(word in normalized for word in ["du an", "san pham", "ung dung", "nghe nghiep", "cong viec", "project", "portfolio", "web"]):
        return [("Chốt một đầu ra nhỏ cho cột mốc tuần", "Mô tả rõ sản phẩm bàn giao và tiêu chí hoàn thành; chia thành các bước có thể làm ngay."), ("Hoàn thiện phiên bản đầu tiên của đầu ra", "Dành một phiên tập trung cho phần mang lại giá trị lớn nhất; lưu lại kết quả có thể chia sẻ."), ("Thu nhận phản hồi và cải thiện đầu ra", "Tự kiểm tra hoặc xin phản hồi cụ thể, sau đó sửa một vấn đề quan trọng nhất.")]
    return [("Chọn một kết quả cụ thể cần đạt trong tuần", "Chia mục tiêu thành một đầu ra nhỏ và viết tiêu chí hoàn thành rõ ràng."), ("Thực hiện một phiên tập trung cho kết quả đã chọn", "Chuẩn bị nguồn lực, làm bước quan trọng nhất và lưu lại bằng chứng kết quả."), ("Đối chiếu kết quả và hoàn thiện một điểm", "So sánh với chỉ số mục tiêu; sửa một điểm chưa đạt và ghi lại bước tiếp theo.")]


def build_plan(data: PlannerInput) -> dict:
    today = datetime.now(ZoneInfo("Asia/Bangkok")).date()
    deadline = data.deadline
    phases = ["Làm rõ kết quả và chuẩn bị nguồn lực", "Xây nền tảng qua thực hành đều đặn", "Tăng độ khó và tạo sản phẩm thực tế", "Đo lường, hoàn thiện và tổng kết"]
    quarter_goals: list[dict[str, str]] = []
    start = today
    while start <= deadline:
        end = min(deadline, start + timedelta(days=89))
        number = len(quarter_goals) + 1
        phase = phases[min(number - 1, 3)]
        quarter_goals.append({"title": f"Quý kế hoạch {number} · {phase}", "description": f"Giai đoạn cuốn chiếu tối đa 90 ngày từ ngày bắt đầu, không theo quý lịch. Tạo kết quả có thể kiểm chứng cho: {data.goal}.", "milestones": "Xác định đầu ra → Thực hành → Đánh giá và điều chỉnh", "metric": data.metric, "start_date": start.isoformat(), "end_date": end.isoformat(), "status": "active"})
        start = end + timedelta(days=1)
    first_end = min(deadline, today + timedelta(days=27))
    weeks: list[dict[str, str]] = []
    for index in range(4):
        start = today + timedelta(days=7 * index)
        if start > first_end:
            break
        end = min(first_end, start + timedelta(days=6))
        weeks.append({"title": f"Tuần {index + 1} · {phases[index]}", "description": f"Dành tối đa {data.hours_per_week:g} giờ; lên lịch khoảng 80% và giữ 20% dự phòng.", "top_priorities": "\n".join([phases[index], f"Kiểm chứng: {data.metric}", "Tổng kết và điều chỉnh vào cuối tuần"]), "start_date": start.isoformat(), "end_date": end.isoformat(), "status": "active"})
    tasks: list[dict] = []
    context = f"Mục tiêu: {data.goal}\nKết quả cần đo: {data.metric}\nNguồn lực: {data.resources}"
    starters = ["Làm rõ tiêu chí thành công", "Kiểm kê nguồn lực hiện có", "Đặt lịch phiên tập trung đầu tiên"]
    for index, title in enumerate(starters):
        due = datetime.combine(today, time(9 + 3 * index), tzinfo=ZoneInfo("Asia/Bangkok"))
        tasks.append({"title": title, "description": f"{context}\nThời lượng dự kiến: 5 phút. Ghi lại một kết quả cụ thể trước khi hoàn thành.", "priority": "high" if index == 0 else "medium", "due_at": due.isoformat(), "week_index": 0, "status": "todo"})
    templates = _work_templates(data.goal)
    planned_minutes = max(30, int(data.hours_per_week * 60 * 0.8))
    for index, week in enumerate(weeks):
        start = datetime.fromisoformat(week["start_date"]).date()
        end = datetime.fromisoformat(week["end_date"]).date()
        review_minutes = max(5, int(planned_minutes * 0.1))
        available = max(3, planned_minutes - review_minutes - (15 if index == 0 else 0))
        for task_index, (title, instruction) in enumerate(templates):
            duration = available // 3 + (1 if task_index < available % 3 else 0)
            due_day = min(end, start + timedelta(days=[1, 3, 5][task_index]))
            due = datetime.combine(due_day, time(10 + task_index * 2), tzinfo=ZoneInfo("Asia/Bangkok"))
            tasks.append({"title": f"Tuần {index + 1} · {title}", "description": f"{instruction}\n{context}\nThời lượng dự kiến: {duration} phút. Nếu cần, chia thành nhiều phiên 45–60 phút.", "priority": "high" if task_index == 1 else "medium", "due_at": due.isoformat(), "week_index": index, "status": "todo"})
        due = datetime.combine(end, time(17), tzinfo=ZoneInfo("Asia/Bangkok"))
        tasks.append({"title": f"Tổng kết tuần {index + 1} và kiểm tra chỉ số", "description": f"Thời lượng dự kiến: {review_minutes} phút. Ghi lại tiến độ: {data.metric}. Điều chỉnh khối lượng tuần tiếp theo theo thời gian thực tế.", "priority": "medium", "due_at": due.isoformat(), "week_index": index, "status": "todo"})
    risks = [
        {"risk": data.obstacles or "Dễ mất tập trung khi có việc phát sinh", "mitigation": "Chia nhỏ đầu việc; bảo vệ ít nhất hai phiên tập trung mỗi tuần và chừa 20% thời gian dự phòng."},
        {"risk": "Kế hoạch có thể vượt quá năng lực hiện tại", "mitigation": f"Bắt đầu từ nguồn lực: {data.resources}. Đánh giá lại mỗi tuần; giới hạn khối lượng trong {data.hours_per_week:g} giờ."},
        {"risk": "Tiến độ công việc chưa phản ánh toàn bộ kết quả mục tiêu", "mitigation": f"Đối chiếu định kỳ chỉ số kết quả: {data.metric}; chỉ tăng khối lượng khi chất lượng đã đạt."},
    ]
    if (deadline - today).days < 28:
        risks.append({"risk": "Thời hạn ngắn hơn bốn tuần", "mitigation": "Chỉ tạo các tuần nằm trong thời hạn, không lặp ngày để đủ số tuần. Giảm phạm vi và ưu tiên kết quả tối thiểu đo được."})
    return {"title": data.goal, "summary": f"Đề xuất theo quy tắc, dựa trên {data.hours_per_week:g} giờ/tuần; quý kế hoạch là giai đoạn cuốn chiếu tối đa 90 ngày. Hãy rà soát trước khi áp dụng.", "phases": phases, "year_goal": {"title": data.goal, "description": f"Kết quả mong muốn: {data.metric}\nNguồn lực hiện tại: {data.resources}\nTrở ngại: {data.obstacles}", "why": "Duy trì một hướng đi rõ ràng và tiến bộ mỗi tuần.", "metric": data.metric, "priority": "high", "start_date": today.isoformat(), "end_date": deadline.isoformat(), "status": "active"}, "quarter_goals": quarter_goals, "month_plan": {"title": "Tháng đầu tiên · Xây nền tảng", "description": "Kế hoạch cuốn chiếu tối đa 28 ngày đầu tiên.", "focus": f"Dành {data.hours_per_week:g} giờ mỗi tuần cho mục tiêu", "outcome": data.metric, "start_date": today.isoformat(), "end_date": first_end.isoformat(), "status": "active"}, "week_plans": weeks, "tasks": tasks, "risks": risks}
