from app.celery_worker import celery
from app.database import SessionLocal
from app.models.media import Media
import time


@celery.task
def process_ml(media_id, file_path):

    db = SessionLocal()

    media = db.query(Media).filter(Media.media_id == media_id).first()

    media.status = "PROCESSING"
    db.commit()

    # simulate ML delay
    time.sleep(5)

    media.status = "COMPLETED"
    media.result = "leaf_blight"
    media.confidence = "92%"

    db.commit()
    db.close()
