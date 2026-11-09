import logging
import secrets
from contextlib import asynccontextmanager
from datetime import date, timedelta

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from pydantic import ValidationError
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import config, schemas, security
from .database import get_db
from .models import (
    AuthSession,
    MonthPlan,
    PasswordReset,
    Profile,
    QuarterGoal,
    ReminderSettings,
    Task,
    User,
    WeeklyReview,
    WeekPlan,
    YearGoal,
    utcnow,
)
from .security import current_user
from .services.planner import build_plan
from .services.roadmap import (
    MODELS,
    TASK_REFS,
    node_json,
    owned,
    persist_plan,
    resolve_task_links,
    serialize,
    validate_node,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    config.validate_production()
    yield


app = FastAPI(title="La Bàn Công Việc API", version="1.0.0", lifespan=lifespan, docs_url="/api/docs" if config.ENV != "production" else None, openapi_url="/api/openapi.json" if config.ENV != "production" else None)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("origin")
        if (origin and origin not in config.TRUSTED_ORIGINS) or request.headers.get("sec-fetch-site") == "cross-site":
            return JSONResponse(status_code=403, content={"detail": "Nguồn yêu cầu không được phép."})
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if request.url.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-store"
    if config.ENV == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, exc: RequestValidationError):
    errors = [{"field": ".".join(str(part) for part in error["loc"][1:]), "message": error["msg"]} for error in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": "Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.", "errors": errors})


@app.exception_handler(Exception)
async def unexpected_error(_request: Request, exc: Exception):
    # Keep unexpected database/provider details, credentials and submitted values out of API responses.
    logger.error("Unexpected request failure: %s", type(exc).__name__)
    return JSONResponse(status_code=500, content={"detail": "Không thể xử lý yêu cầu lúc này. Vui lòng thử lại sau."})


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register", status_code=201)
def register(payload: schemas.Register, request: Request, response: Response, db: Session = Depends(get_db)):
    security.rate_limit(request, "register", limit=10)
    email = str(payload.email).lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Email này đã được sử dụng.")
    user = User(email=email, password_hash=security.hash_password(payload.password))
    db.add(user)
    try:
        db.flush()
        db.add(Profile(user_id=user.id, name=payload.name))
        db.add(ReminderSettings(user_id=user.id))
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Email này đã được sử dụng.") from None
    security.create_session(db, user, response)
    return security.user_json(db, user)


@app.post("/api/auth/login")
def login(payload: schemas.Login, request: Request, response: Response, db: Session = Depends(get_db)):
    security.rate_limit(request, "login", limit=20)
    email = str(payload.email).lower()
    security.rate_limit(request, "login-account", limit=10, identity=email)
    user = db.scalar(select(User).where(User.email == email))
    valid = security.verify_password(payload.password, user.password_hash if user else security.DUMMY_HASH)
    if not user or not valid:
        raise HTTPException(401, "Email hoặc mật khẩu chưa chính xác.")
    old_token = request.cookies.get(config.COOKIE_NAME)
    if old_token:
        db.execute(delete(AuthSession).where(AuthSession.token_hash == security.token_hash(old_token)))
    security.create_session(db, user, response)
    return security.user_json(db, user)


@app.get("/api/auth/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return security.user_json(db, user)


@app.post("/api/auth/logout")
def logout(request: Request, response: Response, _user: User = Depends(current_user), db: Session = Depends(get_db)):
    token = request.cookies.get(config.COOKIE_NAME)
    if token:
        db.execute(delete(AuthSession).where(AuthSession.token_hash == security.token_hash(token)))
        db.commit()
    response.delete_cookie(config.COOKIE_NAME, path="/", secure=config.ENV == "production", httponly=True, samesite="lax")
    return {"ok": True}


def send_reset_email(email: str, token: str) -> None:
    try:
        security.deliver_reset(email, token)
    except Exception:
        # Do not log email, reset token or SMTP credentials.
        logger.error("Password reset delivery failed; inspect SMTP configuration.")


@app.post("/api/auth/forgot-password")
def forgot_password(payload: schemas.ForgotPassword, request: Request, background: BackgroundTasks, db: Session = Depends(get_db)):
    security.rate_limit(request, "forgot", limit=5)
    email = str(payload.email).lower()
    user = db.scalar(select(User).where(User.email == email))
    if user:
        db.execute(delete(PasswordReset).where(PasswordReset.user_id == user.id))
        token = secrets.token_urlsafe(40)
        db.add(PasswordReset(token_hash=security.token_hash(token), user_id=user.id, expires_at=utcnow() + timedelta(minutes=30)))
        db.commit()
        background.add_task(send_reset_email, email, token)
    return {"message": "Nếu email đã được đăng ký, bạn sẽ nhận được liên kết đặt lại mật khẩu."}


@app.post("/api/auth/reset-password")
def reset_password(payload: schemas.ResetPassword, request: Request, db: Session = Depends(get_db)):
    security.rate_limit(request, "reset", limit=10)
    # Consume the token atomically before computing the new hash; concurrent requests cannot reuse it.
    reset_user_id = db.scalar(delete(PasswordReset).where(PasswordReset.token_hash == security.token_hash(payload.token), PasswordReset.expires_at > utcnow()).returning(PasswordReset.user_id))
    if not reset_user_id:
        raise HTTPException(400, "Liên kết không hợp lệ hoặc đã hết hạn.")
    user = db.get(User, reset_user_id)
    if not user:
        raise HTTPException(400, "Liên kết không hợp lệ hoặc đã hết hạn.")
    user.password_hash = security.hash_password(payload.password)
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    db.execute(delete(PasswordReset).where(PasswordReset.user_id == user.id))
    db.commit()
    return {"message": "Mật khẩu đã được cập nhật. Hãy đăng nhập bằng mật khẩu mới."}


@app.patch("/api/profile")
def update_profile(payload: schemas.ProfileInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    profile = db.scalar(select(Profile).where(Profile.user_id == user.id))
    if profile:
        profile.name = payload.name
    else:
        db.add(Profile(user_id=user.id, name=payload.name))
    db.commit()
    return security.user_json(db, user)


@app.get("/api/tasks")
def list_tasks(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return [serialize(task) for task in db.scalars(select(Task).where(Task.user_id == user.id).order_by(Task.created_at.desc()))]


@app.post("/api/tasks", status_code=201)
def create_task(payload: schemas.TaskInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    values = payload.model_dump()
    values.update(resolve_task_links(db, values, user.id))
    task = Task(user_id=user.id, completed_at=utcnow() if values["status"] == "done" else None, **values)
    db.add(task)
    db.commit()
    return serialize(task)


@app.patch("/api/tasks/{task_id}")
def update_task(task_id: str, payload: schemas.TaskPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    task = owned(db, Task, task_id, user.id)
    values = payload.model_dump(exclude_unset=True)
    refs = {field: getattr(task, field) for field in TASK_REFS}
    # A changed branch explicitly clears deeper links, allowing a task to move to another year/week.
    levels = list(TASK_REFS)
    for index, field in enumerate(levels):
        if field in values and values[field] != refs[field]:
            for descendant in levels[index + 1:]:
                if descendant not in values:
                    refs[descendant] = None
    refs.update({field: value for field, value in values.items() if field in TASK_REFS})
    # Existing ancestor links are not explicit constraints when moving a deeper task to a new branch.
    lowest_changed = next((field for field in reversed(levels) if field in values and values[field]), None)
    if lowest_changed:
        for field in levels[:levels.index(lowest_changed)]:
            if field not in values:
                refs[field] = None
    values.update(resolve_task_links(db, refs, user.id))
    if "status" in values:
        task.completed_at = task.completed_at or utcnow() if values["status"] == "done" else None
    for field, value in values.items():
        setattr(task, field, value)
    task.updated_at = utcnow()
    db.commit()
    return serialize(task)


@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(owned(db, Task, task_id, user.id))
    db.commit()
    return {"ok": True}


@app.get("/api/roadmap")
def get_roadmap(user: User = Depends(current_user), db: Session = Depends(get_db)):
    result = {}
    for kind, key in [("year", "year_goals"), ("quarter", "quarter_goals"), ("month", "month_plans"), ("week", "week_plans")]:
        result[key] = [node_json(db, node, kind) for node in db.scalars(select(MODELS[kind]).where(MODELS[kind].user_id == user.id).order_by(MODELS[kind].start_date))]
    return result


def plan_schema(kind: str):
    schema = {"year": schemas.YearInput, "quarter": schemas.QuarterInput, "month": schemas.MonthInput, "week": schemas.WeekInput}.get(kind)
    if schema is None:
        raise HTTPException(404, "Không tìm thấy loại kế hoạch.")
    return schema


def parse_plan(kind: str, payload: dict):
    try:
        return plan_schema(kind).model_validate(payload)
    except ValidationError as exc:
        raise HTTPException(422, "Dữ liệu kế hoạch không hợp lệ. Hãy kiểm tra các trường và ngày bắt đầu/kết thúc.") from exc


@app.post("/api/roadmap/{kind}", status_code=201)
def create_plan(kind: str, payload: dict, user: User = Depends(current_user), db: Session = Depends(get_db)):
    values = parse_plan(kind, payload).model_dump()
    validate_node(db, kind, values, user.id)
    node = MODELS[kind](user_id=user.id, **values)
    db.add(node)
    db.commit()
    return node_json(db, node, kind)


@app.patch("/api/roadmap/{kind}/{node_id}")
def update_plan(kind: str, node_id: str, payload: dict, user: User = Depends(current_user), db: Session = Depends(get_db)):
    plan_schema(kind)
    node = owned(db, MODELS[kind], node_id, user.id)
    existing = {key: value for key, value in serialize(node).items() if key not in {"id", "user_id", "created_at", "updated_at"}}
    values = parse_plan(kind, {**existing, **payload}).model_dump()
    validate_node(db, kind, values, user.id, existing=node)
    for field, value in values.items():
        setattr(node, field, value)
    node.updated_at = utcnow()
    db.commit()
    return node_json(db, node, kind)


@app.delete("/api/roadmap/{kind}/{node_id}")
def delete_plan(kind: str, node_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    plan_schema(kind)
    node = owned(db, MODELS[kind], node_id, user.id)
    # Explicitly unlink and delete in descendant-first order; this also works in tests with FK off.
    year_ids = [node.id] if kind == "year" else []
    quarter_ids = [node.id] if kind == "quarter" else list(db.scalars(select(QuarterGoal.id).where(QuarterGoal.user_id == user.id, QuarterGoal.year_goal_id.in_(year_ids))))
    month_ids = [node.id] if kind == "month" else list(db.scalars(select(MonthPlan.id).where(MonthPlan.user_id == user.id, MonthPlan.quarter_goal_id.in_(quarter_ids))))
    week_ids = [node.id] if kind == "week" else list(db.scalars(select(WeekPlan.id).where(WeekPlan.user_id == user.id, WeekPlan.month_plan_id.in_(month_ids))))
    for task in db.scalars(select(Task).where(Task.user_id == user.id)):
        for ref, ids in [("week_plan_id", week_ids), ("month_plan_id", month_ids), ("quarter_goal_id", quarter_ids), ("year_goal_id", year_ids)]:
            if getattr(task, ref) in ids:
                setattr(task, ref, None)
    db.flush()
    for model, ids in [(WeekPlan, week_ids), (MonthPlan, month_ids), (QuarterGoal, quarter_ids), (YearGoal, year_ids)]:
        if ids:
            db.execute(delete(model).where(model.id.in_(ids), model.user_id == user.id))
    db.commit()
    return {"ok": True}


@app.post("/api/planner/preview")
def planner_preview(payload: schemas.PlannerInput, request: Request, _user: User = Depends(current_user)):
    security.rate_limit(request, "planner", limit=40, window=60)
    return build_plan(payload)


@app.post("/api/planner/apply", status_code=201)
def planner_apply(payload: schemas.PlannerInput, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    security.rate_limit(request, "planner-apply", limit=10, window=60)
    year_id = persist_plan(db, user.id, build_plan(payload))
    db.commit()
    return {"year_goal_id": year_id, "message": "Đã thêm lộ trình mới. Các kế hoạch hiện tại được giữ nguyên."}


@app.get("/api/settings/reminders")
def get_reminders(user: User = Depends(current_user), db: Session = Depends(get_db)):
    settings = db.scalar(select(ReminderSettings).where(ReminderSettings.user_id == user.id))
    if not settings:
        settings = ReminderSettings(user_id=user.id)
        db.add(settings)
        db.commit()
    return {field: getattr(settings, field) for field in schemas.ReminderInput.model_fields}


@app.put("/api/settings/reminders")
def update_reminders(payload: schemas.ReminderInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    settings = db.scalar(select(ReminderSettings).where(ReminderSettings.user_id == user.id))
    if not settings:
        settings = ReminderSettings(user_id=user.id)
        db.add(settings)
    for field, value in payload.model_dump().items():
        setattr(settings, field, value)
    db.commit()
    return payload.model_dump()


@app.get("/api/reviews")
def get_reviews(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return [serialize(review) for review in db.scalars(select(WeeklyReview).where(WeeklyReview.user_id == user.id).order_by(WeeklyReview.week_start.desc()))]


@app.put("/api/reviews/{week_start}")
def save_review(week_start: date, payload: schemas.ReviewInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if week_start.weekday() != 0:
        raise HTTPException(422, "Ngày bắt đầu tuần phải là thứ Hai.")
    review = db.scalar(select(WeeklyReview).where(WeeklyReview.user_id == user.id, WeeklyReview.week_start == week_start))
    if not review:
        review = WeeklyReview(user_id=user.id, week_start=week_start)
        db.add(review)
    for field, value in payload.model_dump().items():
        setattr(review, field, value)
    db.commit()
    return serialize(review)


@app.post("/api/demo/seed")
def seed_demo(user: User = Depends(current_user), db: Session = Depends(get_db)):
    from .services.seed import seed_for_user
    message = seed_for_user(db, user)
    db.commit()
    return {"message": message}


FRONTEND = config.ROOT / "frontend/dist"


@app.get("/{path:path}", include_in_schema=False)
def frontend(path: str):
    if path == "api" or path.startswith("api/"):
        raise HTTPException(404, "Không tìm thấy API.")
    root = FRONTEND.resolve()
    candidate = (root / path).resolve()
    if not candidate.is_relative_to(root):
        raise HTTPException(404, "Không tìm thấy trang.")
    if path and candidate.is_file():
        return FileResponse(candidate)
    index = root / "index.html"
    if index.is_file():
        return FileResponse(index)
    raise HTTPException(404, "Chưa build giao diện. Chạy npm --prefix frontend run build hoặc dùng Vite ở cổng 5173.")
