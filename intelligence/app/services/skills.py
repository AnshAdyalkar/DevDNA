"""Skill scoring and Developer DNA generation.

Design rules (see docs/dna-algorithm.md):
- No random scores. Every number derives from measurable signals.
- Every score ships with human-readable evidence.
- DNA dimensions aggregate skill scores with transparent weights.
"""

from __future__ import annotations

from ..api.models.schemas import (
    DnaDimension,
    DnaRequest,
    DnaResult,
    RepositoryAnalysisRequest,
    ScoredSkill,
    SkillProfile,
    SkillProfileRequest,
)
from ..scoring.categories import dimension_for
from ..scoring.normalize import clamp, log_scale, share_of, weighted_average

# ---------------------------------------------------------------------------
# Known technology vocabulary (matched case-insensitively)
# ---------------------------------------------------------------------------

FRAMEWORK_HINTS: dict[str, list[str]] = {
    "React": ["react", "next.js", "jsx", "tsx"],
    "Next.js": ["next.js", "nextjs"],
    "Vue": ["vue", "nuxt"],
    "Angular": ["angular"],
    "Node.js": ["node.js", "express", "npm", "nodejs"],
    "Express": ["express"],
    "FastAPI": ["fastapi"],
    "Django": ["django"],
    "Flask": ["flask"],
    "Spring Boot": ["spring boot", "springboot"],
    "MongoDB": ["mongodb", "mongoose", "mongo"],
    "PostgreSQL": ["postgresql", "postgres"],
    "MySQL": ["mysql"],
    "SQLite": ["sqlite"],
    "Redis": ["redis"],
    "Docker": ["docker"],
    "Kubernetes": ["kubernetes", "k8s"],
    "GitHub Actions": ["github actions", "ci"],
    "Tailwind": ["tailwind"],
    "Jest": ["jest"],
    "Pytest": ["pytest"],
}

TEST_FRAMEWORKS = {"jest", "pytest", "junit", "cypress", "playwright"}
DOC_HINTS = {"readme", "docs"}


def _norm(technologies: list[str]) -> set[str]:
    return {t.strip().lower() for t in technologies if t.strip()}


def _detect_frameworks(repo: RepositoryAnalysisRequest) -> list[str]:
    techs = _norm(repo.technologies)
    found: list[str] = []
    for framework, hints in FRAMEWORK_HINTS.items():
        if any(h in techs for h in hints):
            found.append(framework)
    return found


def score_language_skill(
    language: str,
    *,
    language_bytes: dict[str, int],
    repos: list[RepositoryAnalysisRequest],
    total_bytes: int,
) -> ScoredSkill:
    """Score one programming language from measurable repository signals."""
    evidence: list[str] = []
    lang_lower = language.lower()

    repo_count = sum(1 for r in repos if lang_lower in {name.lower() for name in r.languages})
    usage_bytes = language_bytes.get(language, 0) or language_bytes.get(lang_lower, 0)
    usage_share = share_of(usage_bytes, total_bytes)

    # --- components -------------------------------------------------------
    usage_pts = 45.0 * usage_share  # dominant factor: how much of the codebase
    repo_pts = 25.0 * (log_scale(repo_count, k=1.0, midpoint=6) / 100)

    framework_count = 0
    framework_pts = 0.0
    complexity_pts = 0.0
    test_pts = 0.0

    lang_repos = [r for r in repos if lang_lower in {name.lower() for name in r.languages}]
    for r in lang_repos:
        frameworks = [
            f for f in _detect_frameworks(r) if dimension_for(f) in ("frontend", "backend")
        ]
        if frameworks:
            framework_count += len(frameworks)
        if r.has_tests:
            test_pts += 4
        if r.file_count >= 15:
            complexity_pts += 3

    framework_pts = min(15.0, 5.0 * framework_count)
    complexity_pts = min(10.0, complexity_pts)
    test_pts = min(5.0, test_pts)

    score = usage_pts + repo_pts + framework_pts + complexity_pts + test_pts

    # --- evidence ---------------------------------------------------------
    if repo_count:
        evidence.append(f"{repo_count} repositor{'y' if repo_count == 1 else 'ies'}")
    if usage_bytes:
        evidence.append(f"{usage_share * 100:.0f}% of measured codebase")
    for r in lang_repos:
        for f in _detect_frameworks(r):
            if dimension_for(f) in ("frontend", "backend") and f not in evidence:
                evidence.append(f"{f} project detected")
    if test_pts:
        evidence.append("tests present in language repos")

    confidence = min(0.95, 0.35 + 0.4 * usage_share + 0.05 * repo_count)

    return ScoredSkill(
        skill=language,
        score=clamp(score),
        confidence=round(confidence, 2),
        evidence=evidence or ["insufficient data"],
    )


