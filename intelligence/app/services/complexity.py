"""Repository intelligence: health and complexity scoring.

Complexity is an additive model over observable repository traits
(technologies, infrastructure files, auth, async, real-time, databases).
Health blends documentation, testing, maintainability, activity, and
complexity — each sub-score is derived from measurable inputs and the
result carries the reasons so the UI can explain it.
"""

from __future__ import annotations

import asyncio

from ..api.models.schemas import RepositoryAnalysis, RepositoryAnalysisRequest
from ..scoring.normalize import clamp, log_scale, weighted_average

# Technology families that indicate architectural sophistication.
FRONTEND_STACK = {"react", "next.js", "vue", "angular", "svelte", "tailwind", "html", "css"}
BACKEND_STACK = {"node.js", "express", "fastapi", "django", "flask", "spring boot"}
DATABASES = {"mongodb", "postgresql", "mysql", "sqlite", "redis"}
INFRA = {"docker", "kubernetes", "github actions", "ci/cd", "terraform"}
REALTIME = {"socket.io", "websockets", "graphql subscriptions"}

# Signals searched in the technology list (lowercased matching).
AUTH_SIGNALS = {"jwt", "oauth", "auth0", "passport", "nextauth", "sessions"}
ASYNC_SIGNALS = {"celery", "bull", "rabbitmq", "kafka", "queues"}


def _tech_set(technologies: list[str]) -> set[str]:
    return {t.strip().lower() for t in technologies if t.strip()}


def documentation_score(req: RepositoryAnalysisRequest) -> tuple[int, list[str]]:
    """Docs score from README + in-repo docs conventions (0-100)."""
    reasons: list[str] = []
    score = 0.0
    if req.has_docs:
        score += 55
        reasons.append("README / documentation present")
    else:
        reasons.append("No README or docs detected")

    # Description quality proxy: repository has meaningful size and naming.
    if req.name and not req.name.startswith("test"):
        score += 15
    if req.technologies:
        score += min(15, 3 * len(req.technologies))
        reasons.append(f"{len(req.technologies)} declared technologies")
    if req.has_ci:
        score += 15
        reasons.append("CI configuration present")
    return clamp(score), reasons


def testing_score(req: RepositoryAnalysisRequest) -> tuple[int, list[str]]:
    """Testing score from test presence, CI, and stack maturity proxies."""
    reasons: list[str] = []
    score = 0.0
    if req.has_tests:
        score += 55
        reasons.append("Test files detected")
    else:
        reasons.append("No tests detected")
    if req.has_ci:
        score += 25
        reasons.append("CI runs available")
    # Slightly reward projects large enough that tests are meaningful.
    if req.file_count >= 25:
        score += 10
    elif req.file_count > 0:
        score += 5
    if req.technologies and any(
        t in _tech_set(req.technologies) for t in ("pytest", "jest", "cypress", "playwright")
    ):
        score += 10
        reasons.append("Testing framework in tech list")
    return clamp(score), reasons


def maintainability_score(req: RepositoryAnalysisRequest) -> tuple[int, list[str]]:
    """Maintainability proxy: repo size vs file count (avg file size), CI, docs."""
    reasons: list[str] = []
    avg_file_kb = req.size_kb / req.file_count if req.file_count else 0
    score = 50.0
    if req.file_count == 0:
        reasons.append("No source files — neutral score")
        return clamp(50), reasons

    if avg_file_kb <= 8:
        score += 25
        reasons.append(f"Healthy average file size ({avg_file_kb:.1f} KB)")
    elif avg_file_kb <= 20:
        score += 10
        reasons.append(f"Average file size {avg_file_kb:.1f} KB")
    else:
        score -= 15
        reasons.append(f"Large average file size ({avg_file_kb:.1f} KB)")

    if req.has_docs:
        score += 10
    if req.has_ci:
        score += 10
        reasons.append("CI enabled")
    # Very small repos score lower on maintainability confidence.
    if req.file_count < 5:
        score -= 10
        reasons.append("Very few files — limited signal")
    return clamp(score), reasons


def activity_score(req: RepositoryAnalysisRequest) -> tuple[int, list[str]]:
    """Activity from commit count and stars (log-scaled, deterministic)."""
    reasons: list[str] = []
    commit_pts = log_scale(req.commit_count, k=1.0, midpoint=200)
    star_pts = log_scale(req.stars, k=1.0, midpoint=50)
    score = 0.7 * commit_pts + 0.3 * star_pts
    if req.commit_count > 0:
        reasons.append(f"{req.commit_count} commits")
    if req.stars > 0:
        reasons.append(f"{req.stars} stars")
    if req.commit_count == 0:
        reasons.append("No commit data")
    return clamp(score), reasons


def complexity_score(req: RepositoryAnalysisRequest) -> tuple[int, list[str]]:
    """Project complexity from additive, observable architecture signals."""
    techs = _tech_set(req.technologies)
    reasons: list[str] = []

    points = 0.0
    if techs & FRONTEND_STACK:
        points += 12
        reasons.append("Frontend stack present")
    if techs & BACKEND_STACK:
        points += 12
        reasons.append("Backend framework present")
    if techs & DATABASES:
        points += 10
        reasons.append("Database integration")
    if techs & AUTH_SIGNALS:
        points += 10
        reasons.append("Authentication mechanism")
    if techs & REALTIME:
        points += 10
        reasons.append("Real-time communication")
    if techs & ASYNC_SIGNALS:
        points += 8
        reasons.append("Asynchronous processing")
    if req.has_docker or (techs & INFRA):
        points += 12
        reasons.append("Deployment configuration (Docker/infra)")
    if req.has_ci:
        points += 8
        reasons.append("CI/CD pipeline")
    # Multi-technology breadth
    breadth = min(18, 2 * len(techs))
    points += breadth
    reasons.append(f"{len(techs)} distinct technologies")

    return clamp(points), reasons


def analyze_repository(
    req: RepositoryAnalysisRequest,
) -> RepositoryAnalysis:
    """Compute the full repository intelligence report (deterministic)."""
    docs, docs_why = documentation_score(req)
    tests, tests_why = testing_score(req)
    maintain, _ = maintainability_score(req)
    activity, _ = activity_score(req)
    cx, cx_reasons = complexity_score(req)

    health = weighted_average(
        [
            (docs, 0.20),
            (tests, 0.20),
            (maintain, 0.25),
            (activity, 0.20),
            (cx, 0.15),
        ]
    )

    notes: list[str] = []
    if req.file_count == 0:
        notes.append(
            "No file-level data available yet — sync repository contents for deeper analysis."
        )
    if not req.has_tests:
        notes.append("Adding tests would raise both the testing and maintainability scores.")
    if not req.has_docs:
        notes.append("A README with setup instructions would lift the documentation score.")

    return RepositoryAnalysis(
        repository_id=req.repository_id,
        name=req.name,
        documentation_score=docs,
        testing_score=tests,
        maintainability_score=maintain,
        complexity_score=cx,
        activity_score=activity,
        health_score=clamp(health),
        complexity_reasons=cx_reasons,
        notes=notes,
    )


async def analyze_repository_async(req: RepositoryAnalysisRequest) -> RepositoryAnalysis:
    """Async wrapper so FastAPI endpoints stay async (CPU work is trivial)."""
    return await asyncio.to_thread(analyze_repository, req)
