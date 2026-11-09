import hashlib
import hmac
import os
import secrets
import smtplib
import ssl
import time
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from pathlib import Path

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from . import config
from .database import get_db
from .models import AuthSession, Profile, User

limiter: dict[str, list[float]] = {}
MAILBOX_DIR: Path = config.ROOT / "backend/dev-mailbox"


def rate_limit(request: Request, action: str, limit: int = 10, window: int = 900, identity: str = "") -> None:
    # X-Forwarded-For is deliberately ignored; only the trusted ASGI client address is used.
    address = request.client.host if request.client else "unknown"
    now = time.monotonic()
    for key in list(limiter):
        if not limiter[key] or limiter[key][-1] < now - 3600:
            del limiter[key]
    key = f"{action}:{address}:{identity}"
    attempts = [stamp for stamp in limiter.get(key, []) if stamp > now - window]
    if len(attempts) >= limit:
        raise HTTPException(429, "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.", headers={"Retry-After": str(window)})
    limiter[key] = [*attempts, now]


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hashed = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=5).hex()
    return f"scrypt$16384$8$5${salt}${hashed}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        _, n, r, p, salt, expected = encoded.split("$")
        actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p)).hex()
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


DUMMY_HASH = hash_password("DummyPassword17836")


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def aware(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def create_session(db: Session, user: User, response: Response) -> None:
    # Rotate any existing browser session through login route; never accept session identifiers from client input.
    token = secrets.token_urlsafe(40)
    expires = datetime.now(UTC) + timedelta(days=config.SESSION_DAYS)
    db.execute(delete(AuthSession).where(AuthSession.expires_at < datetime.now(UTC)))
    db.add(AuthSession(token_hash=token_hash(token), user_id=user.id, expires_at=expires))
    db.commit()
    response.set_cookie(config.COOKIE_NAME, token, max_age=config.SESSION_DAYS * 86400, httponly=True, secure=config.ENV == "production", samesite="lax", path="/")


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(config.COOKIE_NAME)
    session = db.get(AuthSession, token_hash(token)) if token else None
    if not session or aware(session.expires_at) <= datetime.now(UTC):
        raise HTTPException(401, "Vui lòng đăng nhập để tiếp tục.")
    user = db.get(User, session.user_id)
    if not user:
        raise HTTPException(401, "Phiên đăng nhập không còn hiệu lực.")
    return user


def user_json(db: Session, user: User) -> dict:
    profile = db.scalar(select(Profile).where(Profile.user_id == user.id))
    return {"id": user.id, "name": profile.name if profile else "", "email": user.email, "created_at": aware(user.created_at).isoformat()}


def deliver_reset(email: str, token: str) -> None:
    link = f"{config.APP_URL}/?reset_token={token}"
    host = os.getenv("SMTP_HOST")
    if not host:
        if config.ENV == "production":
            raise RuntimeError("SMTP required")
        MAILBOX_DIR.mkdir(parents=True, exist_ok=True)
        path = MAILBOX_DIR / f"{secrets.token_hex(10)}.txt"
        path.write_text(f"To: {email}\nĐặt lại mật khẩu La Bàn Công Việc (hết hạn sau 30 phút):\n{link}\n", encoding="utf-8")
        path.chmod(0o600)
        return
    message = EmailMessage()
    message["Subject"] = "Đặt lại mật khẩu · La Bàn Công Việc"
    message["From"] = os.getenv("SMTP_FROM", "noreply@localhost")
    message["To"] = email
    message.set_content(f"Mở liên kết để đặt lại mật khẩu (hết hạn sau 30 phút):\n{link}\nNếu không yêu cầu, hãy bỏ qua email này.")
    with smtplib.SMTP(host, int(os.getenv("SMTP_PORT", "587")), timeout=10) as server:
        if os.getenv("SMTP_STARTTLS", "true").lower() == "true":
            server.starttls(context=ssl.create_default_context())
        elif config.ENV == "production":
            raise RuntimeError("Production requires SMTP STARTTLS")
        username = os.getenv("SMTP_USER")
        if username:
            server.login(username, os.getenv("SMTP_PASSWORD", ""))
        server.send_message(message)
