import uuid
from datetime import UTC, date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


def new_id() -> str:
    return str(uuid.uuid4())


class Record:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class User(Record, Base):
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(512))


class Profile(Record, Base):
    __tablename__ = "profiles"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    demo_seeded: Mapped[bool] = mapped_column(Boolean, default=False)


class AuthSession(Base):
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class PasswordReset(Base):
    __tablename__ = "password_resets"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class OwnedRecord(Record):
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)


class PlanRecord(OwnedRecord):
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="active")


class YearGoal(PlanRecord, Base):
    __tablename__ = "year_goals"
    why: Mapped[str] = mapped_column(Text, default="")
    metric: Mapped[str] = mapped_column(Text, default="")
    priority: Mapped[str] = mapped_column(String(10), default="medium")


class QuarterGoal(PlanRecord, Base):
    __tablename__ = "quarter_goals"
    year_goal_id: Mapped[str] = mapped_column(ForeignKey("year_goals.id", ondelete="CASCADE"), index=True)
    milestones: Mapped[str] = mapped_column(Text, default="")
    metric: Mapped[str] = mapped_column(Text, default="")


class MonthPlan(PlanRecord, Base):
    __tablename__ = "month_plans"
    quarter_goal_id: Mapped[str] = mapped_column(ForeignKey("quarter_goals.id", ondelete="CASCADE"), index=True)
    focus: Mapped[str] = mapped_column(Text, default="")
    outcome: Mapped[str] = mapped_column(Text, default="")


class WeekPlan(PlanRecord, Base):
    __tablename__ = "week_plans"
    month_plan_id: Mapped[str] = mapped_column(ForeignKey("month_plans.id", ondelete="CASCADE"), index=True)
    top_priorities: Mapped[str] = mapped_column(Text, default="")


class Task(OwnedRecord, Base):
    __tablename__ = "tasks"
    __table_args__ = (Index("ix_tasks_user_due", "user_id", "due_at"), Index("ix_tasks_user_status", "user_id", "status"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="todo")
    priority: Mapped[str] = mapped_column(String(10), default="medium")
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    year_goal_id: Mapped[str | None] = mapped_column(ForeignKey("year_goals.id", ondelete="SET NULL"), nullable=True, index=True)
    quarter_goal_id: Mapped[str | None] = mapped_column(ForeignKey("quarter_goals.id", ondelete="SET NULL"), nullable=True, index=True)
    month_plan_id: Mapped[str | None] = mapped_column(ForeignKey("month_plans.id", ondelete="SET NULL"), nullable=True, index=True)
    week_plan_id: Mapped[str | None] = mapped_column(ForeignKey("week_plans.id", ondelete="SET NULL"), nullable=True, index=True)


class ReminderSettings(OwnedRecord, Base):
    __tablename__ = "reminder_settings"
    __table_args__ = (UniqueConstraint("user_id"),)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    daily_time: Mapped[str] = mapped_column(String(5), default="08:00")
    timezone: Mapped[str] = mapped_column(String(80), default="Asia/Bangkok")
    before_minutes: Mapped[int] = mapped_column(Integer, default=15)


class WeeklyReview(OwnedRecord, Base):
    __tablename__ = "weekly_reviews"
    __table_args__ = (UniqueConstraint("user_id", "week_start"),)
    week_start: Mapped[date] = mapped_column(Date)
    summary: Mapped[str] = mapped_column(Text, default="")
    wins: Mapped[str] = mapped_column(Text, default="")
    improvements: Mapped[str] = mapped_column(Text, default="")
