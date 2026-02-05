from app.database import engine
from app.models import base  # ensures all models are registered

# Create all tables
print("Creating tables in the database...")

base.Base.metadata.create_all(bind=engine)

print("Tables created successfully!")
