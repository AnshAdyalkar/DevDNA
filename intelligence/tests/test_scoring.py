"""Tests for scoring primitives and the repository complexity engine."""

import pytest

from app.api.models.schemas import RepositoryAnalysisRequest
from app.scoring.normalize import clamp, log_scale, share_of, weighted_average
from app.services import complexity


class TestNormalize:
    def test_clamp_bounds(self):
        assert clamp(-5) == 0
        assert clamp(150) == 100
        assert clamp(63.4) == 63

    def test_log_scale_zero(self):
        assert log_scale(0, k=1, midpoint=100) == 0.0

    def test_log_scale_monotonic(self):
        values = [log_scale(v, k=1, midpoint=100) for v in [1, 10, 50, 100, 500]]
        assert values == sorted(values)

    def test_log_scale_midpoint(self):
        # At value == midpoint/k, log1p terms are equal -> 50 points
        assert log_scale(100, k=1, midpoint=100) == pytest.approx(50.0)

    def test_weighted_average(self):
        assert weighted_average([(80, 2), (60, 1)]) == pytest.approx(73.333, abs=0.01)
        assert weighted_average([(50, 0), (80, 1)]) == 80.0
        assert weighted_average([]) == 0.0

    def test_share_of(self):
        assert share_of(50, 100) == 0.5
        assert share_of(1, 0) == 0.0
        assert share_of(200, 100) == 1.0


def _repo(**overrides) -> RepositoryAnalysisRequest:
    base = dict(
        repository_id="r1",
        name="demo-app",
        languages={"Python": 8000, "JavaScript": 2000},
        commit_count=120,
        file_count=40,
        technologies=["FastAPI", "React", "MongoDB", "Docker"],
        has_tests=True,
        has_docs=True,
        has_ci=True,
        has_docker=True,
        stars=10,
        size_kb=300,
    )
    base.update(overrides)
    return RepositoryAnalysisRequest(**base)


class TestComplexityEngine:
    def test_full_stack_repo_scores_higher_than_simple(self):
        full = complexity.analyze_repository(_repo())
        simple = complexity.analyze_repository(
            _repo(
                technologies=["HTML"],
                has_tests=False,
                has_ci=False,
                has_docker=False,
                commit_count=3,
                stars=0,
            )
        )
        assert full.complexity_score > simple.complexity_score
        assert full.health_score > simple.health_score

    def test_deterministic(self):
        a = complexity.analyze_repository(_repo())
        b = complexity.analyze_repository(_repo())
        assert a == b  # identical input -> identical analysis

    def test_scores_have_reasons(self):
        result = complexity.analyze_repository(_repo())
        assert len(result.complexity_reasons) >= 4
        assert result.complexity_score > 0

    def test_scores_within_bounds(self):
        result = complexity.analyze_repository(_repo())
        for field in (
            "documentation_score",
            "testing_score",
            "maintainability_score",
            "complexity_score",
            "activity_score",
            "health_score",
        ):
            assert 0 <= getattr(result, field) <= 100

    def test_empty_repo_is_neutral_not_crash(self):
        result = complexity.analyze_repository(
            _repo(file_count=0, commit_count=0, stars=0, technologies=[])
        )
        assert 0 <= result.health_score <= 100
        assert result.notes  # explains the missing data
