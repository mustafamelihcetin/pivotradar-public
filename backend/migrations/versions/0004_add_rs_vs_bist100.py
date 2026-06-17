"""Add rs_vs_bist100 column to scan_scores and symbol_score_cache.

Relative strength vs BIST100: stock_5d_return - bist100_trend_5d
Computed at scan time; used as ML feature (FEATURE_SCHEMA_VERSION=7).

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-18
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def _col_exists(conn, table: str, column: str) -> bool:
    return any(c["name"] == column for c in sa.inspect(conn).get_columns(table))


def upgrade() -> None:
    conn = op.get_bind()
    for table in ("scan_scores", "symbol_data_cache"):
        try:
            if not _col_exists(conn, table, "rs_vs_bist100"):
                op.add_column(table, sa.Column("rs_vs_bist100", sa.Float(), nullable=True))
        except Exception:
            pass


def downgrade() -> None:
    pass
