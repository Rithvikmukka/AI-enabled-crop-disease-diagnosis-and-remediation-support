from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.media import Media

router = APIRouter(prefix="/api")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/prediction/{media_id}")
def get_prediction(media_id: str, db: Session = Depends(get_db)):

    media = db.query(Media).filter(Media.media_id == media_id).first()

    if not media:
        return {"error": "Media not found"}

    return {
        "media_id": media.media_id,
        "status": media.status,
        "disease": media.result,
        "confidence": media.confidence
    }
