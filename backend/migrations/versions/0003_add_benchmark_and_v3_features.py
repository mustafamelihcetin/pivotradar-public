"""Add benchmark columns and V3 feature columns to scan_scores.

Missing columns that exist in ORM but not in DB:
  - scan_scores: alpha, outperformed_benchmark, bist100_return_on_date
  - scan_scores: w52_position, volume_zscore, ret_3d, ret_acceleration,
                 ema_alignment_score, bist100_trend_5d, vix_regime,
                 usdtry_change_5d, market_regime

All additive-only, nullable — safe to run on live DB.

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-18
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def _col_exists(conn, table: str, column: str) -> bool:
    return any(c["name"] == column for c in sa.inspect(conn).get_columns(table))


def upgrade() -> None:
    conn = op.get_bind()

    new_cols = {
        # Benchmark comparison — evaluator.py sets these
        "bist100_return_on_date": sa.Float(),
        "alpha":                  sa.Float(),
        "outperformed_benchmark": sa.Boolean(),
        # V3 macro / technical features — scanner sets these at scan time
        "w52_position":           sa.Float(),
        "volume_zscore":          sa.Float(),
        "ret_3d":                 sa.Float(),
        "ret_acceleration":       sa.Float(),
        "ema_alignment_score":    sa.Integer(),
        "bist100_trend_5d":       sa.Float(),
        "vix_regime":             sa.Integer(),
        "usdtry_change_5d":       sa.Float(),
        "market_regime":          sa.Integer(),
    }

    for col, col_type in new_cols.items():
        if not _col_exists(conn, "scan_scores", col):
            op.add_column("scan_scores", sa.Column(col, col_type, nullable=True))

    # Index for benchmark analysis queries
    try:
        op.create_index(
            "ix_scan_scores_alpha", "scan_scores", ["alpha"],
            postgresql_where=sa.text("alpha IS NOT NULL"),
            if_not_exists=True,
        )
    except Exception:
        pass


def downgrade() -> None:
    pass  # additive-only
