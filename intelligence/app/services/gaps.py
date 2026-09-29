"""Skill-gap engine: current skills vs. a target role's requirements."""

from __future__ import annotations

from ..api.models.schemas import ScoredSkill, SkillGap, SkillGapsRequest, SkillGapsResult

# Required skills per target role: skill -> (target level, importance)
ROLE_REQUIREMENTS: dict[str, dict[str, tuple[int, str]]] = {
    "Full Stack Developer": {
        "React": (75, "critical"),
        "Node.js": (75, "critical"),
        "TypeScript": (70, "important"),
        "MongoDB": (65, "important"),
        "Express": (65, "important"),
        "Testing": (65, "critical"),
        "Docker": (60, "important"),
        "CI/CD": (60, "important"),
        "System Design": (65, "critical"),
        "PostgreSQL": (60, "nice_to_have"),
    },
    "Python Developer": {
        "Python": (85, "critical"),
        "FastAPI": (70, "important"),
        "Django": (60, "nice_to_have"),
        "PostgreSQL": (65, "important"),
        "Pytest": (65, "important"),
        "Docker": (60, "important"),
        "System Design": (60, "important"),
    },
    "Backend Developer": {
        "Node.js": (80, "critical"),
        "Express": (70, "important"),
        "MongoDB": (70, "important"),
        "PostgreSQL": (65, "important"),
        "Redis": (60, "nice_to_have"),
        "Docker": (65, "important"),
        "System Design": (70, "critical"),
        "Testing": (65, "important"),
    },
    "Frontend Developer": {
        "React": (85, "critical"),
        "TypeScript": (75, "critical"),
        "CSS": (70, "important"),
        "HTML": (70, "important"),
        "Next.js": (70, "important"),
        "Tailwind": (65, "nice_to_have"),
        "Testing": (60, "important"),
    },
    "Software Engineer": {
        "System Design": (70, "critical"),
        "Testing": (65, "critical"),
        "Docker": (60, "important"),
        "CI/CD": (60, "important"),
        "Python": (65, "important"),
        "JavaScript": (65, "important"),
    },
    "Data Analyst": {
        "Python": (80, "critical"),
        "SQL": (75, "critical"),
        "Pandas": (70, "important"),
        "PostgreSQL": (65, "important"),
        "Data Visualization": (65, "important"),
        "Statistics": (60, "important"),
    },
    "AI/ML Engineer": {
        "Python": (85, "critical"),
        "Machine Learning": (75, "critical"),
        "Pandas": (70, "important"),
        "NumPy": (70, "important"),
        "Pytest": (60, "important"),
        "Docker": (60, "important"),
        "System Design": (65, "important"),
    },
    "DevOps Engineer": {
        "Docker": (80, "critical"),
        "Kubernetes": (70, "critical"),
        "CI/CD": (75, "critical"),
        "GitHub Actions": (70, "important"),
        "AWS": (65, "important"),
        "Linux": (65, "important"),
        "System Design": (60, "important"),
    },
}

DEFAULT_ROLE = "Software Engineer"

# Skills tracked for gaps but inferred indirectly rather than from a
# language byte-share (testing/infra/system-design style skills).
INFERRED_SKILLS: dict[str, str] = {
    "Testing": "test suites and CI configuration across repositories",
    "CI/CD": "pipeline configuration detected in repositories",
    "System Design": "average architectural complexity of repositories",
    "SQL": "relational database usage detected in repositories",
    "Data Visualization": "charting/visualization libraries detected",
    "Machine Learning": "ML framework usage detected in repositories",
    "Pandas": "data-processing library usage detected",
    "NumPy": "numerical computing usage detected",
    "Linux": "shell/system scripting detected in repositories",
}


def _current_level(skill: str, skills: list[ScoredSkill]) -> ScoredSkill | None:
    wanted = skill.lower()
    for s in skills:
        if s.skill.lower() == wanted:
            return s
    return None


def compute_gaps(payload: SkillGapsRequest) -> SkillGapsResult:
    """Compute per-skill gaps for a target role. Missing skills count as 0."""
    role_key = payload.target_role.strip()
    requirements = ROLE_REQUIREMENTS.get(role_key, ROLE_REQUIREMENTS[DEFAULT_ROLE])
    effective_role = role_key if role_key in ROLE_REQUIREMENTS else DEFAULT_ROLE

    gaps: list[SkillGap] = []
    matched: set[str] = set()

    for skill, (target, importance) in requirements.items():
        current = _current_level(skill, payload.skills)
        current_level = current.score if current else 0
        gap = max(0, target - current_level)
        gaps.append(
            SkillGap(
                skill=skill,
                current_level=current_level,
                target_level=min(100, target),
                gap=gap,
                importance=importance,
            )
        )
        if current:
            matched.add(skill)

    # Sort: biggest, most critical gaps first — drives the roadmap order.
    priority = {"critical": 0, "important": 1, "nice_to_have": 2}
    gaps.sort(key=lambda g: (-priority[g.importance], -g.gap, g.skill))

    strengths = sorted(payload.skills, key=lambda s: -s.score)[:5]

    return SkillGapsResult(
        target_role=effective_role,
        gaps=gaps,
        strengths=strengths,
    )
