"""Tests for the skill-gap engine and recommendation ranking."""

from app.api.models.schemas import (
    RecommendationRequest,
    ScoredSkill,
    SkillGap,
    SkillGapsRequest,
)
from app.services import gaps, recommendations


def _skill(name: str, score: int) -> ScoredSkill:
    return ScoredSkill(skill=name, score=score, confidence=0.8, evidence=[])


def _gap(name: str, gap: int) -> SkillGap:
    return SkillGap(
        skill=name,
        current_level=0,
        target_level=gap,
        gap=gap,
        importance="important",
    )


class TestGaps:
    def test_full_stack_gaps_detected(self):
        result = gaps.compute_gaps(
            SkillGapsRequest(
                skills=[_skill("React", 75), _skill("Node.js", 60), _skill("MongoDB", 68)],
                target_role="Full Stack Developer",
            )
        )
        by_skill = {g.skill: g for g in result.gaps}
        assert by_skill["Testing"].gap >= 60  # 0 current vs 65 target
        assert by_skill["Testing"].importance == "critical"
        # Critical gaps sort before nice-to-haves
        priorities = [g.importance for g in result.gaps]
        assert priorities.index("critical") < len(priorities) - 1

    def test_unknown_role_falls_back(self):
        result = gaps.compute_gaps(SkillGapsRequest(skills=[], target_role="Nonsense Role"))
        assert result.target_role == "Software Engineer"

    def test_missing_skill_counts_as_zero(self):
        result = gaps.compute_gaps(SkillGapsRequest(skills=[], target_role="Python Developer"))
        python = next(g for g in result.gaps if g.skill == "Python")
        assert python.current_level == 0
        assert python.gap == 85

    def test_strengths_listed(self):
        result = gaps.compute_gaps(
            SkillGapsRequest(
                skills=[_skill("Python", 90), _skill("React", 40)],
                target_role="Software Engineer",
            )
        )
        assert result.strengths[0].skill == "Python"


class TestRecommendations:
    def test_recommends_projects_closing_gaps(self):
        result = recommendations.recommend(
            RecommendationRequest(
                skills=[_skill("Python", 80), _skill("React", 75)],
                gaps=[_gap("Docker", 60), _gap("Testing", 65)],
            )
        )
        titles = [p.title for p in result.projects]
        assert "Containerized Microservices Demo" in titles or "Test-First CLI Toolkit" in titles

    def test_no_gaps_still_returns_projects(self):
        result = recommendations.recommend(RecommendationRequest(skills=[_skill("Python", 80)]))
        assert result.projects  # graceful: shows leverage-strengths projects
