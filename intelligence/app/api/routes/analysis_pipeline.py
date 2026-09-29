"""Phase 4 intelligence pipeline endpoints (§5, §22, §26).

The Node gateway calls these with the shared internal key. All responses
carry derived intelligence only — never raw GitHub data or credentials.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Header, HTTPException, status

from ...config import get_settings
from ...services import repository_service
from ...services.analysis_service import AnalysisError, analyze_user

logger = logging.getLogger("devdna.intelligence")

router = APIRouter(prefix="/api/intelligence", tags=["intelligence"])

JSONDict = dict[str, Any]


def _require_key(x_internal_key: str) -> None:
    expected = get_settings().internal_key
    if not expected or x_internal_key != expected:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid internal service key",
        )


@router.post("/analyze/user/{user_id}")
async def analyze_user_endpoint(
    user_id: str,
    x_internal_key: str = Header(default=""),
) -> JSONDict:
    """Analyze one user's synchronized GitHub data and build their DNA."""
    _require_key(x_internal_key)
    if not user_id or len(user_id) < 12:
        raise HTTPException(status_code=400, detail="Invalid user id")

    logger.info("[INTELLIGENCE] Analysis request received", extra={"userId": user_id})
    try:
        summary = await analyze_user(user_id)
    except AnalysisError as exc:
        # §29: honest "insufficient data" instead of manufactured results.
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return summary


@router.api_route("/profile/user/{user_id}", methods=["GET", "POST"])
async def get_profile(user_id: str, x_internal_key: str = Header(default="")) -> JSONDict:
    """Stored DeveloperProfile for the dashboard (Node proxies it)."""
    _require_key(x_internal_key)
    profile = await repository_service.get_developer_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="No Developer DNA analysis found for this user")
    return profile


@router.api_route("/repositories/user/{user_id}", methods=["GET", "POST"])
async def list_repo_analyses(user_id: str, x_internal_key: str = Header(default="")) -> JSONDict:
    _require_key(x_internal_key)
    docs = await repository_service.list_repository_analyses(user_id)
    return {"repositories": docs}


@router.api_route("/repositories/user/{user_id}/{repository_id}", methods=["GET", "POST"])
async def get_repo_analysis(
    user_id: str, repository_id: str, x_internal_key: str = Header(default="")
) -> JSONDict:
    _require_key(x_internal_key)
    doc = await repository_service.get_repository_analysis(user_id, repository_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Repository analysis not found")
    return doc
