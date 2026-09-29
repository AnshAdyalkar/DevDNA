"""Project recommendations driven by detected skill gaps.

Every recommendation must reference the user's measured profile —
never generic tutorial advice. Projects are chosen because they
develop specific skills the gap engine flagged.
"""

from __future__ import annotations

from ..api.models.schemas import RecommendationRequest, RecommendationResult, RecommendedProject

# Project blueprints: skills each project genuinely develops.
PROJECT_BLUEPRINTS: list[RecommendedProject] = [
    RecommendedProject(
        title="Distributed Event Monitoring Platform",
        description=(
            "Ingest events from webhooks and agents into a queue, process them with "
            "background workers, store raw and aggregated views, and visualize live "
            "streams in a dashboard with alerting."
        ),
        develops=["Node.js", "Redis", "Docker", "System Design", "Testing", "WebSockets"],
        why_now=(
            "Builds queueing and observability fundamentals that backend and DevOps gaps point to."
        ),
        estimated_difficulty="advanced",
    ),
    RecommendedProject(
        title="Multi-Tenant SaaS Starter",
        description=(
            "Full-stack SaaS boilerplate with organization accounts, role-based access, "
            "billing hooks, transactional email, and a CI pipeline that runs tests on PRs."
        ),
        develops=["React", "Node.js", "PostgreSQL", "Docker", "CI/CD", "Testing", "System Design"],
        why_now="Directly exercises the production-engineering skills your target role expects.",
        estimated_difficulty="advanced",
    ),
    RecommendedProject(
        title="Test-First CLI Toolkit",
        description=(
            "A published CLI tool built test-first: unit tests for every command, "
            "integration tests against a sandbox, and coverage reporting in CI."
        ),
        develops=["Testing", "Python", "CI/CD", "Node.js"],
        why_now=(
            "The fastest, lowest-risk way to raise a weak testing score "
            "while reinforcing your strongest language."
        ),
        estimated_difficulty="beginner",
    ),
    RecommendedProject(
        title="Realtime Collaboration Board",
        description=(
            "Kanban board with live multi-user updates via WebSockets, optimistic UI, "
            "conflict handling, and per-board authorization."
        ),
        develops=["React", "WebSockets", "Node.js", "MongoDB", "Testing"],
        why_now="Combines your frontend strength with real-time architecture practice.",
        estimated_difficulty="intermediate",
    ),
    RecommendedProject(
        title="Data Pipeline & Analytics API",
        description=(
            "Scheduled ingestion jobs, transformation pipeline with pandas, a query API "
            "with pagination and caching, and export endpoints."
        ),
        develops=["Python", "Pandas", "PostgreSQL", "Docker", "System Design"],
        why_now="Develops the data-handling depth expected for data-oriented roles.",
        estimated_difficulty="intermediate",
    ),
    RecommendedProject(
        title="Containerized Microservices Demo",
        description=(
            "Two small services plus an API gateway, docker-compose orchestration, health "
            "checks, structured logging, and a GitHub Actions deploy workflow."
        ),
        develops=["Docker", "CI/CD", "System Design", "Node.js", "Python"],
        why_now=(
            "Closes DevOps gaps with hands-on orchestration instead of tutorial-level exposure."
        ),
        estimated_difficulty="intermediate",
    ),
]


def _gap_set(payload: RecommendationRequest) -> dict[str, int]:
    return {g.skill.lower(): g.gap for g in payload.gaps}


def recommend(payload: RecommendationRequest) -> RecommendationResult:
    """Rank projects by how many detected gaps they close (deterministic)."""
    gaps = _gap_set(payload)
    current = {s.skill.lower(): s.score for s in payload.skills}

    ranked: list[tuple[int, int, RecommendedProject]] = []
    for project in PROJECT_BLUEPRINTS:
        overlap = [
            skill
            for skill in project.develops
            if skill.lower() in gaps and gaps[skill.lower()] >= 15
        ]
        strong_skills = sum(1 for skill in project.develops if current.get(skill.lower(), 0) >= 70)
        # Primary sort: number of gaps closed; tiebreak: leverage existing strengths.
        # sorted() is stable, so equal entries keep the curated blueprint order.
        ranked.append((-len(overlap), -strong_skills, project))

    ranked.sort(key=lambda item: (item[0], item[1]))
    projects = [p for _, _, p in ranked[:4]]

    return RecommendationResult(projects=projects)
