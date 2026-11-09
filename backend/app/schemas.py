from datetime import UTC, date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

Priority = Literal["high", "medium", "low"]
PlanStatus = Literal["active", "paused", "completed"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Register(StrictModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=10, max_length=128)

    @field_validator("password")
    @classmethod
    def strong_password(cls, value):
        if not any(c.isalpha() for c in value) or not any(c.isdigit() for c in value):
            raise ValueError("Mật khẩu cần có chữ và số, tối thiểu 10 ký tự.")
        return value


class Login(StrictModel):
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=1, max_length=128)


class ForgotPassword(StrictModel):
    email: EmailStr = Field(max_length=254)


class ResetPassword(StrictModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=10, max_length=128)
    @field_validator("password")
    @classmethod
    def strong_password(cls, value):
        return Register.strong_password(value)


class ProfileInput(StrictModel):
    name: str = Field(min_length=1, max_length=100)


class TaskInput(StrictModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=10000)
    notes: str = Field(default="", max_length=10000)
    status: Literal["todo", "done"] = "todo"
    priority: Priority = "medium"
    due_at: datetime | None = None
    year_goal_id: str | None = None
    quarter_goal_id: str | None = None
    month_plan_id: str | None = None
    week_plan_id: str | None = None

    @field_validator("due_at")
    @classmethod
    def aware_datetime(cls, value):
        if value is not None:
            if value.tzinfo is None:
                raise ValueError("Thời gian cần có múi giờ.")
            value = value.astimezone(UTC)
        return value


class TaskPatch(StrictModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=10000)
    notes: str | None = Field(default=None, max_length=10000)
    status: Literal["todo", "done"] | None = None
    priority: Priority | None = None
    due_at: datetime | None = None
    year_goal_id: str | None = None
    quarter_goal_id: str | None = None
    month_plan_id: str | None = None
    week_plan_id: str | None = None
    @field_validator("due_at")
    @classmethod
    def aware_datetime(cls, value):
        return TaskInput.aware_datetime(value)

    @model_validator(mode="after")
    def reject_null_required(self):
        for field in ("title", "description", "notes", "status", "priority"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} không được rỗng.")
        return self


class PlanInput(StrictModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=10000)
    start_date: date
    end_date: date
    status: PlanStatus = "active"

    @model_validator(mode="after")
    def dates_valid(self):
        if self.end_date < self.start_date:
            raise ValueError("Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.")
        return self


class YearInput(PlanInput):
    why: str = Field(default="", max_length=5000)
    metric: str = Field(default="", max_length=5000)
    priority: Priority = "medium"


class QuarterInput(PlanInput):
    year_goal_id: str
    milestones: str = Field(default="", max_length=5000)
    metric: str = Field(default="", max_length=5000)


class MonthInput(PlanInput):
    quarter_goal_id: str
    focus: str = Field(default="", max_length=5000)
    outcome: str = Field(default="", max_length=5000)


class WeekInput(PlanInput):
    month_plan_id: str
    top_priorities: str = Field(default="", max_length=5000)


class PlannerInput(StrictModel):
    goal: str = Field(min_length=3, max_length=200)
    deadline: date
    metric: str = Field(min_length=1, max_length=2000)
    resources: str = Field(min_length=1, max_length=2000)
    hours_per_week: float = Field(ge=1, le=80)
    obstacles: str = Field(default="", max_length=2000)

    @field_validator("deadline")
    @classmethod
    def valid_deadline(cls, value):
        today = datetime.now(ZoneInfo("Asia/Bangkok")).date()
        if value > today + timedelta(days=365 * 5):
            raise ValueError("Thời hạn tối đa là 5 năm.")
        if value < today:
            raise ValueError("Thời hạn không được ở quá khứ.")
        return value


class ReminderInput(StrictModel):
    enabled: bool = False
    daily_time: str = Field(default="08:00", pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    timezone: str = Field(default="Asia/Bangkok", max_length=80)
    before_minutes: int = Field(default=15, ge=0, le=1440)

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Múi giờ không hợp lệ.") from None
        return value


class ReviewInput(StrictModel):
    summary: str = Field(default="", max_length=10000)
    wins: str = Field(default="", max_length=10000)
    improvements: str = Field(default="", max_length=10000)
