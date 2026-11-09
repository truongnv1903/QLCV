from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import MonthPlan, Profile, QuarterGoal, Task, User, WeekPlan, YearGoal


def seed_for_user(db: Session, user: User) -> str:
    profile = db.scalar(select(Profile).where(Profile.user_id == user.id))
    if profile and profile.demo_seeded:
        return "Bạn đã có dữ liệu khởi đầu. Hãy tiếp tục tạo kế hoạch của riêng mình."
    now = datetime.now(ZoneInfo("Asia/Bangkok"))
    today = now.date()
    year_start, year_end = today.replace(month=1, day=1), today.replace(month=12, day=31)
    quarter_number = (today.month - 1) // 3 + 1
    quarter_start = today.replace(month=(quarter_number - 1) * 3 + 1, day=1)
    if quarter_number == 4:
        quarter_end = year_end
    else:
        quarter_end = today.replace(month=quarter_number * 3 + 1, day=1) - timedelta(days=1)
    month_start = today.replace(day=1)
    month_end = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    monday = today - timedelta(days=today.weekday())
    week_start, week_end = max(month_start, monday), min(month_end, monday + timedelta(days=6))
    year = YearGoal(user_id=user.id, title="Xây dựng phiên bản tốt hơn của chính mình", description="Một năm sống có định hướng: phát triển nghề nghiệp, học tập và sức khỏe.", why="Mỗi bước nhỏ hôm nay tạo nên thay đổi lớn ngày mai.", metric="Hoàn thành 3 dự án cá nhân và duy trì thói quen học tập mỗi tuần", priority="high", start_date=year_start, end_date=year_end)
    db.add(year)
    db.flush()
    quarter = QuarterGoal(user_id=user.id, year_goal_id=year.id, title=f"Quý {quarter_number} · Tập trung để bứt phá", description="Biến kiến thức thành kết quả thực tế và có thể đo lường.", milestones="Hoàn thiện dự án cá nhân; chia sẻ một bài học mỗi tuần", metric="1 dự án hoàn chỉnh và 12 buổi học", start_date=quarter_start, end_date=quarter_end)
    db.add(quarter)
    db.flush()
    month = MonthPlan(user_id=user.id, quarter_goal_id=quarter.id, title=f"Tháng {today.month} · Tạo đà tiến bước", description="Duy trì nhịp thực hành và dành thời gian cho điều quan trọng.", focus="Hoàn thiện sản phẩm đầu tiên", outcome="Một bản thử nghiệm có thể chia sẻ", start_date=month_start, end_date=month_end)
    db.add(month)
    db.flush()
    week = WeekPlan(user_id=user.id, month_plan_id=month.id, title="Tuần này · Những bước nhỏ, tiến bộ lớn", top_priorities="Hoàn thành phần quan trọng nhất của dự án\nHọc và thực hành 3 buổi\nDành thời gian tổng kết cuối tuần", start_date=week_start, end_date=week_end)
    db.add(week)
    db.flush()
    refs = {"year_goal_id": year.id, "quarter_goal_id": quarter.id, "month_plan_id": month.id, "week_plan_id": week.id}
    samples = [
        ("Lên kế hoạch cho một tuần có chủ đích", "Chọn ba việc quan trọng nhất và đặt thời gian thực hiện.", 0, 9, "high", True),
        ("Dành 45 phút cho dự án cá nhân", "Tắt thông báo và tập trung vào phần việc mang lại giá trị lớn nhất.", 0, 14, "high", False),
        ("Đọc 20 trang sách và ghi lại một điều học được", "Một chút kiến thức mỗi ngày sẽ đưa bạn đi xa.", 0, 20, "medium", False),
        ("Đi bộ 30 phút, nạp lại năng lượng", "Dành một khoảng thời gian cho sức khỏe và tinh thần.", 0, 18, "low", False),
        ("Sắp xếp lại tài liệu dự án", "Gom những ý tưởng còn rời rạc thành một danh sách rõ ràng.", -1, 17, "medium", False),
        ("Rà soát các cột mốc của tháng", "Đối chiếu kết quả thực tế với mục tiêu đã đặt ra.", 1, 10, "high", False),
        ("Chia sẻ bản thử nghiệm với một người bạn", "Xin một góp ý cụ thể để cải thiện sản phẩm.", 2, 15, "medium", False),
    ]
    for title, description, offset, hour, priority, done in samples:
        due = datetime.combine(today + timedelta(days=offset), time(hour), tzinfo=ZoneInfo("Asia/Bangkok"))
        db.add(Task(user_id=user.id, title=title, description=description, status="done" if done else "todo", completed_at=now.astimezone(UTC) if done else None, priority=priority, due_at=due.astimezone(UTC), **refs))
    # A few real dated samples give weekly trend context without any shared account.
    for offset in [1, 2, 3, 5, 8, 9, 12]:
        completed = now - timedelta(days=offset)
        db.add(Task(user_id=user.id, title="Phiên tập trung · Bước tiến nhỏ", description="Dữ liệu mẫu để bạn khám phá thống kê cá nhân.", status="done", completed_at=completed.astimezone(UTC), priority="medium", due_at=completed.astimezone(UTC), year_goal_id=year.id, quarter_goal_id=quarter.id, month_plan_id=month.id))
    if profile:
        profile.demo_seeded = True
    db.flush()
    return "Đã tạo dữ liệu khởi đầu dành riêng cho tài khoản của bạn."
