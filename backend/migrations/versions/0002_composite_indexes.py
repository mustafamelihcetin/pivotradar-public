"""Composite indexes for common query patterns.

Adds performance-critical composite indexes:
  - scan_scores(profile_name, scanned_at) — profile-filtered timeline queries
  - scan_scores(profile_name, evaluated_at) — calibration/evaluation lookups
  - rate_limit_records(key, timestamp) — sliding-window rate limiter bucket queries
  - scan_scores(target_direction, evaluated_at) — directional hit analysis

All CREATE INDEX IF NOT EXISTS — idempotent, safe to run on live DB.

Revision ID: 0002
Revises: babad7811a25
Create Date: 2026-04-24
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "babad7811a25"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(sa.text(
            "CREATE INDEX IF NOT EXISTS ix_scan_scores_profile_scanned "
            "ON scan_scores (profile_name, scanned_at)"
        ))
        op.execute(sa.text(
            "CREATE INDEX IF NOT EXISTS ix_scan_scores_profile_evaluated "
            "ON scan_scores (profile_name, evaluated_at)"
        ))
        op.execute(sa.text(
            "CREATE INDEX IF NOT EXISTS ix_scan_scores_direction_evaluated "
            "ON scan_scores (target_direction, evaluated_at)"
        ))
        op.execute(sa.text(
            "CREATE INDEX IF NOT EXISTS ix_rate_limit_key_ts "
            "ON rate_limit_records (key, timestamp)"
        ))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_scan_scores_profile_scanned"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_scan_scores_profile_evaluated"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_scan_scores_direction_evaluated"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_rate_limit_key_ts"))
