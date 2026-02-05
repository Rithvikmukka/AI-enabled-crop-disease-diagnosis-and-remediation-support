from fastapi import APIRouter

router = APIRouter(prefix="/api")

@router.get("/process-test")
def process_test():
    return {"message": "Process route working"}
