from app.database import engine
from app.models.base import Base
from app.models.media import Media

Base.metadata.create_all(bind=engine)

print("Tables created successfully!")
