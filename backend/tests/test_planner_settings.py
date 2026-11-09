from datetime import date, timedelta

import pytest
from conftest import PASSWORD


@pytest.fixture
def planner_input():
    return {
        "goal": "Đạt IELTS 7.0",
        "deadline": (date.today() + timedelta(days=365)).isoformat(),
        "metric": "IELTS 7.0, không kỹ năng nào dưới 6.5",
        "resources": "Trình độ B1, có giáo trình và bạn luyện nói",
        "hours_per_week": 8,
        "obstacles": "Lịch làm việc thay đổi, dễ mất tập trung",
    }


def test_planner_requires_login(client, planner_input):
    assert client.post("/api/planner/preview", json=planner_input).status_code == 401
    assert client.post("/api/planner/apply", json=planner_input).status_code == 401


def test_planner_preview_is_deterministic_and_does_not_write(client, user, planner_input):
    response = client.post("/api/planner/preview", json=planner_input)
    assert response.status_code == 200, response.text
    preview = response.json()
    assert set(preview) >= {"title", "summary", "phases", "year_goal", "quarter_goals", "month_plan", "week_plans", "tasks", "risks"}
    assert preview["quarter_goals"]
    assert len(preview["week_plans"]) == 4
    assert len(preview["tasks"]) >= 3
    assert preview["risks"] and all("mitigation" in risk for risk in preview["risks"])
    assert client.post("/api/planner/preview", json=planner_input).json() == preview
    assert all(not values for values in client.get("/api/roadmap").json().values())
    assert client.get("/api/tasks").json() == []


def test_planner_apply_appends_hierarchy_without_overwriting(client, hierarchy, planner_input, other_client):
    response = client.post("/api/planner/apply", json=planner_input)
    assert response.status_code in {200, 201}, response.text
    new_id = response.json()["year_goal_id"]
    roadmap = client.get("/api/roadmap").json()
    assert len(roadmap["year_goals"]) == 2
    assert {goal["id"] for goal in roadmap["year_goals"]} == {hierarchy["year"]["id"], new_id}
    assert len(roadmap["week_plans"]) >= 5
    tasks = client.get("/api/tasks").json()
    assert len(tasks) >= 3
    assert all(task["year_goal_id"] == new_id for task in tasks)
    assert all(not values for values in other_client.get("/api/roadmap").json().values())
    assert other_client.get("/api/tasks").json() == []
    second = client.post("/api/planner/apply", json=planner_input)
    assert second.status_code in {200, 201}
    assert len(client.get("/api/roadmap").json()["year_goals"]) == 3


@pytest.mark.parametrize("updates", [
    {"hours_per_week": 0}, {"hours_per_week": 81}, {"hours_per_week": -5},
    {"deadline": "2000-01-01"}, {"deadline": "9999-12-31"}, {"metric": ""}, {"resources": ""}, {"goal": ""},
])
def test_planner_validates_constraints(client, user, planner_input, updates):
    assert client.post("/api/planner/preview", json={**planner_input, **updates}).status_code == 422
    assert client.post("/api/planner/apply", json={**planner_input, **updates}).status_code == 422
    assert all(not values for values in client.get("/api/roadmap").json().values())


def test_reminder_defaults_and_persistence_are_per_account(client, user, other_client, api_clients):
    initial = client.get("/api/settings/reminders").json()
    assert initial["timezone"] == "Asia/Bangkok"
    assert initial["enabled"] is False
    settings = {"enabled": True, "daily_time": "07:45", "timezone": "America/New_York", "before_minutes": 30}
    saved = client.put("/api/settings/reminders", json=settings)
    assert saved.status_code == 200, saved.text
    assert all(saved.json()[key] == value for key, value in settings.items())
    assert all(client.get("/api/settings/reminders").json()[key] == value for key, value in settings.items())
    assert other_client.get("/api/settings/reminders").json()["enabled"] is False
    browser = api_clients()
    assert browser.post("/api/auth/login", json={"email": user["email"], "password": PASSWORD}).status_code == 200
    assert browser.get("/api/settings/reminders").json()["timezone"] == "America/New_York"


