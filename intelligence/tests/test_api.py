"""API contract tests: internal-key enforcement and analysis endpoints."""

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _set_internal_key(monkeypatch):
    """Provide a deterministic internal key for the app under test."""
    settings = get_settings()
    monkeypatch.setattr(settings, "internal_key", "test-key-123")


HEADERS = {"x-internal-key": "test-key-123"}


class TestAuth:
    def test_analyze_requires_key(self):
        res = client.post("/analyze/skills", json={"languages": {}, "technologies": []})
        assert res.status_code == 403

    def test_analyze_rejects_wrong_key(self):
        res = client.post(
            "/analyze/skills",
            json={"languages": {}, "technologies": []},
            headers={"x-internal-key": "wrong"},
        )
        assert res.status_code == 403

    def test_health_is_open(self):
        res = client.get("/health")
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "ok"
        assert "skills" in body["analyzers"]


class TestAnalysisEndpoints:
    def test_skills_endpoint(self):
        payload = {
            "languages": {"Python": 8000, "JavaScript": 2000},
            "technologies": ["FastAPI"],
            "repositories": [
                {
                    "repository_id": "r1",
                    "name": "r1",
                    "languages": {"Python": 8000},
                    "commit_count": 50,
                    "file_count": 20,
                    "technologies": ["FastAPI", "Pytest"],
                    "has_tests": True,
                    "has_docs": True,
                    "stars": 3,
                    "size_kb": 120,
                }
            ],
        }
        res = client.post("/analyze/skills", json=payload, headers=HEADERS)
        assert res.status_code == 200
        body = res.json()
        skills = body["skills"]
        assert skills
        python = next(s for s in skills if s["skill"] == "Python")
        assert 0 <= python["score"] <= 100
        assert python["evidence"]

    def test_repository_endpoint(self):
        payload = {
            "repository_id": "r1",
            "name": "demo",
            "languages": {"Python": 1000},
            "commit_count": 40,
            "file_count": 12,
            "technologies": ["FastAPI", "Docker"],
            "has_tests": True,
            "has_docs": True,
            "has_docker": True,
            "stars": 1,
            "size_kb": 90,
        }
        res = client.post("/analyze/repository", json=payload, headers=HEADERS)
        assert res.status_code == 200
        body = res.json()
        assert 0 <= body["health_score"] <= 100
        assert body["complexity_reasons"]

    def test_dna_endpoint(self):
        payload = {
            "skills": [
                {"skill": "Python", "score": 80, "confidence": 0.9, "evidence": ["3 repos"]},
                {"skill": "React", "score": 70, "confidence": 0.8, "evidence": ["2 repos"]},
            ],
            "repositories": [
                {
                    "repository_id": "r1",
                    "name": "r1",
                    "documentation_score": 70,
                    "testing_score": 50,
                    "maintainability_score": 60,
                    "complexity_score": 55,
                    "activity_score": 65,
                    "health_score": 60,
                }
            ],
        }
        res = client.post("/analyze/dna", json=payload, headers=HEADERS)
        assert res.status_code == 200
        body = res.json()
        assert 0 <= body["overall"] <= 100
        assert body["dimensions"]

    def test_gaps_endpoint(self):
        payload = {
            "skills": [
                {"skill": "React", "score": 75, "confidence": 0.8, "evidence": []},
                {"skill": "Node.js", "score": 60, "confidence": 0.8, "evidence": []},
            ],
            "target_role": "Full Stack Developer",
        }
        res = client.post("/analyze/gaps", json=payload, headers=HEADERS)
        assert res.status_code == 200
        body = res.json()
        assert body["target_role"] == "Full Stack Developer"
        assert any(g["skill"] == "Testing" for g in body["gaps"])

    def test_recommendations_endpoint(self):
        payload = {
            "skills": [{"skill": "Python", "score": 80, "confidence": 0.9, "evidence": []}],
            "gaps": [
                {
                    "skill": "Docker",
                    "current_level": 0,
                    "target_level": 60,
                    "gap": 60,
                    "importance": "important",
                },
                {
                    "skill": "Testing",
                    "current_level": 0,
                    "target_level": 65,
                    "gap": 65,
                    "importance": "critical",
                },
            ],
        }
        res = client.post("/analyze/recommendations", json=payload, headers=HEADERS)
        assert res.status_code == 200
        projects = res.json()["projects"]
        assert 0 < len(projects) <= 4
        assert all(p["develops"] for p in projects)
