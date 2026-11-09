"""Exercise the shipped migration, rather than only SQLAlchemy create_all fixtures."""

from conftest import migrate_database
from sqlalchemy import create_engine, inspect


def test_fresh_database_migrates_and_upgrade_is_repeatable(tmp_path):
    database_url = f"sqlite:///{tmp_path / 'migration.sqlite'}"
    for _ in range(2):
        migrate_database(database_url)
    engine = create_engine(database_url)
    try:
        tables = set(inspect(engine).get_table_names())
        assert tables >= {
            "users", "profiles", "year_goals", "quarter_goals", "month_plans",
            "week_plans", "tasks", "reminder_settings", "weekly_reviews",
            "sessions", "password_resets", "alembic_version",
        }
        indexes = inspect(engine).get_indexes("tasks")
        assert any(index["column_names"] == ["user_id", "due_at"] for index in indexes)
        assert inspect(engine).get_foreign_keys("tasks")
    finally:
        engine.dispose()
