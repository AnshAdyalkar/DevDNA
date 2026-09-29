"""MongoDB access for the intelligence engine (Phase 4).

Reads the normalized GitHub data that the Node gateway synchronized in
Phase 3 (repositories, commits, contributors, GitHub accounts) and writes
analysis results (repository_analyses, developer_profiles).

The service is lazy — it connects on first use so tests can run without a
database. Only derived/aggregate intelligence is written back; raw GitHub
data is never exposed through any API response.
"""

from __future__ import annotations

import logging
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from ..config import get_settings

logger = logging.getLogger("devdna.intelligence")

_client: AsyncIOMotorClient | None = None


def _db() -> AsyncIOMotorDatabase:
    global _client
    settings = get_settings()
    if not settings.mongodb_uri:
        raise RuntimeError("PYTHON_MONGODB_URI is not configured")
    if _client is None:
        _client = AsyncIOMotorClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
    return _client[settings.mongodb_database]


async def close_client() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None


async def ping() -> bool:
    """Readiness probe: True when MongoDB answers a ping."""
    try:
        await _db().command("ping")
        return True
    except Exception:  # noqa: BLE001 - readiness must never raise
        return False


# ─── Data loading (Phase 3 collections) ─────────────────────────────────────


async def user_exists(user_id: str) -> bool:
    from bson import ObjectId

    if not ObjectId.is_valid(user_id):
        return False
    return await _db().users.find_one({"_id": ObjectId(user_id)}) is not None


async def load_repositories(user_id: str) -> list[dict[str, Any]]:
    """All repositories owned by the user (ownership enforced at the query)."""
    from bson import ObjectId

    cursor = _db().repositories.find({"userId": ObjectId(user_id)})
    return await cursor.to_list(length=500)


async def load_commits(user_id: str) -> list[dict[str, Any]]:
    from bson import ObjectId

    cursor = _db().commits.find(
        {"userId": ObjectId(user_id)},
        {"committedAt": 1, "repositoryId": 1, "authorLogin": 1, "branch": 1},
    )
    return await cursor.to_list(length=20_000)


async def load_github_login(user_id: str) -> str | None:
    from bson import ObjectId

    account = await _db().githubaccounts.find_one({"userId": ObjectId(user_id)}, {"login": 1})
    return account.get("login") if account else None


# ─── Result persistence ─────────────────────────────────────────────────────


async def save_repository_analysis(doc: dict[str, Any]) -> None:
    """Upsert one RepositoryAnalysis; the full document is nested under
    `document` so the cache lookup can validate and reload it whole."""
    from bson import ObjectId

    await _db().repository_analyses.update_one(
        {"repositoryId": ObjectId(doc["repositoryId"]), "analysisVersion": doc["analysisVersion"]},
        {"$set": {**doc, "document": doc}},
        upsert=True,
    )


async def load_cached_analysis(
    repository_id: str, source_hash: str, version: str
) -> dict[str, Any] | None:
    """Cached repository analysis for an unchanged fingerprint (§21)."""
    from bson import ObjectId

    return await _db().repository_analyses.find_one(
        {
            "repositoryId": ObjectId(repository_id),
            "analysisVersion": version,
            "sourceHash": source_hash,
        }
    )


async def save_developer_profile(doc: dict[str, Any]) -> None:
    from bson import ObjectId

    user_oid = doc["userId"] if isinstance(doc["userId"], ObjectId) else ObjectId(doc["userId"])
    await _db().developer_profiles.update_one(
        {"userId": user_oid},
        # Store userId as ObjectId (not the raw string) so every
        # ObjectId-keyed load finds the document.
        {"$set": {**doc, "userId": user_oid}},
        upsert=True,
    )


async def load_developer_profile(user_id: str) -> dict[str, Any] | None:
    from bson import ObjectId

    return await _db().developer_profiles.find_one({"userId": ObjectId(user_id)})
