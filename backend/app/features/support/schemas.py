from pydantic import BaseModel, ConfigDict, EmailStr
from datetime import datetime
from typing import Optional

class SupportMessageCreate(BaseModel):
    name: str
    email: EmailStr
    subject: str
    message: str
    source: Optional[str] = "contact"

class UserReportCreate(BaseModel):
    subject: str
    message: str

class SupportMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    subject: str
    message: str
    created_at: datetime
    is_read: bool
    is_responded: bool
    source: Optional[str] = "contact"
    user_id: Optional[int] = None

class SupportMessageResponse(BaseModel):
    success: bool
    message: str
