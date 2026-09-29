"""Analysis endpoints exposed to the Node.js API gateway.

Deterministic: identical input produces identical output — required for
meaningful caching, tests, and "avoid recalculating unchanged repos".
"""

from fastapi import APIRouter, HTTPException, status

from app.api.models import schemas
from app.services import behavior, complexity, gaps, recommendations, skills

router = APIRouter(prefix="/analyze", tags=["analysis"])


def _unavailable(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=detail)


@router.post("/repository", response_model=schemas.RepositoryAnalysis)
async def analyze_repository(
    payload: schemas.RepositoryAnalysisRequest,
) -> schemas.RepositoryAnalysis:
    """Score one repository: docs, tests, maintainability, complexity, health."""
    try:
        return await complexity.analyze_repository_async(payload)
    except Exception as exc:  # pragma: no cover - defensive
        raise _unavailable(f"repository analysis failed: {exc}") from exc


@router.post("/behavior", response_model=schemas.BehaviorAnalysis)
async def analyze_behavior(payload: schemas.BehaviorAnalysisRequest) -> schemas.BehaviorAnalysis:
    """Derive coding-behavior analytics and a consistency score from commit times."""
    try:
        return behavior.analyze(payload)
    except Exception as exc:  # pragma: no cover - defensive
        raise _unavailable(f"behavior analysis failed: {exc}") from exc


@router.post("/skills", response_model=schemas.SkillProfile)
async def analyze_skills(payload: schemas.SkillProfileRequest) -> schemas.SkillProfile:
    """Compute evidence-backed skill scores from language/technology signals."""
    try:
        return skills.build_skill_profile(payload)
    except Exception as exc:  # pragma: no cover - defensive
        raise _unavailable(f"skill analysis failed: {exc}") from exc


@router.post("/dna", response_model=schemas.DnaResult)
async def analyze_dna(payload: schemas.DnaRequest) -> schemas.DnaResult:
    """Aggregate skills + behavior + repository health into Developer DNA."""
    try:
        return await skills.compute_dna(payload)
    except Exception as exc:  # pragma: no cover - defensive
        raise _unavailable(f"DNA computation failed: {exc}") from exc


@router.post("/gaps", response_model=schemas.SkillGapsResult)
async def analyze_gaps(payload: schemas.SkillGapsRequest) -> schemas.SkillGapsResult:
    """Compare current skills against the target role's required skills."""
    try:
        return gaps.compute_gaps(payload)
    except Exception as exc:  # pragma: no cover - defensive
        raise _unavailable(f"gap analysis failed: {exc}") from exc


@router.post("/recommendations", response_model=schemas.RecommendationResult)
async def analyze_recommendations(
    payload: schemas.RecommendationRequest,
) -> schemas.RecommendationResult:
    """Recommend projects that close the detected skill gaps."""
    try:
        return recommendations.recommend(payload)
    except Exception as exc:  # pragma: no cover - defensive
        raise _unavailable(f"recommendation generation failed: {exc}") from exc
