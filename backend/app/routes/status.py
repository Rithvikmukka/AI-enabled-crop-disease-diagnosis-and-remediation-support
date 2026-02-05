from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.media import Media

router = APIRouter(prefix="/api", tags=["Media Status"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/media-status/{media_id}")
def get_media_status(media_id: str, db: Session = Depends(get_db)):

    media = db.query(Media).filter(Media.media_id == media_id).first()

    if not media:
        return {"error": "Media not found"}

    return {
        "media_id": media.media_id,
        "status": media.status,
        "uploaded_at": media.created_at
    }
