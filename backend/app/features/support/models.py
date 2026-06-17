from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean
from sqlalchemy.sql import func
from app.core.database import Base

class SupportMessage(Base):
    __tablename__ = "support_messages"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_read = Column(Boolean, default=False)
    is_responded = Column(Boolean, default=False)
    # App-internal reports (from Sorun Bildir button)
    source = Column(String, nullable=True, default="contact")   # "contact" | "app_report"
    user_id = Column(Integer, nullable=True)                     # FK-less; user may be deleted