def score_technology_skill(
    technology: str,
    *,
    repos: list[RepositoryAnalysisRequest],
) -> ScoredSkill | None:
    """Score a framework/infra technology from adoption breadth and depth."""
    tech_lower = technology.lower()
    adopting = [r for r in repos if tech_lower in _norm(r.technologies)]
    if not adopting:
        return None

    evidence: list[str] = []
    repo_count = len(adopting)
    depth = 0.0
    for r in adopting:
        depth += 20 if r.file_count >= 15 else 10
        if r.has_tests:
            depth += 5
        if r.has_docs:
            depth += 5

    score = min(85.0, 25.0 + 15.0 * (repo_count - 1) + depth / max(1, repo_count))
    if repo_count == 1:
        score = min(score, 55.0)  # single-repo usage never implies expertise
        evidence.append("used in 1 repository (exploratory)")
    else:
        evidence.append(f"used in {repo_count} repositories")
    if any(r.has_tests for r in adopting):
        evidence.append("tested usage detected")

    confidence = min(0.9, 0.4 + 0.15 * repo_count)
    return ScoredSkill(
        skill=technology,
        score=clamp(score),
        confidence=round(confidence, 2),
        evidence=evidence,
    )


def build_skill_profile(payload: SkillProfileRequest) -> SkillProfile:
    """Build the full evidence-backed skill profile."""
    skills: list[ScoredSkill] = []
    total_bytes = sum(payload.languages.values())

    for language in sorted(payload.languages, key=lambda lang: -payload.languages[lang]):
        skills.append(
            score_language_skill(
                language,
                language_bytes=payload.languages,
                repos=payload.repositories,
                total_bytes=total_bytes,
            )
        )

    # Technologies not already covered as a language
    seen = {s.skill.lower() for s in skills}
    for tech in sorted(set(payload.technologies)):
        if tech.lower() in seen:
            continue
        scored = score_technology_skill(tech, repos=payload.repositories)
        if scored:
            skills.append(scored)
            seen.add(tech.lower())

    skills.sort(key=lambda s: -s.score)
    return SkillProfile(skills=skills)


# ---------------------------------------------------------------------------
# Developer DNA aggregation
# ---------------------------------------------------------------------------

DIMENSION_WEIGHTS: dict[str, float] = {
    "languages": 0.30,
    "frontend": 0.15,
    "backend": 0.15,
    "database": 0.10,
    "devops": 0.08,
    "testing": 0.12,
    "other": 0.10,
}


def _dimension_score(dimension: str, skills: list[ScoredSkill]) -> tuple[int, list[str]] | None:
    """Weighted aggregate of skill scores for one dimension."""
    members = [s for s in skills if dimension_for(s.skill) == dimension]
    if not members:
        return None
    parts = [(float(s.score), s.confidence) for s in members]
    score = weighted_average(parts)
    evidence = [
        f"{s.skill} {s.score} (confidence {s.confidence:.2f})"
        for s in sorted(members, key=lambda x: -x.score)[:3]
    ]
    return clamp(score), evidence


async def compute_dna(payload: DnaRequest) -> DnaResult:
    """Aggregate skills, behavior, and repository health into Developer DNA."""
    dimensions: list[DnaDimension] = []

    for dimension in ("languages", "frontend", "backend", "database", "devops", "testing"):
        result = _dimension_score(dimension, payload.skills)
        if result:
            score, evidence = result
            dimensions.append(DnaDimension(dimension=dimension, score=score, evidence=evidence))

    # Behavior-derived dimensions
    if payload.behavior and payload.behavior.total_commits > 0:
        b = payload.behavior
        dimensions.append(
            DnaDimension(
                dimension="consistency",
                score=b.consistency_score,
                evidence=b.consistency_breakdown[:4],
            )
        )
        problem_solving = 40
        if b.active_months:
            problem_solving = clamp(
                40
                + 30 * log_scale(b.total_commits, k=1.0, midpoint=500) / 100
                + 30 * (b.active_weeks / (b.active_months * 4))
            )
        dimensions.append(
            DnaDimension(
                dimension="problem_solving",
                score=problem_solving,
                evidence=[
                    f"{b.total_commits} commits across {b.active_months} months",
                    f"longest active streak {b.longest_active_streak_days} days",
                ],
            )
        )

    if payload.repositories:
        avg_health = sum(r.health_score for r in payload.repositories) / len(payload.repositories)
        avg_cx = sum(r.complexity_score for r in payload.repositories) / len(payload.repositories)
        dimensions.append(
            DnaDimension(
                dimension="project_complexity",
                score=clamp(avg_cx),
                evidence=[f"average across {len(payload.repositories)} repositories"],
            )
        )
        dimensions.append(
            DnaDimension(
                dimension="project_health",
                score=clamp(avg_health),
                evidence=[f"average across {len(payload.repositories)} repositories"],
            )
        )

    # Overall = weighted dimensions (weights renormalized over present ones)
    parts: list[tuple[float, float]] = []
    for d in dimensions:
        weight = DIMENSION_WEIGHTS.get(d.dimension, 0.08)
        parts.append((float(d.score), weight))
    overall = clamp(weighted_average(parts))

    return DnaResult(
        overall=overall,
        dimensions=dimensions,
        methodology=(
            "Each dimension is a confidence-weighted average of its measured skill scores; "
            "consistency and problem-solving derive from commit history; project metrics "
            "average repository-level analysis. Overall is the weighted aggregate of all "
            "present dimensions. Every input is observable repository data — no sampling, "
            "no randomness."
        ),
    )
