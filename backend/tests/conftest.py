"""Real HTTP integration fixtures with an isolated SQLAlchemy database per test."""

import os
import subprocess
import sys
from contextlib import ExitStack
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Tests must never inherit a production deployment's cookie policy or database URL.
os.environ["APP_ENV"] = "development"
os.environ["APP_URL"] = "http://localhost:5173"
os.environ["DATABASE_URL"] = "sqlite://"

PASSWORD = "StrongPass!2026"


@pytest.fixture
def api_clients(monkeypatch, tmp_path):
    from app import models, security  # noqa: F401
    from app.database import Base, get_db
    from app.main import app

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    @event.listens_for(engine, "connect")
    def enforce_foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)

    def override_db():
        with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    if hasattr(security, "limiter"):
        security.limiter.clear()
    monkeypatch.setattr(security, "MAILBOX_DIR", tmp_path / "mailbox")
    monkeypatch.delenv("SMTP_HOST", raising=False)
    clients = []
    with ExitStack() as stack:
        def make_client():
            client = stack.enter_context(
                TestClient(app, base_url="http://localhost:5173")
            )
            clients.append(client)
            return client

        make_client.sessions = sessions
        make_client.mailbox = tmp_path / "mailbox"
        yield make_client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def client(api_clients):
    return api_clients()


def register(client, email="alice@example.com", name="Nguyễn An"):
    response = client.post(
        "/api/auth/register",
        json={"name": name, "email": email, "password": PASSWORD},
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def user(client):
    return register(client)


@pytest.fixture
def other_client(api_clients):
    client = api_clients()
    register(client, "bob@example.com", "Trần Bình")
    return client


def create_hierarchy(client):
    year = client.post(
        "/api/roadmap/year",
        json={
            "title": "Thành thạo tiếng Anh",
            "description": "Giao tiếp tự tin trong công việc",
            "why": "Mở rộng cơ hội nghề nghiệp",
            "metric": "IELTS 7.0",
            "priority": "high",
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
        },
    )
    assert year.status_code == 201, year.text
    quarter = client.post(
        "/api/roadmap/quarter",
        json={
            "year_goal_id": year.json()["id"],
            "title": "Củng cố nền tảng",
            "milestones": "Hoàn thành giáo trình B1",
            "metric": "12 bài học",
            "start_date": "2026-01-01",
            "end_date": "2026-03-31",
        },
    )
    assert quarter.status_code == 201, quarter.text
    month = client.post(
        "/api/roadmap/month",
        json={
            "quarter_goal_id": quarter.json()["id"],
            "title": "Tháng 1: từ vựng",
            "focus": "Từ vựng công sở",
            "outcome": "300 từ mới",
            "start_date": "2026-01-01",
            "end_date": "2026-01-31",
        },
    )
    assert month.status_code == 201, month.text
    week = client.post(
        "/api/roadmap/week",
        json={
            "month_plan_id": month.json()["id"],
            "title": "Tuần khởi động",
            "top_priorities": "Học 50 từ; luyện nghe; viết nhật ký",
            "start_date": "2026-01-05",
            "end_date": "2026-01-11",
        },
    )
    assert week.status_code == 201, week.text
    return {
        "year": year.json(),
        "quarter": quarter.json(),
        "month": month.json(),
        "week": week.json(),
    }


@pytest.fixture
def db_session(api_clients):
    with api_clients.sessions() as session:
        yield session


@pytest.fixture
def hierarchy(client, user):
    return create_hierarchy(client)


def migrate_database(database_url):
    """Create a database through the production Alembic entry point."""
    backend = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=backend,
        env={**os.environ, "DATABASE_URL": database_url, "APP_ENV": "development"},
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
