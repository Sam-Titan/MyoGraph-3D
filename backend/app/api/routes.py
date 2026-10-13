from fastapi import APIRouter

from app.core.config import model_version
from app.schemas import HealthResponse

router = APIRouter(prefix="/api")


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", model_version=model_version())
