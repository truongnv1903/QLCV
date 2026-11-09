import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
ENV = os.getenv("APP_ENV", "development")
APP_URL = os.getenv("APP_URL", "http://localhost:5173").rstrip("/")
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{ROOT / 'backend/data/laban.db'}")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)
SESSION_DAYS = int(os.getenv("SESSION_DAYS", "30"))
if not 1 <= SESSION_DAYS <= 90:
    raise RuntimeError("SESSION_DAYS must be between 1 and 90")
COOKIE_NAME = "laban_session"
TRUSTED_ORIGINS = {origin.strip().rstrip("/") for origin in os.getenv("TRUSTED_ORIGINS", APP_URL).split(",") if origin.strip()}
if ENV == "development":
    TRUSTED_ORIGINS.update({"http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8000", "http://127.0.0.1:8000"})


def validate_production() -> None:
    if ENV != "production":
        return
    if not APP_URL.startswith("https://"):
        raise RuntimeError("Production requires HTTPS APP_URL")
    if not DATABASE_URL.startswith("postgresql"):
        raise RuntimeError("Production requires PostgreSQL DATABASE_URL")
    if os.getenv("SMTP_STARTTLS", "true").lower() != "true":
        raise RuntimeError("Production requires SMTP_STARTTLS=true")
    if not os.getenv("SMTP_HOST") or not os.getenv("SMTP_FROM"):
        raise RuntimeError("Production requires SMTP_HOST and SMTP_FROM for password reset")
