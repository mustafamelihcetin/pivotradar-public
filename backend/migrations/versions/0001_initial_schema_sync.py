"""Initial schema sync — captures all columns that main.py was adding manually at startup.

Revision ID: 0001
Revises:
Create Date: 2026-04-18
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def _col_exists(conn, table: str, column: str) -> bool:
    insp = sa.inspect(conn)
    return any(c["name"] == column for c in insp.get_columns(table))


def upgrade() -> None:
    conn = op.get_bind()
    is_pg = "postgresql" in conn.engine.dialect.name

    # ── users ──────────────────────────────────────────────────────────────────
    users_cols = {
        "settings":              sa.JSON(),
        "google_id":             sa.String(),
        "profile_picture":       sa.String(),
        "hashed_password":       sa.String(),
        "email_verified":        sa.Boolean(),
        "verification_token":    sa.String(),
        "reset_token":           sa.String(),
        "reset_token_expires":   sa.DateTime(),
        "force_password_change": sa.Boolean(),
        "strategy_profile_id":   sa.Integer(),
    }
    for col, col_type in users_cols.items():
        if not _col_exists(conn, "users", col):
            op.add_column("users", sa.Column(col, col_type, nullable=True))

    # ── scan_scores ────────────────────────────────────────────────────────────
    f_type = sa.Float(precision=53) if is_pg else sa.Float()
    ts_type = sa.DateTime()

    scan_cols = {
        "volume":                   sa.Float(),
        "hit_accuracy_pct":         sa.Float(),
        "hit_status":               sa.String(),
        "data_time":                ts_type,
        "pattern_score":            sa.Integer(),
        "ml_score":                 f_type,
        "momentum":                 f_type,
        "target_price":             sa.String(),
        "target_direction":         sa.String(),
        "predicted_days":           sa.Integer(),
        "directional_hit":          sa.Boolean(),
        "predicted_return_pct":     f_type,
        "magnitude_deviation_pct":  f_type,
    }
    for col, col_type in scan_cols.items():
        if not _col_exists(conn, "scan_scores", col):
            op.add_column("scan_scores", sa.Column(col, col_type, nullable=True))

    # ── symbol_data_cache ──────────────────────────────────────────────────────
    cache_cols = {
        "volume":                   sa.Float(),
        "hit_accuracy_pct":         sa.Float(),
        "hit_status":               sa.String(),
        "data_time":                ts_type,
        "pattern_score":            sa.Integer(),
        "ml_score":                 f_type,
        "momentum":                 f_type,
        "target_price":             sa.String(),
        "target_direction":         sa.String(),
        "predicted_days":           sa.Integer(),
        "directional_hit":          sa.Boolean(),
        "predicted_return_pct":     f_type,
        "magnitude_deviation_pct":  f_type,
    }
    for col, col_type in cache_cols.items():
        if not _col_exists(conn, "symbol_data_cache", col):
            op.add_column("symbol_data_cache", sa.Column(col, col_type, nullable=True))

    # ── indexes ────────────────────────────────────────────────────────────────
    try:
        op.create_index(
            "ix_scan_scores_evaluated_at", "scan_scores", ["evaluated_at"],
            if_not_exists=True,
        )
    except Exception:
        pass


def downgrade() -> None:
    # These are additive-only columns — downgrade is a no-op to avoid data loss.
    pass
