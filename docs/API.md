# API contract — La Bàn Công Việc

All endpoints are `/api`. JSON, authenticated via HttpOnly session cookie. Error format `{ "detail": "Vietnamese-readable message" }`. UUID identifiers, ownership checked on server. Date-only strings use YYYY-MM-DD. Timestamps use ISO 8601 with timezone (UTC in storage). Unknown JSON fields rejected server-side. Frontend includes credentials.

## Auth
- POST /auth/register {name,email,password} -> User (201)
- POST /auth/login {email,password} -> User
- GET /auth/me -> User (401 signed out)
- POST /auth/logout -> {ok:true}
- POST /auth/forgot-password {email} -> {message:string}; dev reset links written to backend/dev-mailbox/ (never returned through API)
- POST /auth/reset-password {token,password} -> {message:string}
- PATCH /profile {name} -> User
User: {id,name,email,created_at}

## Tasks
GET /tasks -> Task[] (all own tasks)
POST /tasks -> Task (201)
PATCH /tasks/{id} -> Task (partial update)
DELETE /tasks/{id} -> {ok:true}
Task input: {title,description?:string,notes?:string,status?:"todo"|"done",priority?:"high"|"medium"|"low",due_at?:string|null,year_goal_id?:string|null,quarter_goal_id?:string|null,month_plan_id?:string|null,week_plan_id?:string|null}
Task output adds {id,user_id,completed_at,created_at,updated_at}; all input fields present. Linking lower level resolves and verifies ancestors. All relation IDs belong to current user; reject mismatched hierarchy.

## Roadmap
GET /roadmap -> {year_goals:YearGoal[],quarter_goals:QuarterGoal[],month_plans:MonthPlan[],week_plans:WeekPlan[]}
POST /roadmap/{kind} -> node (201), PATCH /roadmap/{kind}/{id} -> node, DELETE /roadmap/{kind}/{id} -> {ok:true}. kind = year | quarter | month | week
Shared node fields: {id,user_id,title,description,start_date,end_date,status:"active"|"paused"|"completed",progress:number,created_at,updated_at}. Progress derived from descendant task completion; no tasks => 0, completed node with no tasks => 100.
Year input: {title,description?,why?,metric?,priority?:"high"|"medium"|"low",start_date,end_date,status?}
Quarter input: {year_goal_id,title,description?,milestones?:string,metric?:string,start_date,end_date,status?}
Month input: {quarter_goal_id,title,description?,focus?:string,outcome?:string,start_date,end_date,status?}
Week input: {month_plan_id,title,description?,top_priorities?:string,start_date,end_date,status?}
Deletion removes descendant planning nodes, unlinks tasks (retains tasks).

## Planner (rule based)
POST /planner/preview {goal,deadline,metric,resources,hours_per_week:number,obstacles} -> {title,summary,phases:string[],year_goal:object,quarter_goals:object[],month_plan:object,week_plans:object[],tasks:object[],risks:[{risk,mitigation}]}. No database mutation.
POST /planner/apply same input -> {year_goal_id,message}; generates deterministically from validated input, appends complete hierarchy and tasks, never overwrites. Frontend confirmation required before call.

## Reminders
GET /settings/reminders -> {enabled:boolean,daily_time:"HH:MM",timezone:string,before_minutes:number}
PUT /settings/reminders same -> same
Browser notifications only while app open, permission only requested on explicit enable click. Default timezone Asia/Bangkok.

## Reviews and demo
GET /reviews -> Review[]
PUT /reviews/{week_start} {summary,wins,improvements} -> Review; week_start YYYY-MM-DD, only Mondays accepted.
Review {id,user_id,week_start,summary,wins,improvements,created_at,updated_at}
POST /demo/seed -> {message}; idempotent per user (per-user starter data), no global shared demo account. Opt in via UI.
GET /health -> {status:"ok"}

All stats and dashboard computed client-side from complete authenticated task/roadmap payload, using settings timezone. No localStorage business data. Only theme may be saved locally.