@pytest.mark.parametrize("updates", [
    {"daily_time": "25:00"}, {"daily_time": "09:99"}, {"daily_time": "9:00"},
    {"timezone": "Mars/Olympus"}, {"before_minutes": -1}, {"before_minutes": 1441},
    {"user_id": "someone-else"},
])
def test_reminder_invalid_settings_are_rejected(client, user, updates):
    response = client.put("/api/settings/reminders", json={"enabled": True, "daily_time": "08:00", "timezone": "Asia/Bangkok", "before_minutes": 15, **updates})
    assert response.status_code == 422
    assert client.get("/api/settings/reminders").json()["enabled"] is False


def test_weekly_review_upsert_is_isolated(client, user, other_client):
    payload = {"summary": "Tuần có tiến bộ", "wins": "Hoàn thành 5 việc", "improvements": "Tập trung hơn buổi sáng"}
    response = client.put("/api/reviews/2026-11-02", json=payload)
    assert response.status_code == 200, response.text
    review_id = response.json()["id"]
    assert response.json()["user_id"] == user["id"]
    saved = client.put("/api/reviews/2026-11-02", json={**payload, "summary": "Đã cập nhật"})
    assert saved.json()["id"] == review_id
    reviews = client.get("/api/reviews").json()
    assert len(reviews) == 1 and reviews[0]["summary"] == "Đã cập nhật"
    assert other_client.get("/api/reviews").json() == []
    other_client.put("/api/reviews/2026-11-02", json={**payload, "summary": "Riêng của Bình"})
    assert client.get("/api/reviews").json()[0]["summary"] == "Đã cập nhật"


def test_weekly_review_requires_monday(client, user):
    assert client.put("/api/reviews/2026-11-03", json={"summary": "Tuesday"}).status_code == 422


def test_demo_data_is_opt_in_idempotent_and_owned(client, user, other_client):
    assert client.get("/api/tasks").json() == []
    assert client.post("/api/demo/seed").status_code == 200
    first_tasks = client.get("/api/tasks").json()
    first_roadmap = client.get("/api/roadmap").json()
    assert first_tasks and first_roadmap["year_goals"]
    assert all(task["user_id"] == user["id"] for task in first_tasks)
    assert client.post("/api/demo/seed").status_code == 200
    assert {task["id"] for task in client.get("/api/tasks").json()} == {task["id"] for task in first_tasks}
    assert client.get("/api/roadmap").json() == first_roadmap
    assert other_client.get("/api/tasks").json() == []
    assert other_client.post("/api/demo/seed").status_code == 200
    assert not ({task["id"] for task in first_tasks} & {task["id"] for task in other_client.get("/api/tasks").json()})


def test_tasks_survive_logout_and_login_from_another_browser(client, user, api_clients):
    created = client.post("/api/tasks", json={"title": "Dữ liệu bền vững"}).json()
    client.post("/api/auth/logout")
    browser = api_clients()
    assert browser.post("/api/auth/login", json={"email": user["email"], "password": PASSWORD}).status_code == 200
    assert browser.get("/api/tasks").json()[0]["id"] == created["id"]


def test_applied_plan_preserves_preview_due_instants_across_timezone_storage(client, user, planner_input):
    from datetime import UTC, datetime

    preview = client.post("/api/planner/preview", json=planner_input).json()
    expected = {
        task["title"]: datetime.fromisoformat(task["due_at"]).astimezone(UTC)
        for task in preview["tasks"]
    }
    response = client.post("/api/planner/apply", json=planner_input)
    assert response.status_code == 201
    saved = client.get("/api/tasks").json()
    assert len(saved) == len(expected)
    for task in saved:
        stored = datetime.fromisoformat(task["due_at"])
        assert stored.tzinfo is not None
        assert stored.astimezone(UTC) == expected[task["title"]]
