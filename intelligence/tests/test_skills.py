"""Tests for the skill scoring engine."""

from app.api.models.schemas import (
    RepositoryAnalysisRequest,
    ScoredSkill,
    SkillProfileRequest,
)
from app.services import skills


def _repo(name: str = "repo", languages: dict | None = None, tech: list | None = None, **kw):
    return RepositoryAnalysisRequest(
        repository_id=name,
        name=name,
        languages=languages or {"Python": 9000},
        commit_count=kw.get("commit_count", 80),
        file_count=kw.get("file_count", 30),
        technologies=tech or ["FastAPI"],
        has_tests=kw.get("has_tests", True),
        has_docs=True,
        has_ci=False,
        has_docker=False,
        stars=kw.get("stars", 5),
        size_kb=250,
    )


class TestLanguageScoring:
    def test_score_has_evidence(self):
        profile = skills.build_skill_profile(
            SkillProfileRequest(
                languages={"Python": 9000},
                technologies=["FastAPI"],
                repositories=[_repo(tech=["FastAPI", "Pytest"])],
            )
        )
        python = next(s for s in profile.skills if s.skill == "Python")
        assert python.evidence
        assert python.score > 0
        assert 0 < python.confidence <= 1

    def test_higher_code_share_scores_higher(self):
        # Usage is measured as share of the codebase: 100% Python
        # must outrank Python diluted by another language.
        pure = skills.build_skill_profile(
            SkillProfileRequest(languages={"Python": 9000}, repositories=[_repo()])
        )
        mixed = skills.build_skill_profile(
            SkillProfileRequest(
                languages={"Python": 9000, "JavaScript": 9000},
                repositories=[_repo()],
            )
        )
        py_pure = next(s for s in pure.skills if s.skill == "Python")
        py_mixed = next(s for s in mixed.skills if s.skill == "Python")
        assert py_pure.score > py_mixed.score

    def test_deterministic(self):
        payload = SkillProfileRequest(
            languages={"Python": 5000, "JavaScript": 3000},
            technologies=["FastAPI", "React"],
            repositories=[_repo(), _repo("r2", languages={"JavaScript": 6000}, tech=["React"])],
        )
        a = skills.build_skill_profile(payload)
        b = skills.build_skill_profile(payload)
        assert a == b

    def test_single_repo_tech_is_capped(self):
        # One repo using Docker must not imply expertise
        profile = skills.build_skill_profile(
            SkillProfileRequest(
                languages={"Python": 5000},
                technologies=["Docker"],
                repositories=[_repo(tech=["Docker"])],
            )
        )
        docker = next(s for s in profile.skills if s.skill == "Docker")
        assert docker.score <= 55


class TestDna:
    def test_dna_aggregates_dimensions(self):
        import asyncio

        payload_skills = [
            ScoredSkill(skill="Python", score=85, confidence=0.9, evidence=["5 repositories"]),
            ScoredSkill(skill="React", score=75, confidence=0.8, evidence=["3 repositories"]),
            ScoredSkill(skill="Jest", score=40, confidence=0.7, evidence=["2 repositories"]),
        ]
        result = asyncio.run(skills.compute_dna(skills.DnaRequest(skills=payload_skills)))
        names = {d.dimension for d in result.dimensions}
        assert {"languages", "frontend", "testing"} <= names
        assert 0 <= result.overall <= 100
        assert "no randomness" in result.methodology
