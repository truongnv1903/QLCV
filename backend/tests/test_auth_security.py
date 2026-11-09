from uuid import uuid4

import pytest
from conftest import PASSWORD, register


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("GET", "/api/auth/me", None),
        ("GET", "/api/tasks", None),
        ("POST", "/api/tasks", {"title": "Không được lưu"}),
        ("GET", "/api/roadmap", None),
        ("POST", "/api/roadmap/year", {"title": "Chưa đăng nhập", "start_date": "2026-01-01", "end_date": "2026-12-31"}),
        ("GET", "/api/settings/reminders", None),
        ("PUT", "/api/settings/reminders", {"enabled": True, "daily_time": "09:00", "timezone": "Asia/Bangkok", "before_minutes": 15}),
        ("GET", "/api/reviews", None),
        ("PUT", "/api/reviews/2026-11-02", {"summary": "private", "wins": "", "improvements": ""}),
        ("POST", "/api/demo/seed", None),
        ("PATCH", "/api/profile", {"name": "Unauthorized"}),
    ],
)
def test_business_endpoints_require_session(client, method, path, payload):
    response = client.request(method, path, json=payload)
    assert response.status_code == 401, response.text


def test_register_session_login_logout_roundtrip(client):
    user = register(client)
    assert user["name"] == "Nguyễn An"
    assert user["email"] == "alice@example.com"
    assert "password" not in user and "password_hash" not in user
    assert client.get("/api/auth/me").json()["id"] == user["id"]
    cookie = client.cookies.get("laban_session")
    assert cookie and len(cookie) >= 32
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401
    response = client.post("/api/auth/login", json={"email": user["email"], "password": PASSWORD})
    assert response.status_code == 200, response.text
    assert response.json()["id"] == user["id"]
    assert client.cookies.get("laban_session") != cookie
    assert client.get("/api/auth/me").status_code == 200


def test_registration_session_cookie_is_httponly_and_samesite(client):
    response = client.post("/api/auth/register", json={"name": "An", "email": "an@example.com", "password": PASSWORD})
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    assert "path=/" in cookie


def test_logout_revokes_copied_cookie(client, api_clients, user):
    stolen = client.cookies.get("laban_session")
    client.post("/api/auth/logout")
    another_browser = api_clients()
    another_browser.cookies.set("laban_session", stolen)
    assert another_browser.get("/api/auth/me").status_code == 401


def test_wrong_password_and_unknown_account_are_generic(client, user):
    client.post("/api/auth/logout")
    wrong = client.post("/api/auth/login", json={"email": user["email"], "password": "WrongPassword!2026"})
    unknown = client.post("/api/auth/login", json={"email": "missing@example.com", "password": "WrongPassword!2026"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()
    assert client.get("/api/auth/me").status_code == 401


def test_forged_session_never_authenticates(client):
    client.cookies.set("laban_session", str(uuid4()))
    assert client.get("/api/auth/me").status_code == 401


@pytest.mark.parametrize("payload", [
    {"name": "", "email": "person@example.com", "password": PASSWORD},
    {"name": "Name", "email": "not-an-email", "password": PASSWORD},
    {"name": "Name", "email": "person@example.com", "password": "short"},
    {"name": "Name", "email": "person@example.com", "password": PASSWORD, "user_id": str(uuid4())},
])
def test_registration_validates_inputs(client, payload):
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 422, response.text


def test_duplicate_email_is_case_insensitive(client, user):
    response = client.post("/api/auth/register", json={"name": "Other", "email": "ALICE@EXAMPLE.COM", "password": PASSWORD})
    assert response.status_code == 409, response.text


def test_cross_site_mutation_is_rejected(client, user):
    response = client.post("/api/tasks", headers={"Origin": "https://attacker.invalid"}, json={"title": "Injected task"})
    assert response.status_code == 403
    assert client.get("/api/tasks").json() == []


def test_task_user_id_cannot_be_spoofed(client, user):
    response = client.post("/api/tasks", json={"title": "Spoof", "user_id": str(uuid4())})
    assert response.status_code == 422


def test_profile_name_updates_only_signed_in_user(client, user, other_client):
    response = client.patch("/api/profile", json={"name": "Tên mới"})
    assert response.status_code == 200
    assert client.get("/api/auth/me").json()["name"] == "Tên mới"
    assert other_client.get("/api/auth/me").json()["name"] == "Trần Bình"


def test_login_rate_limit(client):
    statuses = [
        client.post("/api/auth/login", json={"email": "missing@example.com", "password": PASSWORD}).status_code
        for _ in range(31)
    ]
    assert 429 in statuses


def test_forgot_password_does_not_expose_token_or_account_existence(client, user):
    known = client.post("/api/auth/forgot-password", json={"email": user["email"]})
    unknown = client.post("/api/auth/forgot-password", json={"email": "missing@example.com"})
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    assert set(known.json()) == {"message"}


def test_invalid_password_reset_token_is_rejected(client):
    response = client.post("/api/auth/reset-password", json={"token": "A" * 64, "password": "NewPassword!2026"})
    assert response.status_code in {400, 401, 422}


def test_production_cookie_is_secure(client, monkeypatch):
    from app import config

    monkeypatch.setattr(config, "ENV", "production")
    response = client.post("/api/auth/register", json={"name": "Production", "email": "prod@example.com", "password": PASSWORD})
    assert response.status_code == 201
    assert "; secure" in response.headers["set-cookie"].lower()


def test_cross_site_fetch_metadata_blocks_mutation_even_without_origin(client, user):
    response = client.post("/api/tasks", headers={"Sec-Fetch-Site": "cross-site"}, json={"title": "Injected task"})
    assert response.status_code == 403


def test_private_api_responses_are_not_cached(client, user):
    response = client.get("/api/tasks")
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
