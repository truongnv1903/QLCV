from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

from conftest import PASSWORD, register
from sqlalchemy import select


def reset_token(client, api_clients, email):
    response = client.post("/api/auth/forgot-password", json={"email": email})
    assert response.status_code == 200, response.text
    messages = list(api_clients.mailbox.glob("*.txt"))
    assert messages, "Development reset delivery must create a mailbox message"
    text = max(messages, key=lambda path: path.stat().st_mtime_ns).read_text()
    link = next(line for line in text.splitlines() if line.startswith("http"))
    return parse_qs(urlparse(link).query)["reset_token"][0]


def test_password_and_session_secrets_are_hashed_at_rest(client, user, db_session):
    from app.models import AuthSession, User

    stored = db_session.get(User, user["id"])
    assert stored.password_hash != PASSWORD
    assert PASSWORD not in stored.password_hash
    assert stored.password_hash.startswith("scrypt$")
    cookie = client.cookies.get("laban_session")
    session = db_session.scalar(select(AuthSession).where(AuthSession.user_id == user["id"]))
    assert session.token_hash != cookie
    assert len(session.token_hash) == 64


def test_password_hashes_use_individual_salts(client, user, other_client, db_session):
    from app.models import User

    users = db_session.scalars(select(User)).all()
    assert len(users) == 2
    assert users[0].password_hash != users[1].password_hash


def test_password_reset_is_one_time_and_revokes_all_sessions(client, user, api_clients):
    second_browser = api_clients()
    assert second_browser.post("/api/auth/login", json={"email": user["email"], "password": PASSWORD}).status_code == 200
    token = reset_token(client, api_clients, user["email"])
    fresh_browser = api_clients()
    new_password = "DifferentPassword!2026"
    response = fresh_browser.post("/api/auth/reset-password", json={"token": token, "password": new_password})
    assert response.status_code == 200, response.text
    assert client.get("/api/auth/me").status_code == 401
    assert second_browser.get("/api/auth/me").status_code == 401
    assert fresh_browser.post("/api/auth/reset-password", json={"token": token, "password": "AnotherPassword!2026"}).status_code in {400, 401}
    assert fresh_browser.post("/api/auth/login", json={"email": user["email"], "password": PASSWORD}).status_code == 401
    assert fresh_browser.post("/api/auth/login", json={"email": user["email"], "password": new_password}).status_code == 200


def test_expired_password_reset_token_cannot_change_password(client, user, api_clients, db_session):
    from app.models import PasswordReset

    token = reset_token(client, api_clients, user["email"])
    reset = db_session.scalar(select(PasswordReset).where(PasswordReset.user_id == user["id"]))
    reset.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db_session.commit()
    response = client.post("/api/auth/reset-password", json={"token": token, "password": "DifferentPassword!2026"})
    assert response.status_code in {400, 401}
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json={"email": user["email"], "password": PASSWORD}).status_code == 200


def test_expired_session_is_rejected(client, user, db_session):
    from app.models import AuthSession

    session = db_session.scalar(select(AuthSession).where(AuthSession.user_id == user["id"]))
    session.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db_session.commit()
    assert client.get("/api/auth/me").status_code == 401


def test_new_reset_request_revokes_previous_reset_token(client, user, api_clients):
    previous = reset_token(client, api_clients, user["email"])
    current = reset_token(client, api_clients, user["email"])
    assert previous != current
    assert client.post("/api/auth/reset-password", json={"token": previous, "password": "DifferentPassword!2026"}).status_code in {400, 401}
    assert client.post("/api/auth/reset-password", json={"token": current, "password": "DifferentPassword!2026"}).status_code == 200


def test_password_hash_verifier_rejects_invalid_encoding():
    from app.security import hash_password, verify_password

    encoded = hash_password(PASSWORD)
    assert verify_password(PASSWORD, encoded)
    assert not verify_password("WrongPassword!2026", encoded)
    assert not verify_password(PASSWORD, "not-a-hash")


def test_registering_does_not_reuse_client_supplied_session(client):
    supplied = "client-chosen-session-value"
    client.cookies.set("laban_session", supplied, domain="localhost.local", path="/")
    register(client)
    assert client.cookies.get("laban_session") != supplied


def test_smtp_reset_verifies_tls_before_sending_credentials(monkeypatch):
    import ssl
    from unittest.mock import MagicMock

    from app import security

    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_USER", "mailer")
    monkeypatch.setenv("SMTP_PASSWORD", "test-smtp-password")
    monkeypatch.setenv("SMTP_STARTTLS", "true")
    server = MagicMock()
    smtp = MagicMock()
    smtp.return_value.__enter__.return_value = server
    monkeypatch.setattr(security.smtplib, "SMTP", smtp)
    security.deliver_reset("owner@example.com", "test-reset-token")
    context = server.starttls.call_args.kwargs["context"]
    assert context.check_hostname is True
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert [call[0] for call in server.method_calls] == ["starttls", "login", "send_message"]
    assert server.send_message.call_args.args[0]["To"] == "owner@example.com"
