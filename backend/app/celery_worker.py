from celery import Celery

celery = Celery(
    "app",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/0",
    include=["app.tasks.ml_task"]   # ⭐ FORCE LOAD TASK
)
