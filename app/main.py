from fastapi import FastAPI
from app.routes import prediction
from app.routes import upload, process, status

app = FastAPI(title="Farmer Crop Diagnosis Backend")

app.include_router(upload.router)
app.include_router(process.router)
app.include_router(status.router)
app.include_router(prediction.router)

@app.get("/health")
def health():
    return {"status": "Backend running"}
