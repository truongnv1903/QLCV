"""Verify durable storage across a complete engine/client replacement."""

from conftest import PASSWORD, create_hierarchy, migrate_database, register
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker


def test_file_database_survives_restart_and_new_device_login(tmp_path):
    from app import security
    from app.database import get_db
    from app.main import app

    database_url = f"sqlite:///{tmp_path / 'durable.sqlite'}"
    migrate_database(database_url)
    security.limiter.clear()
    engines = []
    previous_override = app.dependency_overrides.get(get_db)

    def replace_engine():
        engine = create_engine(database_url, connect_args={"check_same_thread": False})
        engines.append(engine)

        @event.listens_for(engine, "connect")
        def enforce_foreign_keys(connection, _record):
            connection.execute("PRAGMA foreign_keys=ON")

        sessions = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

        def get_file_db():
            with sessions() as session:
                yield session

        app.dependency_overrides[get_db] = get_file_db
        return engine

    try:
        first_engine = replace_engine()
        with TestClient(app, base_url="http://localhost:5173") as first_device:
            owner = register(first_device)
            hierarchy = create_hierarchy(first_device)
            response = first_device.post("/api/tasks", json={
                "title": "Tiếp tục trên thiết bị khác",
                "description": "Dữ liệu thật trong database đã migration",
                "week_plan_id": hierarchy["week"]["id"],
                "priority": "high",
                "due_at": "2026-01-06T09:30:00+07:00",
            })
            assert response.status_code == 201, response.text
            task = response.json()
            settings = {
                "enabled": True,
                "daily_time": "17:30",
                "timezone": "Asia/Ho_Chi_Minh",
                "before_minutes": 30,
            }
            assert first_device.put("/api/settings/reminders", json=settings).status_code == 200

        # No open TestClient or SQLAlchemy connection/session survives this boundary.
        first_engine.dispose()
        second_engine = replace_engine()
        assert second_engine is not first_engine
        with TestClient(app, base_url="http://localhost:5173") as second_device:
            assert second_device.get("/api/tasks").status_code == 401
            assert second_device.get("/api/roadmap").status_code == 401
            login = second_device.post("/api/auth/login", json={
                "email": owner["email"], "password": PASSWORD,
            })
            assert login.status_code == 200, login.text
            assert login.json()["id"] == owner["id"]
            saved_tasks = second_device.get("/api/tasks").json()
            assert len(saved_tasks) == 1
            assert saved_tasks[0]["id"] == task["id"]
            assert saved_tasks[0]["week_plan_id"] == hierarchy["week"]["id"]
            assert saved_tasks[0]["due_at"] == task["due_at"]
            saved_roadmap = second_device.get("/api/roadmap").json()
            for kind, collection in [
                ("year", "year_goals"), ("quarter", "quarter_goals"),
                ("month", "month_plans"), ("week", "week_plans"),
            ]:
                assert len(saved_roadmap[collection]) == 1
                assert saved_roadmap[collection][0]["id"] == hierarchy[kind]["id"]
            assert second_device.get("/api/settings/reminders").json() == settings
            completed = second_device.patch(f"/api/tasks/{task['id']}", json={"status": "done"})
            assert completed.status_code == 200
            assert second_device.get("/api/roadmap").json()["year_goals"][0]["progress"] == 100

        with TestClient(app, base_url="http://localhost:5173") as unrelated_device:
            register(unrelated_device, "other@example.com", "Người dùng khác")
            assert unrelated_device.get("/api/tasks").json() == []
            assert all(not nodes for nodes in unrelated_device.get("/api/roadmap").json().values())
            assert unrelated_device.get("/api/settings/reminders").json()["enabled"] is False
            assert unrelated_device.patch(f"/api/tasks/{task['id']}", json={"title": "Foreign"}).status_code == 404
    finally:
        if previous_override is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = previous_override
        for engine in engines:
            engine.dispose()
        security.limiter.clear()
