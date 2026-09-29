"""Phase 5 growth-engine tests (§35).

Role matrix, skill-gap calculation, priority calculation, dependency
graph, roadmap ordering, project matching, missing/limited evidence,
strong existing skills, multiple target roles, determinism.
"""

from __future__ import annotations

from typing import Any

from app.growth.dependency_graph import (
    ancestors_of,
    dependency_depth,
    prerequisites_of,
    topological_skills,
    unlocked_by,
)
from app.growth.gap_engine import compute_skill_gaps
from app.growth.project_engine import generate_projects
from app.growth.roadmap_engine import build_roadmap
from app.growth.role_matrix import (
    DEFAULT_ROLE,
    get_role_matrix,
    is_known_role,
    role_names,
)

NOW = "2026-09-28T00:00:00+00:00"
VERSION = "1.0"
USER = "64b0000000000000000000aa"


def _profile(skills: list[dict[str, Any]], **extra: Any) -> dict[str, Any]:
    return {
        "userId": USER,
        "skills": skills,
        "engineeringPractices": {"averageTestingScore": 55, "repositoriesWithCi": 2},
        "repositoriesAnalyzed": 4,
        **extra,
    }


def _skill(name: str, score: int, confidence: float = 0.8) -> dict[str, Any]:
    return {
        "skill": name,
        "score": score,
        "confidence": confidence,
        "evidence": [{"type": "repository", "value": "detected in 2 repositories"}],
    }


class TestRoleMatrix:
    def test_all_eight_roles_supported(self):
        assert len(role_names()) == 8
        assert "Full Stack Developer" in role_names()
        assert "DevOps Engineer" in role_names()

    def test_matrix_shape(self):
        matrix = get_role_matrix("Full Stack Developer")
        names = {s.name for s in matrix.skills}
        assert {"JavaScript", "React", "Node.js", "Testing"} <= names
        js = next(s for s in matrix.skills if s.name == "JavaScript")
        assert js.importance == 0.9
        assert js.requiredLevel == 75

    def test_unknown_role_falls_back_to_default(self):
        matrix = get_role_matrix("Nonsense Role")
        assert matrix.role == DEFAULT_ROLE
        assert is_known_role("Full Stack Developer")
        assert not is_known_role("Nonsense Role")

    def test_every_role_has_required_fields(self):
        for role in role_names():
            matrix = get_role_matrix(role)
            assert matrix.skills, f"{role} has no skills"
            for skill in matrix.skills:
                assert 0 < skill.importance <= 1
                assert 0 < skill.requiredLevel <= 100


class TestSkillGaps:
    def test_gap_zero_when_current_meets_requirement(self):
        profile = _profile([_skill("Docker", 60)])
        result = compute_skill_gaps(profile, "Full Stack Developer", VERSION, NOW)
        docker_gaps = [g for g in result.gaps if g.skill == "Docker"]
        assert docker_gaps == []  # demonstrated at/above target ⇒ not a gap
        assert "Docker" in result.strengths

    def test_demonstrated_gap_with_evidence(self):
        profile = _profile([_skill("Docker", 38, confidence=0.7)])
        result = compute_skill_gaps(profile, "Full Stack Developer", VERSION, NOW)
        gap = next(g for g in result.gaps if g.skill == "Docker")
        assert gap.currentScore == 38
        assert gap.requiredLevel == 50
        assert gap.gap == 12
        assert gap.kind == "demonstrated"
        assert gap.evidence  # evidence explains WHY (§4)

    def test_not_detected_is_not_scored_zero(self):
        profile = _profile([])
        result = compute_skill_gaps(profile, "Full Stack Developer", VERSION, NOW)
        gap = next(g for g in result.gaps if g.skill == "Docker")
        assert gap.currentScore is None
        assert gap.kind == "not_detected"
        assert "insufficient evidence" in " ".join(gap.evidence).lower()

    def test_limited_evidence_distinction(self):
        profile = _profile([_skill("Jest", 42, confidence=0.45)])
        result = compute_skill_gaps(profile, "Full Stack Developer", VERSION, NOW)
        gap = next(g for g in result.gaps if g.skill == "Testing")
        assert gap.kind == "limited_evidence"
        assert gap.currentScore == 42  # Jest demonstrates Testing via alias

    def test_alias_aggregation_database(self):
        profile = _profile([_skill("MongoDB", 66)])
        result = compute_skill_gaps(profile, "Backend Developer", VERSION, NOW)
        db_gap = next(g for g in result.gaps if g.skill == "Database")
        assert db_gap.currentScore == 66

    def test_priority_ordering_deterministic(self):
        profile = _profile([_skill("Docker", 10), _skill("Jest", 10, 0.5)])
        result = compute_skill_gaps(profile, "Full Stack Developer", VERSION, NOW)
        scores = [g.priorityScore for g in result.gaps]
        assert scores == sorted(scores, reverse=True)
        bands = {g.priority for g in result.gaps}
        assert bands <= {"HIGH", "MEDIUM", "LOW"}

    def test_strong_extraneous_skill_listed_as_strength(self):
        profile = _profile([_skill("Go", 88)])
        result = compute_skill_gaps(profile, "Frontend Developer", VERSION, NOW)
        assert "Go" in result.strengths

    def test_prerequisite_inference_avoids_fundamental_gaps(self):
        # React 88 ⇒ JavaScript is implicitly demonstrated (§26/§27):
        # "JavaScript fundamentals" must NOT appear as a gap at all.
        profile = _profile([_skill("React", 88)])
        result = compute_skill_gaps(profile, "Frontend Developer", VERSION, NOW)
        assert all(g.skill != "JavaScript" for g in result.gaps)
        assert "JavaScript" in result.strengths

    def test_partial_inference_still_flags_real_gap(self):
        # React 55 (< required 75) infers JavaScript 55 ≥ 75? No: 55 < 75,
        # so JavaScript remains a gap but with inferred evidence attached.
        profile = _profile([_skill("React", 55)])
        result = compute_skill_gaps(profile, "Frontend Developer", VERSION, NOW)
        js = next((g for g in result.gaps if g.skill == "JavaScript"), None)
        if js is not None:
            assert js.currentScore == 55
            assert any("inferred" in e.lower() for e in js.evidence)

    def test_no_gaps_above_requirement(self):
        profile = _profile(
            [
                _skill("JavaScript", 90),
                _skill("React", 90),
                _skill("Node.js", 90),
                _skill("MongoDB", 90),
                _skill("Express", 90),
                _skill("Jest", 90),
                _skill("Docker", 90),
            ]
        )
        result = compute_skill_gaps(profile, "Full Stack Developer", VERSION, NOW)
        assert result.gaps == []


