"""Developer DNA engine (§15, §19).

Aggregates per-repository analyses into the developer-level profile:
skills (evidence-backed), language distribution, project types, behavior
summary, and engineering-practice rollups. Only evidence-supported skills
are emitted — absence of data never becomes a zero (§29, §37).
"""

from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime

from ..analyzers.behavior_analyzer import analyze_behavior
from ..models.analysis_models import (
    BehaviorSummary,
    DeveloperProfileDocument,
    LanguageShare,
    ProjectPattern,
    RepositoryAnalysisDocument,
    SkillWithEvidence,
)
from .scoring import confidence_band, score_skill


def _language_share_map(repo_languages: list[list[LanguageShare]]) -> dict[str, float]:
    """Developer-level language percentages from per-repo shares."""
    totals: Counter[str] = Counter()
    for shares in repo_languages:
        for share in shares:
            totals[share.name] += share.bytes
    grand = sum(totals.values())
    if grand <= 0:
        return {}
    return {name: 100.0 * value / grand for name, value in totals.items()}


def build_developer_profile(
    *,
    user_id: str,
    analyses: list[RepositoryAnalysisDocument],
    commits: list[dict[str, str]],
    analysis_version: str,
) -> DeveloperProfileDocument | None:
    """Assemble the DeveloperProfile. Returns None when there is nothing to
    analyze (§29 — no fake intelligence for empty data)."""
    if not analyses:
        return None
    now = datetime.now(UTC)

    # ── Language distribution ──────────────────────────────────────────
    lang_map = _language_share_map([a.languages for a in analyses])
    primary_languages: list[LanguageShare] = []
    grand = sum(lang_map.values())
    for name, pct in sorted(lang_map.items(), key=lambda kv: -kv[1]):
        primary_languages.append(
            LanguageShare(name=name, bytes=round(pct * grand / 100.0), percentage=round(pct, 1))
        )

    # ── Candidate skills: languages + technologies ─────────────────────
    tech_repos: Counter[str] = Counter()
    for a in analyses:
        for tech in a.technologies:
            tech_repos[tech] += 1

    skills: list[SkillWithEvidence] = []
    for language in lang_map:
        repos = [
            str(a.repositoryId)
            for a in analyses
            if any(s.name == language and s.percentage > 3 for s in a.languages)
        ]
        scored = score_skill(
            language,
            repo_ids=repos,
            all_language_shares=lang_map,
            analyses=analyses,
            now=now,
        )
        if scored:
            skills.append(scored)

    for tech, count in tech_repos.most_common():
        if any(s.skill.lower() == tech.lower() for s in skills):
            continue
        repos = [str(a.repositoryId) for a in analyses if tech in a.technologies]
        scored = score_skill(
            tech,
            repo_ids=repos,
            all_language_shares={},  # technologies have no byte share
            analyses=analyses,
            now=now,
        )
        if scored and count >= 1:
            skills.append(scored)

    skills.sort(key=lambda s: (-s.score, -s.confidence, s.skill))
    # §37: drop weak, low-confidence tail skills that would only decorate the UI
    skills = [s for s in skills if s.confidence >= 0.4]

    # ── Project types ──────────────────────────────────────────────────
    type_counter: Counter[str] = Counter()
    type_conf: dict[str, float] = {}
    for a in analyses:
        if a.projectType:
            type_counter[a.projectType.projectType] += 1
            type_conf[a.projectType.projectType] = max(
                type_conf.get(a.projectType.projectType, 0.0), a.projectType.confidence
            )
    project_types = [
        ProjectPattern(
            projectType=name,
            confidence=type_conf[name],
            evidence=[f"detected in {count} repositor{'y' if count == 1 else 'ies'}"],
        )
        for name, count in type_counter.most_common()
    ]

    # ── Behavior ───────────────────────────────────────────────────────
    behavior = analyze_behavior(
        commits, repositories_touched=len({str(a.repositoryId) for a in analyses})
    )

    # ── Engineering practices ──────────────────────────────────────────
    doc_scores = [
        a.documentation.documentationScore
        for a in analyses
        if a.documentation.documentationScore is not None
    ]
    test_scores = [a.testing.testingScore for a in analyses if a.testing.testingScore is not None]
    ci_count = sum(
        1 for a in analyses if "GitHub Actions" in a.technologies or "CI/CD" in a.technologies
    )
    docker_count = sum(1 for a in analyses if "Docker" in a.technologies)
    engineering = {
        "averageDocumentationScore": round(sum(doc_scores) / len(doc_scores))
        if doc_scores
        else None,
        "averageTestingScore": round(sum(test_scores) / len(test_scores)) if test_scores else None,
        "repositoriesWithCi": ci_count,
        "repositoriesWithDocker": docker_count,
        "readmeCoverage": round(
            100 * sum(1 for a in analyses if a.documentation.readmePresent) / len(analyses)
        ),
        "notes": (
            []
            if test_scores
            else ["No testing data available across repositories — testing practice not scored."]
        ),
    }

    summary = {
        "totalRepos": len(analyses),
        "originalRepos": sum(1 for a in analyses if not getattr(a, "isFork", False)),
        "forkedRepos": sum(1 for a in analyses if getattr(a, "isFork", False)),
        "archivedRepos": sum(1 for a in analyses if getattr(a, "isArchived", False)),
        "averageComplexity": round(
            sum(a.complexity.complexityScore for a in analyses) / len(analyses)
        ),
        "languagesDetected": len(primary_languages),
        "technologiesDetected": len(tech_repos),
        "totalCommits": behavior.totalCommits,
    }

    return DeveloperProfileDocument(
        userId=user_id,
        analysisVersion=analysis_version,
        analyzedAt=now.isoformat(),
        updatedAt=now.isoformat(),
        repositoriesAnalyzed=len(analyses),
        primaryLanguages=primary_languages,
        technologies=sorted(tech_repos),
        projectTypes=project_types,
        skills=skills,
        behavior=BehaviorSummary(
            observations=behavior.observations,
            metrics=behavior.model_dump(exclude={"observations"}),
        ),
        engineeringPractices=engineering,
        summaryMetrics=summary,
    )


__all__ = ["build_developer_profile", "confidence_band"]
