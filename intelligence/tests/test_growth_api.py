"""Phase 5 growth API tests (§18, §35).

The growth endpoints are internal (Node-gateway) endpoints; auth is the
shared internal key. MongoDB is mocked at the service boundary.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.main import app

KEY = {"x-internal-key": "test-internal-key"}
USER_ID = "64b0000000000000000000aa"

PROFILE = {
    "userId": USER_ID,
    "analysisVersion": "1.0",
    "skills": [
        {"skill": "Python", "score": 82, "confidence": 0.9, "evidence": []},
        {"skill": "React", "score": 75, "confidence": 0.8, "evidence": []},
    ],
    "engineeringPractices": {"averageTestingScore": 40, "repositoriesWithCi": 1},
    "repositoriesAnalyzed": 3,
}


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture()
def patched_mongo(monkeypatch):
    import app.growth.mongodb as gmongo
    import app.services.mongodb as core_mongo

    monkeypatch.setattr(core_mongo, "load_developer_profile", AsyncMock(return_value=dict(PROFILE)))
    monkeypatch.setattr(gmongo, "save_skill_gaps", AsyncMock())
    monkeypatch.setattr(gmongo, "next_roadmap_version", AsyncMock(return_value=1))
    monkeypatch.setattr(gmongo, "load_roadmap", AsyncMock(return_value=None))
    monkeypatch.setattr(gmongo, "save_roadmap", AsyncMock())
    monkeypatch.setattr(gmongo, "replace_project_recommendations", AsyncMock())
    return gmongo


@pytest.fixture()
def patched_settings(monkeypatch):
    from types import SimpleNamespace

    import app.api.routes.growth as growth_routes
    import app.main as main_mod

    fake = SimpleNamespace(
        internal_key="test-internal-key", mongodb_uri="mongo://x", mongodb_database="devdna_test"
    )
    monkeypatch.setattr(growth_routes, "get_settings", lambda: fake)
    monkeypatch.setattr(main_mod, "get_settings", lambda: fake)
    monkeypatch.setattr(main_mod, "settings", fake)


class TestGrowthAuth:
    def test_rejects_missing_key(self, client, patched_settings):
        res = client.get("/api/growth/roles")
        assert res.status_code == 403

    def test_rejects_wrong_key(self, client, patched_settings):
        res = client.get("/api/growth/roles", headers={"x-internal-key": "wrong"})
        assert res.status_code == 403

    def test_roles_with_valid_key(self, client, patched_settings):
        res = client.get("/api/growth/roles", headers=KEY)
        assert res.status_code == 200
        roles = res.json()["roles"]
        assert len(roles) == 8
        full_stack = next(r for r in roles if r["role"] == "Full Stack Developer")
        assert any(s["name"] == "React" for s in full_stack["skills"])


class TestGrowthAnalyze:
    def test_full_pipeline(self, client, patched_settings, patched_mongo):
        res = client.post(
            "/api/growth/analyze",
            json={"userId": USER_ID, "targetRole": "Full Stack Developer"},
            headers=KEY,
        )
        assert res.status_code == 200
        body = res.json()
        assert body["targetRole"] == "Full Stack Developer"
        assert body["gapsFound"] >= 1
        assert body["roadmapGenerated"] is True
        assert body["projectsGenerated"] >= 1
        assert body["analysisVersion"] == "1.0"
        # Results persisted.
        patched_mongo.save_skill_gaps.assert_awaited_once()
        patched_mongo.save_roadmap.assert_awaited_once()
        patched_mongo.replace_project_recommendations.assert_awaited_once()

    def test_no_dna_is_honest_422(self, client, patched_settings, patched_mongo, monkeypatch):
        import app.services.mongodb as core_mongo

        monkeypatch.setattr(core_mongo, "load_developer_profile", AsyncMock(return_value=None))
        res = client.post(
            "/api/growth/analyze",
            json={"userId": USER_ID, "targetRole": "Full Stack Developer"},
            headers=KEY,
        )
        assert res.status_code == 422
        assert "Developer DNA" in res.json()["detail"]

    def test_roadmap_versioning_on_reanalysis(self, client, patched_settings, patched_mongo):
        patched_mongo.next_roadmap_version.return_value = 3
        res = client.post(
            "/api/growth/analyze",
            json={"userId": USER_ID, "targetRole": "Python Developer"},
            headers=KEY,
        )
        assert res.status_code == 200
        assert res.json()["roadmapVersion"] == 3

    def test_unknown_role_rejected(self, client, patched_settings, patched_mongo):
        res = client.post(
            "/api/growth/analyze",
            json={"userId": USER_ID, "targetRole": "Wizard"},
            headers=KEY,
        )
        assert res.status_code == 422
        assert "Unsupported target role" in res.json()["detail"]


class TestGrowthRetrieval:
    def test_gaps_roundtrip(self, client, patched_settings, patched_mongo):
        client.post(
            "/api/growth/analyze",
            json={"userId": USER_ID, "targetRole": "Full Stack Developer"},
            headers=KEY,
        )
        saved = patched_mongo.save_skill_gaps.await_args.args[0]
        patched_mongo.load_skill_gaps = AsyncMock(return_value=dict(saved))
        res = client.post(
            "/api/growth/gaps",
            json={"userId": USER_ID, "targetRole": "Full Stack Developer"},
            headers=KEY,
        )
        assert res.status_code == 200
        gaps = res.json()["gaps"]
        assert gaps
        for g in gaps:
            assert g["priority"] in ("HIGH", "MEDIUM", "LOW")
            assert g["kind"] in ("demonstrated", "limited_evidence", "not_detected")
            assert isinstance(g["evidence"], list)

    def test_gaps_404_when_absent(self, client, patched_settings, patched_mongo):
        patched_mongo.load_skill_gaps = AsyncMock(return_value=None)
        res = client.post(
            "/api/growth/gaps",
            json={"userId": USER_ID, "targetRole": "Full Stack Developer"},
            headers=KEY,
        )
        assert res.status_code == 404

    def test_roadmap_roundtrip(self, client, patched_settings, patched_mongo):
        client.post(
            "/api/growth/analyze",
            json={"userId": USER_ID, "targetRole": "Full Stack Developer"},
            headers=KEY,
        )
        saved = patched_mongo.save_roadmap.await_args.args[0]
        patched_mongo.load_roadmap = AsyncMock(return_value=dict(saved))
        res = client.post(
            "/api/growth/roadmap",
            json={"userId": USER_ID, "targetRole": "Full Stack Developer"},
            headers=KEY,
        )
        assert res.status_code == 200
        body = res.json()
        assert body["targetRole"] == "Full Stack Developer"
        assert body["version"] >= 1
        assert body["phases"]
        phase = body["phases"][0]
        assert phase["learningObjectives"]
        assert phase["resources"]
        assert "completed" in phase

    def test_projects_roundtrip(self, client, patched_settings, patched_mongo):
        client.post(
            "/api/growth/analyze",
            json={"userId": USER_ID, "targetRole": "Backend Developer"},
            headers=KEY,
        )
        saved = patched_mongo.replace_project_recommendations.await_args.args[2]
        patched_mongo.load_project_recommendations = AsyncMock(return_value=list(saved))
        res = client.post(
            "/api/growth/projects",
            json={"userId": USER_ID, "targetRole": "Backend Developer"},
            headers=KEY,
        )
        assert res.status_code == 200
        projects = res.json()["projects"]
        assert len(projects) == 3
        p = projects[0]
        assert p["milestones"]
        assert p["difficulty"] in ("Beginner", "Intermediate", "Advanced")

    def test_regenerate_creates_next_version(self, client, patched_settings, patched_mongo):
        client.post(
            "/api/growth/analyze",
            json={"userId": USER_ID, "targetRole": "Full Stack Developer"},
            headers=KEY,
        )
        patched_mongo.save_roadmap.assert_awaited()  # a new version was stored
        patched_mongo.next_roadmap_version.return_value = 2
        res = client.post(
            "/api/growth/roadmap/regenerate",
            json={"userId": USER_ID, "targetRole": "Full Stack Developer"},
            headers=KEY,
        )
        assert res.status_code == 200
        body = res.json()
        assert body["roadmapVersion"] == 2
        assert body["summary"]["gapsFound"] >= 0


class TestGrowthProgress:
    def test_phase_progress_updates(self, client, patched_settings, patched_mongo):
        client.post(
            "/api/growth/analyze",
            json={"userId": USER_ID, "targetRole": "Full Stack Developer"},
            headers=KEY,
        )
        roadmap = dict(patched_mongo.save_roadmap.await_args.args[0])
        phase_id = roadmap["phases"][0]["id"]
        patched_mongo.load_roadmap = AsyncMock(return_value=roadmap)

        res = client.post(
            "/api/growth/progress",
            json={"userId": USER_ID, "updates": [{"phaseId": phase_id, "status": "COMPLETED"}]},
            headers=KEY,
        )
        assert res.status_code == 200
        updated = res.json()["phases"][0]
        assert updated["completed"] is True
        assert updated["progressStatus"] == "COMPLETED"

    def test_save_roadmap_upserts_existing_version(self, monkeypatch):
        import asyncio

        import app.growth.mongodb as gmongo

        seen = {}

        class FakeCollection:
            async def update_many(self, *args, **kwargs):
                seen["update_many"] = args

            async def update_one(self, *args, **kwargs):
                seen["update_one"] = args
                seen["update_one_kwargs"] = kwargs

        monkeypatch.setattr(gmongo, "_db", lambda: type("C", (), {"roadmaps": FakeCollection()})())

        doc = {
            "userId": USER_ID,
            "targetRole": "Full Stack Developer",
            "version": 1,
            "status": "ACTIVE",
            "phases": [{"id": "phase-1", "completed": False, "progressStatus": "AVAILABLE"}],
        }

        asyncio.run(gmongo.save_roadmap(doc))

        assert "update_many" in seen
        assert "update_one" in seen
        assert seen["update_one"][0] == {
            "userId": USER_ID,
            "targetRole": "Full Stack Developer",
            "version": 1,
        }
        assert seen["update_one"][1] == {"$set": doc}
        assert seen["update_one_kwargs"]["upsert"] is True

    def test_unknown_phase_rejected(self, client, patched_settings, patched_mongo):
        patched_mongo.load_roadmap = AsyncMock(
            return_value={"userId": USER_ID, "targetRole": "X", "version": 1, "phases": []}
        )
        res = client.post(
            "/api/growth/progress",
            json={"userId": USER_ID, "updates": [{"phaseId": "phase-9", "status": "COMPLETED"}]},
            headers=KEY,
        )
        assert res.status_code == 422


class TestGrowthOutdated:
    def test_outdated_detection(self, client, patched_settings, patched_mongo):
        patched_mongo.growth_outdated_state = AsyncMock(
            return_value={
                "outdated": True,
                "profileUpdatedAt": "2026-09-28T01:00:00+00:00",
                "roadmapGeneratedAt": "2026-09-28T00:00:00+00:00",
            }
        )
        res = client.post("/api/growth/outdated", json={"userId": USER_ID}, headers=KEY)
        assert res.status_code == 200
        assert res.json()["outdated"] is True