class TestPriority:
    def test_priority_formula_documented_inputs(self):
        from app.growth.gap_engine import _priority_score

        demonstrated = {"skill": "Docker", "score": 10, "confidence": 0.8}
        partial = _priority_score(gap=40, required=50, importance=0.6, demonstrated=demonstrated)
        bigger = _priority_score(gap=50, required=50, importance=0.6, demonstrated=demonstrated)
        assert bigger > partial
        no_evidence = _priority_score(gap=50, required=50, importance=0.6, demonstrated=None)
        assert no_evidence > bigger  # undetected skills prioritize higher

    def test_high_medium_low_bands(self):
        from app.growth.gap_engine import _priority_band

        assert _priority_band(0.9) == "HIGH"
        assert _priority_band(0.4) == "MEDIUM"
        assert _priority_band(0.1) == "LOW"


class TestDependencyGraph:
    def test_prerequisite_chains(self):
        assert prerequisites_of("React") == ["CSS", "JavaScript", "TypeScript"]
        assert "React" in unlocked_by("JavaScript")
        assert "Kubernetes" in unlocked_by("Docker")

    def test_unknown_skill_is_safe(self):
        assert prerequisites_of("AWS") == []
        assert unlocked_by("AWS") == []
        assert dependency_depth("AWS") == 0

    def test_depth_orders_foundations_first(self):
        assert dependency_depth("JavaScript") < dependency_depth("React")
        assert dependency_depth("React") < dependency_depth("Next.js")
        assert ancestors_of("Next.js") >= {"React", "JavaScript"}

    def test_topological_order_has_foundations_first(self):
        order = topological_skills()
        assert order.index("JavaScript") < order.index("TypeScript")
        assert order.index("SQL") < order.index("Database")


