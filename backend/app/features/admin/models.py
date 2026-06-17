# backend/app/features/admin/models.py
import datetime
from app.core.time_utils import now_utc
from sqlalchemy import Column, String, JSON, Integer, DateTime, ForeignKey
from app.core.database import Base

class SystemSettings(Base):
    __tablename__ = "system_settings"
    key = Column(String, primary_key=True, index=True)
    value = Column(JSON, nullable=False)

class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String, nullable=False) # e.g. "UPDATE_SETTING", "DELETE_USER"
    target = Column(String, nullable=True) # e.g. "ticker_symbols", "user_123"
    details = Column(JSON, nullable=True)
    timestamp = Column(DateTime, default=lambda: now_utc().replace(tzinfo=None))
