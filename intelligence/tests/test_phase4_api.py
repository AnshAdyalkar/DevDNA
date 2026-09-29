"""Phase 4 API tests (§31): analyze endpoint, auth, profile/repo endpoints.

MongoDB is mocked at the service boundary — deterministic, no database.
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.main import app

KEY = {"x-internal-key": "test-internal-key"}


class FakeSettings:
    """Deterministic settings for tests (env-independent)."""

    internal_key = "test-internal-key"
    mongodb_uri = "mongodb://127.0.0.1:27017/devdna_test"
    mongodb_database = "devdna_test"
    analysis_version = "1.0"


def _patch_settings(monkeypatch) -> None:
    from types import SimpleNamespace

    fake = SimpleNamespace(
        internal_key="test-internal-key",
        mongodb_uri="mongodb://127.0.0.1:27017/devdna_test",
        mongodb_database="devdna_test",
        analysis_version="1.0",
    )
    import app.api.routes.analysis_pipeline as pipeline
    import app.main as main_mod
    import app.services.analysis_service as service

    monkeypatch.setattr(pipeline, "get_settings", lambda: fake)
    monkeypatch.setattr(main_mod, "get_settings", lambda: fake)
    monkeypatch.setattr(service, "get_settings", lambda: fake)
    # The auth middleware reads the module-level settings object.
    monkeypatch.setattr(main_mod, "settings", fake)


REPO_DOC = {
    "_id": "64b0000000000000000000r1"[:24],
    "fullName": "octo/hello",
    "languages": {"Python": 8000, "JavaScript": 2000},
    "topics": ["fastapi"],
    "fileManifest": [
        {"path": "app/main.py", "size": 4000},
        {"path": "tests/test_main.py", "size": 1200},
        {"path": "README.md", "size": 900},
        {"path": "requirements.txt", "size": 200},
    ],
    "fileManifestTruncated": False,
    "readmeExists": True,
    "readmeSize": 900,
    "fork": False,
    "archived": False,
    "pushedAt": datetime.now(UTC).isoformat(),
    "githubUpdatedAt": datetime.now(UTC).isoformat(),
}


@pytest.fixture()
def client():
    return TestClient(app)


def _mock_mongomock(monkeypatch, repos=1):
    """Patch the mongodb service functions used by the pipeline."""
    import app.services.mongodb as mongo

    monkeypatch.setattr(mongo, "user_exists", AsyncMock(return_value=True))
    monkeypatch.setattr(
        mongo,
        "load_repositories",
        AsyncMock(
            return_value=[{**REPO_DOC, "_id": f"64b00000000000000000000{i}"} for i in range(repos)]
        ),
    )
    monkeypatch.setattr(mongo, "load_commits", AsyncMock(return_value=[]))
    monkeypatch.setattr(mongo, "load_cached_analysis", AsyncMock(return_value=None))
    monkeypatch.setattr(mongo, "save_repository_analysis", AsyncMock())
    monkeypatch.setattr(mongo, "save_developer_profile", AsyncMock())
    return mongo


class TestInternalAuth:
    def test_rejects_missing_key(self, client, monkeypatch):
        _patch_settings(monkeypatch)
        res = client.post("/api/intelligence/analyze/user/64b000000000000000000000")
        assert res.status_code == 403

    def test_rejects_wrong_key(self, client, monkeypatch):
        _patch_settings(monkeypatch)
        res = client.post(
            "/api/intelligence/analyze/user/64b000000000000000000000",
            headers={"x-internal-key": "wrong"},
        )
        assert res.status_code == 403

    def test_rejects_malformed_user_id(self, client, monkeypatch):
        _patch_settings(monkeypatch)
        res = client.post("/api/intelligence/analyze/user/x", headers=KEY)
        assert res.status_code == 400


class TestAnalyzeEndpoint:
    def test_analyze_user_completes(self, client, monkeypatch):
        _patch_settings(monkeypatch)
        _mock_mongomock(monkeypatch)
        res = client.post("/api/intelligence/analyze/user/64b000000000000000000000", headers=KEY)
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "completed"
        assert body["repositoriesAnalyzed"] == 1
        assert body["skillsDetected"] >= 1
        assert body["analysisVersion"] == "1.0"

    def test_incremental_analysis_uses_cache(self, client, monkeypatch):
        _patch_settings(monkeypatch)
        mongo = _mock_mongomock(monkeypatch)
        # First run stores analyses; second run hits the cache.
        stored: dict = {}

        async def fake_save(doc):
            stored[(doc["repositoryId"], doc["analysisVersion"], doc["sourceHash"])] = {
                "document": doc
            }

        mongo.save_repository_analysis.side_effect = fake_save

        res1 = client.post("/api/intelligence/analyze/user/64b000000000000000000000", headers=KEY)
        assert res1.status_code == 200
        assert res1.json()["repositoriesReanalyzed"] == 1

        async def fake_cached(repo_id, source_hash, version):
            return stored.get((repo_id, version, source_hash))

        monkeypatch.setattr(mongo, "load_cached_analysis", AsyncMock(side_effect=fake_cached))

        res2 = client.post("/api/intelligence/analyze/user/64b000000000000000000000", headers=KEY)
        assert res2.status_code == 200
        body2 = res2.json()
        assert body2["repositoriesCached"] == 1
        assert body2["repositoriesReanalyzed"] == 0

    def test_no_repositories_is_honest_422(self, client, monkeypatch):
        _patch_settings(monkeypatch)
        mongo = _mock_mongomock(monkeypatch, repos=0)
        monkeypatch.setattr(mongo, "load_repositories", AsyncMock(return_value=[]))
        res = client.post("/api/intelligence/analyze/user/64b000000000000000000000", headers=KEY)
        assert res.status_code == 422
        assert "Not enough data" in res.json()["detail"]


class TestProfileEndpoints:
    def test_profile_404_when_absent(self, client, monkeypatch):
        _patch_settings(monkeypatch)
        import app.services.mongodb as mongo

        monkeypatch.setattr(mongo, "load_developer_profile", AsyncMock(return_value=None))
        res = client.post("/api/intelligence/profile/user/64b000000000000000000000", headers=KEY)
        assert res.status_code == 404

    def test_profile_returns_document(self, client, monkeypatch):
        _patch_settings(monkeypatch)
        import app.services.mongodb as mongo

        profile = {
            "_id": "64b0000000000000000000p1",
            "userId": "64b000000000000000000000",
            "analysisVersion": "1.0",
            "skills": [{"skill": "Python", "score": 60, "confidence": 0.7, "evidence": []}],
        }
        monkeypatch.setattr(mongo, "load_developer_profile", AsyncMock(return_value=dict(profile)))
        res = client.post("/api/intelligence/profile/user/64b000000000000000000000", headers=KEY)
        assert res.status_code == 200
        assert res.json()["skills"][0]["skill"] == "Python"


class TestHealthAndReady:
    def test_health(self, client):
        res = client.get("/health")
        assert res.status_code == 200
        assert res.json()["status"] == "ok"

    def test_ready_reports_missing_config(self, client, monkeypatch):
        from types import SimpleNamespace

        import app.main as main_mod

        monkeypatch.setattr(
            main_mod,
            "get_settings",
            lambda: SimpleNamespace(internal_key="", mongodb_uri=""),
        )
        res = client.get("/ready")
        assert res.status_code == 503
