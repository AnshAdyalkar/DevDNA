"""Growth-engine MongoDB access (Phase 5).

Growth results are stored in dedicated collections with ownership embedded
in every query (§32). userId is stored as a string (the Python engine is
routing-level only); Node derives it from the authenticated session.

Collections:
  skill_gap_analyses       — one per user+role (latest wins)
  roadmaps                 — versioned per user+role (§29)
  project_recommendations  — regenerated per user+role analysis
"""

from __future__ import annotations

from typing import Any

from bson import ObjectId

from ..services.mongodb import _db

ROADMAP_ACTIVE = "ACTIVE"
ROADMAP_OUTDATED = "OUTDATED"


async def save_skill_gaps(doc: dict[str, Any]) -> None:
    await _db().skill_gap_analyses.update_one(
        {"userId": doc["userId"], "targetRole": doc["targetRole"]},
        {"$set": doc},
        upsert=True,
    )


async def load_skill_gaps(user_id: str, target_role: str) -> dict[str, Any] | None:
    return await _db().skill_gap_analyses.find_one({"userId": user_id, "targetRole": target_role})


async def next_roadmap_version(user_id: str, target_role: str) -> int:
    """Next roadmap version for user+role (§29)."""
    last = await _db().roadmaps.find_one(
        {"userId": user_id, "targetRole": target_role},
        sort=[("version", -1)],
    )
    return int(last["version"]) + 1 if last else 1


async def save_roadmap(doc: dict[str, Any]) -> None:
    """Persist one roadmap version without duplicating the same version record.

    Existing versions are marked SUPERSEDED, but the active version gets upserted
    in place so progress updates can mutate the same roadmap document safely.
    """
    await _db().roadmaps.update_many(
        {
            "userId": doc["userId"],
            "targetRole": doc["targetRole"],
            "version": {"$ne": doc["version"]},
        },
        {"$set": {"status": "SUPERSEDED"}},
    )
    await _db().roadmaps.update_one(
        {"userId": doc["userId"], "targetRole": doc["targetRole"], "version": doc["version"]},
        {"$set": doc},
        upsert=True,
    )


async def load_roadmap(
    user_id: str, target_role: str | None, latest: bool = True
) -> dict[str, Any] | None:
    """The latest roadmap for user (+role filter); falls back across roles."""
    query: dict[str, Any] = {"userId": user_id}
    if target_role:
        query["targetRole"] = target_role
    return await _db().roadmaps.find_one(query, sort=[("version", -1)])


async def replace_project_recommendations(
    user_id: str, target_role: str, projects: list[dict[str, Any]]
) -> None:
    """Replace the user's recommendations for a role (regeneration, §28)."""
    await _db().project_recommendations.delete_many({"userId": user_id, "targetRole": target_role})
    if projects:
        await _db().project_recommendations.insert_many(projects)


async def load_project_recommendations(
    user_id: str, target_role: str | None
) -> list[dict[str, Any]]:
    query: dict[str, Any] = {"userId": user_id}
    if target_role:
        query["targetRole"] = target_role
    cursor = _db().project_recommendations.find(query).sort("generatedAt", -1)
    return await cursor.to_list(length=50)


async def load_project_recommendation(user_id: str, project_id: str) -> dict[str, Any] | None:
    """One recommendation by id, ownership-checked (§32)."""
    if not ObjectId.is_valid(project_id):
        return None
    return await _db().project_recommendations.find_one(
        {"_id": ObjectId(project_id), "userId": user_id}
    )


async def growth_outdated_state(user_id: str) -> dict[str, Any]:
    """Detect Developer-DNA changes since the growth analysis (§28)."""
    profile = await _db().developer_profiles.find_one(
        {"userId": ObjectId(user_id)}, {"updatedAt": 1}
    )
    roadmap = await load_roadmap(user_id, None, latest=True)
    if not profile or not roadmap:
        return {
            "outdated": False,
            "profileUpdatedAt": None,
            "roadmapGeneratedAt": None,
        }
    profile_updated = str(profile.get("updatedAt") or "")
    generated_at = str(roadmap.get("generatedAt") or "")
    return {
        "outdated": profile_updated > generated_at,
        "profileUpdatedAt": profile_updated,
        "roadmapGeneratedAt": generated_at,
        "roadmapVersion": roadmap.get("version"),
        "targetRole": roadmap.get("targetRole"),
    }
