"""Health & status endpoints for the intelligence service."""

from fastapi import APIRouter

from ..models.schemas import HealthResponse

router = APIRouter(tags=["health"])

ANALYZERS = [
    "skills",
    "complexity",
    "behavior",
    "dna",
    "gaps",
    "recommendations",
]


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Liveness probe consumed by the Node API and Docker healthchecks."""
    return HealthResponse(
        status="ok",
        service="intelligence",
        version="0.1.0",
        analyzers=ANALYZERS,
    )
