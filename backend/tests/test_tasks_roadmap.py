from uuid import uuid4

import pytest


def add_task(client, **values):
    response = client.post("/api/tasks", json={"title": "Luyện nghe 20 phút", **values})
    assert response.status_code == 201, response.text
    return response.json()


def test_task_create_edit_complete_reopen_delete(client, user):
    task = add_task(client, priority="high", due_at="2026-11-08T09:00:00+07:00", description="Podcast tiếng Anh", notes="Ghi lại 5 từ mới")
    assert task["user_id"] == user["id"]
    assert task["status"] == "todo" and task["completed_at"] is None
    assert task["notes"] == "Ghi lại 5 từ mới"
    edited = client.patch(f"/api/tasks/{task['id']}", json={"title": "Luyện nghe 30 phút", "status": "done"})
    assert edited.status_code == 200, edited.text
    assert edited.json()["completed_at"] is not None
    assert edited.json()["title"] == "Luyện nghe 30 phút"
    reread = client.get("/api/tasks").json()
    assert reread[0]["status"] == "done"
    reopened = client.patch(f"/api/tasks/{task['id']}", json={"status": "todo", "due_at": None})
    assert reopened.status_code == 200
    assert reopened.json()["completed_at"] is None
    assert reopened.json()["due_at"] is None
    assert client.delete(f"/api/tasks/{task['id']}").status_code == 200
    assert client.get("/api/tasks").json() == []
    assert client.patch(f"/api/tasks/{task['id']}", json={"title": "Gone"}).status_code == 404


@pytest.mark.parametrize("payload", [
    {"title": ""}, {"title": "  "}, {"title": "Task", "priority": "urgent"},
    {"title": "Task", "status": "arbitrary"}, {"title": "Task", "due_at": "invalid"},
    {"title": "Task", "due_at": "2026-11-08T09:00:00"},
])
def test_invalid_task_input_is_rejected(client, user, payload):
    assert client.post("/api/tasks", json=payload).status_code == 422
    assert client.get("/api/tasks").json() == []


def test_users_cannot_read_edit_or_delete_each_others_tasks(client, user, other_client):
    task = add_task(client)
    assert other_client.get("/api/tasks").json() == []
    assert other_client.patch(f"/api/tasks/{task['id']}", json={"title": "Hacked"}).status_code == 404
    assert other_client.delete(f"/api/tasks/{task['id']}").status_code == 404
    assert client.get("/api/tasks").json()[0]["title"] == task["title"]


def test_hierarchy_creation_and_lowest_link_infers_ancestors(client, hierarchy):
    task = add_task(client, week_plan_id=hierarchy["week"]["id"])
    assert task["year_goal_id"] == hierarchy["year"]["id"]
    assert task["quarter_goal_id"] == hierarchy["quarter"]["id"]
    assert task["month_plan_id"] == hierarchy["month"]["id"]
    roadmap = client.get("/api/roadmap").json()
    assert all(len(roadmap[key]) == 1 for key in ["year_goals", "quarter_goals", "month_plans", "week_plans"])


def test_progress_uses_descendant_tasks_and_updates_after_completion(client, hierarchy):
    one = add_task(client, week_plan_id=hierarchy["week"]["id"])
    two = add_task(client, month_plan_id=hierarchy["month"]["id"])
    add_task(client, title="Không gắn mục tiêu")
    assert client.patch(f"/api/tasks/{one['id']}", json={"status": "done"}).status_code == 200
    roadmap = client.get("/api/roadmap").json()
    for key in ["year_goals", "quarter_goals", "month_plans"]:
        assert roadmap[key][0]["progress"] == 50
    assert roadmap["week_plans"][0]["progress"] == 100
    client.patch(f"/api/tasks/{two['id']}", json={"status": "done"})
    assert client.get("/api/roadmap").json()["year_goals"][0]["progress"] == 100
    client.patch(f"/api/tasks/{one['id']}", json={"status": "todo"})
    assert client.get("/api/roadmap").json()["year_goals"][0]["progress"] == 50


def test_completed_empty_goal_has_full_progress(client, hierarchy):
    response = client.patch(f"/api/roadmap/year/{hierarchy['year']['id']}", json={"status": "completed"})
    assert response.status_code == 200
    assert client.get("/api/roadmap").json()["year_goals"][0]["progress"] == 100


@pytest.mark.parametrize("kind", ["year", "quarter", "month", "week"])
def test_roadmap_node_is_private(client, hierarchy, other_client, kind):
    node = hierarchy[kind]
    assert all(not values for values in other_client.get("/api/roadmap").json().values())
    assert other_client.patch(f"/api/roadmap/{kind}/{node['id']}", json={"title": "Foreign"}).status_code == 404
    assert other_client.delete(f"/api/roadmap/{kind}/{node['id']}").status_code == 404


@pytest.mark.parametrize("kind,parent_field,parent_kind", [
    ("quarter", "year_goal_id", "year"),
    ("month", "quarter_goal_id", "quarter"),
    ("week", "month_plan_id", "month"),
])
def test_cannot_attach_plans_to_foreign_parent(client, hierarchy, other_client, kind, parent_field, parent_kind):
    response = other_client.post(f"/api/roadmap/{kind}", json={
        "title": "Foreign parent", parent_field: hierarchy[parent_kind]["id"],
        "start_date": "2026-01-05", "end_date": "2026-01-11",
    })
    assert response.status_code in {404, 422}, response.text


