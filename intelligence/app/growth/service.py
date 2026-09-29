"""Growth engine orchestrator (§18, §19, §31).

Python owns the growth calculations and their persistence. The Node gateway
authorizes users and forwards internal-key requests here; results are stored
in growth collections (skill_gap_analyses, roadmaps, project_recommendations)
with ownership embedded in every query (§32).
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from ..config import get_settings
from ..services import mongodb as core_mongodb
from . import mongodb
from .gap_engine import compute_skill_gaps
from .models import (
    AnalyzeSummary,
    GapsResponse,
    PhaseProgressUpdate,
    RoadmapPhase,
    SkillGapsDocument,
)
from .project_engine import generate_projects
from .roadmap_engine import build_roadmap
from .role_matrix import get_role_matrix, is_known_role, role_names

logger = logging.getLogger("devdna.intelligence")


class GrowthError(Exception):
    """Raised with a user-facing message when growth analysis cannot proceed."""


async def list_roles() -> list[dict[str, Any]]:
    """All supported target roles with their matrices (§1, §2, §39 cached)."""
    return [get_role_matrix(role).model_dump() for role in role_names()]


async def run_growth_analysis(user_id: str, target_role: str) -> AnalyzeSummary:
    """Full pipeline: load DNA → gaps → roadmap (versioned) → projects → store."""
    settings = get_settings()
    now = datetime.now(UTC)
    now_iso = now.isoformat()

    role = target_role.strip()
    if not is_known_role(role):
        raise GrowthError(f"Unsupported target role: {target_role}")

    profile = await core_mongodb.load_developer_profile(user_id)
    if not profile:
        # §36: honest missing-data handling, never manufactured results.
        raise GrowthError("Run Developer DNA analysis first")

    gaps_doc = compute_skill_gaps(profile, role, settings.analysis_version, now_iso)
    await mongodb.save_skill_gaps(gaps_doc.model_dump())

    # Roadmap versioning (§29): a new analysis creates a new version and
    # marks the previous one OUTDATED — the user's current roadmap is never
    # silently destroyed. Completion carries forward (§28).
    version = await mongodb.next_roadmap_version(user_id, role)
    previous = await mongodb.load_roadmap(user_id, role, latest=True)
    previous_phases = (
        [RoadmapPhase.model_validate(p) for p in (previous or {}).get("phases", [])]
        if previous
        else None
    )
    roadmap = build_roadmap(
        gaps_doc,
        role,
        version=version,
        analysis_version=settings.analysis_version,
        previous_phases=previous_phases,
    )
    await mongodb.save_roadmap(roadmap.model_dump())

    projects = generate_projects(gaps_doc, role, settings.analysis_version, now=now_iso)
    await mongodb.replace_project_recommendations(user_id, role, [p.model_dump() for p in projects])

    logger.info(
        "[GROWTH] Analysis completed",
        extra={
            "userId": user_id,
            "role": role,
            "gaps": len(gaps_doc.gaps),
            "phases": len(roadmap.phases),
            "projects": len(projects),
            "version": version,
        },
    )
    return AnalyzeSummary(
        userId=user_id,
        targetRole=role,
        gapsFound=len(gaps_doc.gaps),
        roadmapPhases=len(roadmap.phases),
        roadmapVersion=version,
        projectsGenerated=len(projects),
        analysisVersion=settings.analysis_version,
        generatedAt=now_iso,
    )


async def get_gaps(user_id: str, target_role: str) -> GapsResponse:
    """Stored skill gaps for a role (§17 GET /api/growth/gaps backing store)."""
    doc = await mongodb.load_skill_gaps(user_id, target_role.strip())
    if not doc:
        raise GrowthError("No skill gap analysis for this role — run the growth analysis first")
    parsed = SkillGapsDocument.model_validate({k: v for k, v in doc.items() if k != "_id"})
    return GapsResponse(
        targetRole=parsed.targetRole,
        analysisVersion=parsed.analysisVersion,
        gaps=parsed.gaps,
        strengths=parsed.strengths,
    )


async def get_roadmap(user_id: str, target_role: str | None = None) -> dict[str, Any]:
    """The user's active roadmap (any role when unspecified)."""
    doc = await mongodb.load_roadmap(user_id, (target_role or "").strip() or None, latest=True)
    if not doc:
        raise GrowthError("No roadmap yet — run the growth analysis first")
    return _clean_doc(doc)


async def list_projects(user_id: str, target_role: str | None = None) -> list[dict[str, Any]]:
    """Stored project recommendations (newest analysis first)."""
    docs = await mongodb.load_project_recommendations(user_id, (target_role or "").strip() or None)
    return [_clean_doc(d) for d in docs]


async def get_project(user_id: str, project_id: str) -> dict[str, Any]:
    doc = await mongodb.load_project_recommendation(user_id, project_id)
    if not doc:
        raise GrowthError("Project recommendation not found")
    return _clean_doc(doc)


async def regenerate_roadmap(user_id: str, target_role: str) -> dict[str, Any]:
    """Explicit regeneration (§28): new version, old one kept as SUPERSEDED.
    The new phases are fetched through the normal roadmap endpoint."""
    summary = await run_growth_analysis(user_id, target_role)
    return {
        "roadmapVersion": summary.roadmapVersion,
        "summary": summary.model_dump(),
    }


async def outdated_state(user_id: str) -> dict[str, Any]:
    """Has the Developer DNA changed since the growth analysis ran? (§28)"""
    return await mongodb.growth_outdated_state(user_id)


async def update_phase_progress(
    user_id: str, updates: Sequence[dict[str, Any] | PhaseProgressUpdate]
) -> dict[str, Any]:
    """Manual progress tracking on roadmap phases (§30)."""
    roadmap = await mongodb.load_roadmap(user_id, None, latest=True)
    if not roadmap:
        raise GrowthError("No roadmap yet — run the growth analysis first")
    phases: list[dict[str, Any]] = roadmap.get("phases", [])
    by_id = {str(p.get("id")): p for p in phases}
    for upd in updates:
        if isinstance(upd, dict):
            phase_id = str(upd.get("phaseId"))
            status = str(upd.get("status", ""))
        else:  # pydantic PhaseProgressUpdate from the API layer
            phase_id = str(getattr(upd, "phaseId", ""))
            status = str(getattr(upd, "status", ""))
        phase = by_id.get(phase_id)
        if phase is None:
            raise GrowthError(f"Unknown phase: {phase_id}")
        if status == "COMPLETED":
            phase["completed"] = True
        elif status in ("LOCKED", "AVAILABLE", "IN_PROGRESS"):
            phase["completed"] = False
        phase["progressStatus"] = status
    roadmap["updatedAt"] = datetime.now(UTC).isoformat()
    await mongodb.save_roadmap(roadmap)
    return _clean_doc(roadmap)


def _clean_doc(doc: dict[str, Any]) -> dict[str, Any]:
    out = dict(doc)
    out["_id"] = str(out.get("_id"))
    out["userId"] = str(out.get("userId"))
    return out
