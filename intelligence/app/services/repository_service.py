"""Repository-level intelligence access for the API layer (§5)."""

from __future__ import annotations

from typing import Any

from bson import ObjectId

from . import mongodb


async def list_repository_analyses(user_id: str) -> list[dict[str, Any]]:
    """The user's stored repository analyses (ownership-scoped)."""
    if not ObjectId.is_valid(user_id):
        return []
    cursor = (
        mongodb._db()
        .repository_analyses.find(
            {"userId": ObjectId(user_id)},
            {"document": 0},
        )
        .sort("analyzedAt", -1)
    )
    docs = await cursor.to_list(length=500)
    for d in docs:
        d["_id"] = str(d["_id"])
        d["repositoryId"] = str(d["repositoryId"])
        d["userId"] = str(d["userId"])
    return docs


async def get_repository_analysis(user_id: str, repository_id: str) -> dict[str, Any] | None:
    """One analysis — 404-safe: another user's repository id simply won't match."""
    if not ObjectId.is_valid(user_id) or not ObjectId.is_valid(repository_id):
        return None
    doc = await mongodb._db().repository_analyses.find_one(
        {"repositoryId": ObjectId(repository_id), "userId": ObjectId(user_id)},
        {"document": 0},
    )
    if not doc:
        return None
    doc["_id"] = str(doc["_id"])
    doc["repositoryId"] = str(doc["repositoryId"])
    doc["userId"] = str(doc["userId"])
    return doc


async def get_developer_profile(user_id: str) -> dict[str, Any] | None:
    profile = await mongodb.load_developer_profile(user_id)
    if not profile:
        return None
    profile["_id"] = str(profile["_id"])
    profile["userId"] = str(profile["userId"])
    return profile