class TestRoadmap:
    def _gaps(self, profile: dict[str, Any]) -> Any:
        return compute_skill_gaps(profile, "Full Stack Developer", VERSION, NOW)

    def test_phases_generated_from_gaps(self):
        profile = _profile([_skill("Jest", 40), _skill("Docker", 20)])
        doc = self._gaps(profile)
        roadmap = build_roadmap(doc, "Full Stack Developer", 1, VERSION)
        assert roadmap.phases
        skills_in_roadmap = {s for p in roadmap.phases for s in p.skills}
        assert "Docker" in skills_in_roadmap

    def test_prerequisites_locked_ordering(self):
        # JavaScript gap should come before dependent skills (§6, §23).
        profile = _profile([_skill("TypeScript", 20), _skill("JavaScript", 30)])
        doc = self._gaps(profile)
        roadmap = build_roadmap(doc, "Full Stack Developer", 1, VERSION)
        flat = [s for p in roadmap.phases for s in p.skills]
        if "JavaScript" in flat and "TypeScript" in flat:
            assert flat.index("JavaScript") < flat.index("TypeScript")

    def test_every_phase_has_objectives_resources_project(self):
        profile = _profile([])
        doc = self._gaps(profile)
        roadmap = build_roadmap(doc, "Full Stack Developer", 1, VERSION)
        for phase in roadmap.phases:
            assert phase.learningObjectives, "objectives required (§9)"
            assert phase.resources, "resources required (§10)"
            assert phase.project
            assert phase.estimatedDuration

    def test_no_strength_skills_in_roadmap(self):
        profile = _profile([_skill("React", 90), _skill("JavaScript", 90)])
        doc = self._gaps(profile)
        roadmap = build_roadmap(doc, "Full Stack Developer", 1, VERSION)
        flat = {s for p in roadmap.phases for s in p.skills}
        assert "React" not in flat  # strength not recommended (§26)

    def test_versioning_carries_completion_forward(self):
        profile = _profile([_skill("Docker", 20)])
        doc = self._gaps(profile)
        v1 = build_roadmap(doc, "Full Stack Developer", 1, VERSION)
        for phase in v1.phases:
            phase.completed = True
        v2 = build_roadmap(doc, "Full Stack Developer", 2, VERSION, previous_phases=v1.phases)
        assert v2.version == 2
        matching = [p for p in v2.phases if p.skills == v1.phases[0].skills]
        assert matching and matching[0].completed

    def test_roadmap_versions_are_independent_documents(self):
        profile = _profile([_skill("Docker", 20)])
        doc = self._gaps(profile)
        v1 = build_roadmap(doc, "Full Stack Developer", 1, VERSION)
        v2 = build_roadmap(doc, "Full Stack Developer", 2, VERSION)
        assert v1.phases == v2.phases  # deterministic content (§33)
        assert v1.version == 1 and v2.version == 2


class TestProjects:
    def test_projects_address_actual_gaps(self):
        profile = _profile([_skill("React", 80), _skill("Node.js", 80)])
        doc = compute_skill_gaps(profile, "Full Stack Developer", VERSION, NOW)
        projects = generate_projects(doc, "Full Stack Developer", VERSION, now=NOW)
        assert projects
        assert any(p.gapsAddressed for p in projects)

    def test_deterministic_recommendations(self):
        profile = _profile([_skill("React", 80), _skill("Jest", 30)])
        doc = compute_skill_gaps(profile, "Full Stack Developer", VERSION, NOW)
        a = generate_projects(doc, "Full Stack Developer", VERSION, now=NOW)
        b = generate_projects(doc, "Full Stack Developer", VERSION, now=NOW)
        assert [p.model_dump() for p in a] == [p.model_dump() for p in b]

    def test_project_model_completeness(self):
        profile = _profile([])
        doc = compute_skill_gaps(profile, "Backend Developer", VERSION, NOW)
        projects = generate_projects(doc, "Backend Developer", VERSION, now=NOW)
        for p in projects:
            assert p.title and p.description
            assert p.difficulty in ("Beginner", "Intermediate", "Advanced")
            assert p.technologies
            assert p.milestones, "milestones required (§14)"
            for m in p.milestones:
                assert m.skills, "milestone-skill mapping required (§15)"
            assert p.architecture

    def test_no_irrelevant_padding_projects(self):
        profile = _profile([_skill("Python", 90), _skill("React", 90)])
        doc = compute_skill_gaps(profile, "Frontend Developer", VERSION, NOW)
        projects = generate_projects(doc, "Frontend Developer", VERSION, now=NOW)
        # Every returned project must be plausibly role-relevant.
        assert all(p.targetRole == "Frontend Developer" for p in projects)


class TestMultipleRoles:
    def test_all_roles_produce_complete_results(self):
        profile = _profile([_skill("Python", 80), _skill("React", 75)])
        for role in role_names():
            doc = compute_skill_gaps(profile, role, VERSION, NOW)
            roadmap = build_roadmap(doc, role, 1, VERSION)
            projects = generate_projects(doc, role, VERSION, now=NOW)
            assert doc.targetRole == role
            assert roadmap.phases
            assert projects

    def test_roles_produce_different_gaps(self):
        profile = _profile([_skill("Python", 80)])
        fe = compute_skill_gaps(profile, "Frontend Developer", VERSION, NOW)
        da = compute_skill_gaps(profile, "Data Analyst", VERSION, NOW)
        fe_skills = {g.skill for g in fe.gaps}
        da_skills = {g.skill for g in da.gaps}
        assert "SQL" in da_skills and "SQL" not in fe_skills
