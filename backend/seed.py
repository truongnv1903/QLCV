"""Explicit per-user seed; does not create passwords or a shared demo account."""
import argparse

from sqlalchemy import select

from app.database import SessionLocal
from app.models import User
from app.services.seed import seed_for_user

parser = argparse.ArgumentParser(description="Tạo dữ liệu mẫu cho một tài khoản đã đăng ký")
parser.add_argument("--email", required=True)
args = parser.parse_args()
with SessionLocal() as db:
    user = db.scalar(select(User).where(User.email == args.email.strip().lower()))
    if not user:
        raise SystemExit("Không tìm thấy tài khoản. Hãy đăng ký trước.")
    print(seed_for_user(db, user))
    db.commit()
