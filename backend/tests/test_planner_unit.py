from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.schemas import PlannerInput
from app.services.planner import build_plan


def make_input(**updates):
    today = datetime.now(ZoneInfo("Asia/Bangkok")).date()
    return PlannerInput.model_validate({
        "goal": "Viết sách đầu tiên",
        "deadline": (today + timedelta(days=365)).isoformat(),
        "metric": "Bản thảo 50.000 từ",
        "resources": "Đã có đề cương và 3 chương",
        "hours_per_week": 6,
        "obstacles": "Dễ bỏ dở khi công việc bận",
        **updates,
    })


def test_planner_phases_cover_entire_deadline_without_gaps():
    data = make_input()
    plan = build_plan(data)
    cursor = date.fromisoformat(plan["year_goal"]["start_date"])
    for phase in plan["quarter_goals"]:
        start = date.fromisoformat(phase["start_date"])
        end = date.fromisoformat(phase["end_date"])
        assert start == cursor
        assert start <= end <= data.deadline
        cursor = end + timedelta(days=1)
    assert cursor == data.deadline + timedelta(days=1)


def test_planner_preserves_measurable_result_resources_and_constraints():
    data = make_input()
    plan = build_plan(data)
    assert plan["year_goal"]["metric"] == data.metric
    assert data.resources in plan["year_goal"]["description"]
    assert any(data.obstacles in entry["risk"] for entry in plan["risks"])
    assert str(data.hours_per_week).rstrip(".0") in plan["summary"]
    for task in plan["tasks"]:
        due = datetime.fromisoformat(task["due_at"])
        assert due.tzinfo is not None
        assert due.date() <= data.deadline


@pytest.mark.parametrize("remaining_days", [0, 1, 3, 7, 28])
def test_short_deadline_never_produces_tasks_or_plans_beyond_deadline(remaining_days):
    today = datetime.now(ZoneInfo("Asia/Bangkok")).date()
    data = make_input(deadline=(today + timedelta(days=remaining_days)).isoformat())
    plan = build_plan(data)
    for node in [plan["month_plan"], *plan["week_plans"]]:
        assert today <= date.fromisoformat(node["start_date"]) <= date.fromisoformat(node["end_date"]) <= data.deadline
    for task in plan["tasks"]:
        assert datetime.fromisoformat(task["due_at"]).date() <= data.deadline
    if remaining_days < 28:
        assert any("thời hạn" in risk["risk"].lower() for risk in plan["risks"])


def test_first_four_weeks_remain_distinct_across_calendar_quarter_boundary(monkeypatch):
    from app.services import planner

    class EndOfQuarter(datetime):
        @classmethod
        def now(cls, tz=None):
            fixed = datetime(2028, 12, 31, 9, tzinfo=ZoneInfo("Asia/Bangkok"))
            return fixed.astimezone(tz) if tz else fixed.replace(tzinfo=None)

    monkeypatch.setattr(planner, "datetime", EndOfQuarter)
    plan = planner.build_plan(make_input(deadline="2029-06-30"))
    weeks = plan["week_plans"]
    assert len(weeks) == 4
    assert len({week["start_date"] for week in weeks}) == 4
    assert weeks[0]["start_date"] == "2028-12-31"
    assert weeks[-1]["end_date"] == "2029-01-27"
    for previous, following in zip(weeks, weeks[1:]):
        assert date.fromisoformat(previous["end_date"]) + timedelta(days=1) == date.fromisoformat(following["start_date"])


@pytest.mark.parametrize("hours", [1, 6, 80])
def test_planner_scheduled_work_respects_weekly_time_budget(hours):
    import re

    plan = build_plan(make_input(hours_per_week=hours))
    for index in range(len(plan["week_plans"])):
        minutes = 0
        for task in plan["tasks"]:
            if task["week_index"] == index:
                amount = re.search(r"Thời lượng dự kiến: (\d+) phút", task["description"])
                assert amount is not None, "Users need an explicit effort estimate to review feasibility"
                minutes += int(amount.group(1))
        assert 0 < minutes <= hours * 60