@pytest.mark.parametrize("field,kind", [
    ("year_goal_id", "year"), ("quarter_goal_id", "quarter"),
    ("month_plan_id", "month"), ("week_plan_id", "week"),
])
def test_cannot_attach_task_to_foreign_roadmap(client, hierarchy, other_client, field, kind):
    response = other_client.post("/api/tasks", json={"title": "Foreign", field: hierarchy[kind]["id"]})
    assert response.status_code in {404, 422}
    assert other_client.get("/api/tasks").json() == []


def test_mismatched_task_hierarchy_is_rejected(client, hierarchy):
    second = client.post("/api/roadmap/year", json={"title": "Khác", "start_date": "2026-01-01", "end_date": "2026-12-31"}).json()
    response = client.post("/api/tasks", json={
        "title": "Mismatched", "year_goal_id": second["id"], "week_plan_id": hierarchy["week"]["id"],
    })
    assert response.status_code == 422


def test_goal_dates_must_be_ordered(client, user):
    response = client.post("/api/roadmap/year", json={"title": "Invalid dates", "start_date": "2026-12-31", "end_date": "2026-01-01"})
    assert response.status_code == 422


def test_child_dates_stay_within_parent(client, hierarchy):
    response = client.post("/api/roadmap/month", json={
        "quarter_goal_id": hierarchy["quarter"]["id"], "title": "Out of quarter",
        "start_date": "2026-04-01", "end_date": "2026-04-30",
    })
    assert response.status_code == 422


def test_parent_cannot_shrink_to_exclude_existing_children(client, hierarchy):
    response = client.patch(f"/api/roadmap/year/{hierarchy['year']['id']}", json={"start_date": "2026-02-01"})
    assert response.status_code == 422


def test_deleting_roadmap_preserves_tasks_and_unlinks_deleted_ancestors(client, hierarchy):
    task = add_task(client, week_plan_id=hierarchy["week"]["id"])
    response = client.delete(f"/api/roadmap/year/{hierarchy['year']['id']}")
    assert response.status_code == 200, response.text
    assert all(not values for values in client.get("/api/roadmap").json().values())
    retained = client.get("/api/tasks").json()
    assert retained[0]["id"] == task["id"]
    assert all(retained[0][field] is None for field in ["year_goal_id", "quarter_goal_id", "month_plan_id", "week_plan_id"])


def test_nonexistent_task_id_is_safe(client, user):
    assert client.patch(f"/api/tasks/{uuid4()}", json={"title": "Absent"}).status_code == 404
    assert client.delete(f"/api/tasks/{uuid4()}").status_code == 404


def test_patching_task_to_new_year_clears_descendant_links(client, hierarchy):
    task = add_task(client, week_plan_id=hierarchy["week"]["id"])
    second_year = client.post("/api/roadmap/year", json={"title": "Mục tiêu mới", "start_date": "2026-01-01", "end_date": "2026-12-31"}).json()
    response = client.patch(f"/api/tasks/{task['id']}", json={"year_goal_id": second_year["id"]})
    assert response.status_code == 200, response.text
    moved = response.json()
    assert moved["year_goal_id"] == second_year["id"]
    assert all(moved[field] is None for field in ["quarter_goal_id", "month_plan_id", "week_plan_id"])


def test_patching_task_to_other_month_resolves_new_ancestors(client, hierarchy):
    task = add_task(client, week_plan_id=hierarchy["week"]["id"])
    quarter = client.post("/api/roadmap/quarter", json={
        "year_goal_id": hierarchy["year"]["id"], "title": "Quý 2",
        "start_date": "2026-04-01", "end_date": "2026-06-30",
    }).json()
    month = client.post("/api/roadmap/month", json={
        "quarter_goal_id": quarter["id"], "title": "Tháng 4",
        "start_date": "2026-04-01", "end_date": "2026-04-30",
    }).json()
    response = client.patch(f"/api/tasks/{task['id']}", json={"month_plan_id": month["id"]})
    assert response.status_code == 200, response.text
    moved = response.json()
    assert moved["quarter_goal_id"] == quarter["id"]
    assert moved["month_plan_id"] == month["id"]
    assert moved["week_plan_id"] is None


def test_patch_rejects_foreign_link_without_modifying_task(client, hierarchy, other_client):
    task = add_task(other_client)
    response = other_client.patch(f"/api/tasks/{task['id']}", json={"week_plan_id": hierarchy["week"]["id"], "title": "Changed"})
    assert response.status_code in {404, 422}
    retained = other_client.get("/api/tasks").json()[0]
    assert retained["title"] == task["title"]
    assert retained["week_plan_id"] is None


@pytest.mark.parametrize("kind,expected_remaining", [
    ("quarter", [1, 0, 0, 0]), ("month", [1, 1, 0, 0]), ("week", [1, 1, 1, 0]),
])
def test_deleting_intermediate_plan_removes_only_descendants(client, hierarchy, kind, expected_remaining):
    task = add_task(client, week_plan_id=hierarchy["week"]["id"])
    assert client.delete(f"/api/roadmap/{kind}/{hierarchy[kind]['id']}").status_code == 200
    roadmap = client.get("/api/roadmap").json()
    assert [len(roadmap[key]) for key in ["year_goals", "quarter_goals", "month_plans", "week_plans"]] == expected_remaining
    retained = client.get("/api/tasks").json()[0]
    assert retained["id"] == task["id"]
    assert retained["year_goal_id"] == hierarchy["year"]["id"]
    assert retained["week_plan_id"] is None
