"""Phase 5 growth endpoints (§17, §18).

Called only by the Node gateway with the shared internal key. Node
authorizes the user; Python computes and stores the results.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Header, HTTPException, status

from ...config import get_settings
from ...growth import service as growth_service
from ...growth.models import (
    AnalyzeRequest,
    GapsResponse,
    GrowthAnalysisRequest,
    GrowthAnalysisResponse,
    GrowthGapsRequest,
    GrowthProjectsRequest,
    GrowthRoadmapRequest,
    PhasesProgressRequest,
    RoleMatrix,
    RolesResponse,
)

logger = logging.getLogger("devdna.intelligence")

router = APIRouter(prefix="/api/growth", tags=["growth"])

JSONDict = dict[str, Any]


def _require_key(x_internal_key: str) -> None:
    expected = get_settings().internal_key
    if not expected or x_internal_key != expected:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid internal service key",
        )


@router.get("/roles")
async def list_roles(x_internal_key: str = Header(default="")) -> RolesResponse:
    """All supported target roles with their skill matrices (§1, §2)."""
    _require_key(x_internal_key)
    roles = await growth_service.list_roles()
    return RolesResponse(roles=[RoleMatrix.model_validate(r) for r in roles])


@router.post("/analyze")
async def analyze(
    payload: GrowthAnalysisRequest, x_internal_key: str = Header(default="")
) -> GrowthAnalysisResponse:
    """Run the full growth pipeline for one user and role (§17)."""
    _require_key(x_internal_key)
    try:
        summary = await growth_service.run_growth_analysis(payload.userId, payload.targetRole)
    except growth_service.GrowthError as exc:
        # §36: honest missing-data responses (e.g. "Run Developer DNA first").
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return GrowthAnalysisResponse(
        targetRole=summary.targetRole,
        analysisVersion=summary.analysisVersion,
        gapsFound=summary.gapsFound,
        roadmapGenerated=summary.roadmapPhases > 0,
        roadmapVersion=summary.roadmapVersion,
        projectsGenerated=summary.projectsGenerated,
    )


@router.post("/gaps")
async def gaps(
    payload: GrowthGapsRequest, x_internal_key: str = Header(default="")
) -> GapsResponse:
    _require_key(x_internal_key)
    try:
        return await growth_service.get_gaps(payload.userId, payload.targetRole)
    except growth_service.GrowthError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/roadmap")
async def roadmap(
    payload: GrowthRoadmapRequest, x_internal_key: str = Header(default="")
) -> JSONDict:
    _require_key(x_internal_key)
    doc = await growth_service.get_roadmap(payload.userId, payload.targetRole)
    if not doc:
        raise HTTPException(status_code=404, detail="No roadmap found")
    return doc


@router.post("/roadmap/regenerate")
async def regenerate(
    payload: GrowthAnalysisRequest, x_internal_key: str = Header(default="")
) -> JSONDict:
    """Explicit regeneration (§28) — creates a new roadmap version."""
    _require_key(x_internal_key)
    try:
        return await growth_service.regenerate_roadmap(payload.userId, payload.targetRole)
    except growth_service.GrowthError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/projects")
async def projects(
    payload: GrowthProjectsRequest, x_internal_key: str = Header(default="")
) -> JSONDict:
    _require_key(x_internal_key)
    docs = await growth_service.list_projects(payload.userId, payload.targetRole)
    return {"projects": docs}


@router.post("/projects/{project_id}")
async def project_detail(
    project_id: str, payload: GrowthProjectsRequest, x_internal_key: str = Header(default="")
) -> JSONDict:
    _require_key(x_internal_key)
    try:
        doc = await growth_service.get_project(payload.userId, project_id)
    except growth_service.GrowthError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return doc


@router.post("/progress")
async def progress(
    payload: PhasesProgressRequest, x_internal_key: str = Header(default="")
) -> JSONDict:
    """Manual phase progress updates (§30)."""
    _require_key(x_internal_key)
    try:
        return await growth_service.update_phase_progress(payload.userId, payload.updates)
    except growth_service.GrowthError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/outdated")
async def outdated(payload: AnalyzeRequest, x_internal_key: str = Header(default="")) -> JSONDict:
    """Developer-DNA-changed detection for the regenerate banner (§28)."""
    _require_key(x_internal_key)
    return await growth_service.outdated_state(payload.userId)
