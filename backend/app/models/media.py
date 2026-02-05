from sqlalchemy import Column, String, DateTime
from datetime import datetime
from app.models.base import Base


class Media(Base):
    __tablename__ = "media"

    media_id = Column(String, primary_key=True, index=True)
    media_type = Column(String)

    status = Column(String, default="UPLOADED")

    created_at = Column(DateTime, default=datetime.utcnow)

    # ⭐ NEW FIELDS (VERY IMPORTANT)
    result = Column(String, nullable=True)
    confidence = Column(String, nullable=True)
