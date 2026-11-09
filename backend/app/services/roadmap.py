from datetime import UTC, date, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import MonthPlan, QuarterGoal, Task, WeekPlan, YearGoal
from ..security import aware

MODELS = {"year": YearGoal, "quarter": QuarterGoal, "month": MonthPlan, "week": WeekPlan}
PARENTS = {"quarter": ("year_goal_id", YearGoal), "month": ("quarter_goal_id", QuarterGoal), "week": ("month_plan_id", MonthPlan)}
TASK_REFS = {"year_goal_id": YearGoal, "quarter_goal_id": QuarterGoal, "month_plan_id": MonthPlan, "week_plan_id": WeekPlan}


def owned(db: Session, model, item_id: str, user_id: str):
    item = db.scalar(select(model).where(model.id == item_id, model.user_id == user_id))
    if item is None:
        raise HTTPException(404, "Không tìm thấy dữ liệu.")
    return item


def serialize(item) -> dict:
    result = {}
    for column in item.__table__.columns:
        value = getattr(item, column.name)
        if isinstance(value, datetime):
            value = aware(value).isoformat()
        elif isinstance(value, date):
            value = value.isoformat()
        result[column.name] = value
    return result


def node_json(db: Session, node, kind: str) -> dict:
    ref = {"year": "year_goal_id", "quarter": "quarter_goal_id", "month": "month_plan_id", "week": "week_plan_id"}[kind]
    tasks = list(db.scalars(select(Task).where(Task.user_id == node.user_id, getattr(Task, ref) == node.id)))
    progress = round(sum(task.status == "done" for task in tasks) / len(tasks) * 100) if tasks else (100 if node.status == "completed" else 0)
    return {**serialize(node), "progress": progress}


def validate_node(db: Session, kind: str, values: dict, user_id: str, existing=None) -> None:
    if kind in PARENTS:
        field, parent_model = PARENTS[kind]
        parent = owned(db, parent_model, values[field], user_id)
        if existing is not None and getattr(existing, field) != values[field]:
            raise HTTPException(422, "Không thể chuyển kế hoạch sang cấp cha khác. Hãy tạo kế hoạch mới.")
        if values["start_date"] < parent.start_date or values["end_date"] > parent.end_date:
            raise HTTPException(422, "Thời gian kế hoạch phải nằm trong kế hoạch cấp trên.")
    children = {"year": (QuarterGoal, "year_goal_id"), "quarter": (MonthPlan, "quarter_goal_id"), "month": (WeekPlan, "month_plan_id")}
    if existing is not None and kind in children:
        child_model, parent_field = children[kind]
        for child in db.scalars(select(child_model).where(getattr(child_model, parent_field) == existing.id, child_model.user_id == user_id)):
            if child.start_date < values["start_date"] or child.end_date > values["end_date"]:
                raise HTTPException(422, "Thời gian mới phải bao trùm các kế hoạch con hiện có.")


def resolve_task_links(db: Session, values: dict, user_id: str) -> dict:
    # Validate each explicitly supplied ID even if a deeper link would otherwise replace it.
    supplied = {field: owned(db, model, values[field], user_id) for field, model in TASK_REFS.items() if values.get(field)}
    resolved = {field: values.get(field) for field in TASK_REFS}
    if "week_plan_id" in supplied:
        resolved["month_plan_id"] = supplied["week_plan_id"].month_plan_id
    if resolved["month_plan_id"]:
        month = owned(db, MonthPlan, resolved["month_plan_id"], user_id)
        resolved["quarter_goal_id"] = month.quarter_goal_id
    if resolved["quarter_goal_id"]:
        quarter = owned(db, QuarterGoal, resolved["quarter_goal_id"], user_id)
        resolved["year_goal_id"] = quarter.year_goal_id
    for field, item in supplied.items():
        if item.id != resolved[field]:
            raise HTTPException(422, "Các liên kết công việc không thuộc cùng một nhánh roadmap.")
    return resolved


def persist_plan(db: Session, user_id: str, plan: dict) -> str:
    year = YearGoal(user_id=user_id, **convert_dates(plan["year_goal"]))
    db.add(year)
    db.flush()
    quarters = []
    for values in plan["quarter_goals"]:
        node = QuarterGoal(user_id=user_id, year_goal_id=year.id, **convert_dates(values))
        db.add(node)
        quarters.append(node)
    db.flush()
    month = MonthPlan(user_id=user_id, quarter_goal_id=quarters[0].id, **convert_dates(plan["month_plan"]))
    db.add(month)
    db.flush()
    weeks = []
    for values in plan["week_plans"]:
        week = WeekPlan(user_id=user_id, month_plan_id=month.id, **convert_dates(values))
        db.add(week)
        weeks.append(week)
    db.flush()
    for values in plan["tasks"]:
        task_values = dict(values)
        week = weeks[task_values.pop("week_index")]
        if task_values.get("due_at"):
            task_values["due_at"] = datetime.fromisoformat(task_values["due_at"]).astimezone(UTC)
        db.add(Task(user_id=user_id, year_goal_id=year.id, quarter_goal_id=quarters[0].id, month_plan_id=month.id, week_plan_id=week.id, **task_values))
    db.flush()
    return year.id


def convert_dates(values: dict) -> dict:
    return {key: date.fromisoformat(value) if key in ("start_date", "end_date") and isinstance(value, str) else value for key, value in values.items()}
