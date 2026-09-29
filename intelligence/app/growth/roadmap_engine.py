"""Roadmap generation engine (§7-§9, §26, §27).

Builds an ordered, phased learning roadmap from the user's actual gaps:
  - phases group 1-3 related gap skills
  - ordering is deterministic: priority score, then dependency depth (§6)
    so prerequisite skills are learned before the skills that need them
  - every phase carries measurable objectives, curated resources and a
    practice project — no generic "learn X" advice (§27)
"""

from __future__ import annotations

from datetime import UTC, datetime

from .dependency_graph import dependency_depth
from .models import (
    MAX_PHASES,
    MAX_SKILLS_PER_PHASE,
    ResourceRef,
    RoadmapDocument,
    RoadmapPhase,
    SkillGapEntry,
    SkillGapsDocument,
)
from .resources import resources_for

# Duration model: each skill block is roughly a week; phases carry 1-3.
_WEEKS_PER_SKILL = 1


def _duration_for(skill_count: int) -> str:
    weeks = max(1, skill_count * _WEEKS_PER_SKILL)
    if weeks == 1:
        return "1 week"
    return f"{weeks} weeks"


def _title_for(skills: list[str]) -> str:
    """Phase title from its skill set (deterministic, specific)."""
    if len(skills) == 1:
        return f"{skills[0]} fundamentals"
    head = ", ".join(skills[:-1])
    return f"{head} & {skills[-1]}"


def _objectives_for(skill: str) -> list[str]:
    """Measurable learning objectives (§9) — never vague (§27)."""
    catalog: dict[str, list[str]] = {
        "Testing": [
            "Write unit tests for the core module of an existing project",
            "Write API tests covering success and error paths",
            "Mock external services in tests",
            "Measure test coverage and raise it above 70%",
        ],
        "CI/CD": [
            "Add a CI workflow that runs lint and tests on every push",
            "Block merges when the pipeline fails",
            "Publish a build artifact from the pipeline",
        ],
        "Docker": [
            "Containerize an existing application with a Dockerfile",
            "Run the app and its database together with Docker Compose",
            "Reduce image size with multi-stage builds",
        ],
        "Docker & Kubernetes": [
            "Deploy a containerized app to a local Kubernetes cluster",
            "Define liveness and readiness probes",
        ],
        "Kubernetes": [
            "Deploy a containerized app to a local Kubernetes cluster",
            "Define liveness and readiness probes",
        ],
        "System Design": [
            "Write a one-page design doc for an existing project's architecture",
            "Design a schema for a read-heavy workload and justify indexes",
            "Add a caching layer and measure the latency change",
        ],
        "Database": [
            "Model the data of an existing project with explicit schemas",
            "Add indexes for the three hottest queries and verify with explain",
        ],
        "API Development": [
            "Design and document a versioned REST resource end-to-end",
            "Add validation, pagination and consistent error envelopes",
        ],
        "TypeScript": [
            "Migrate one JavaScript module to strict TypeScript",
            "Replace `any` in an existing codebase with precise types",
        ],
        "React": [
            "Build a data table with sorting, filtering and pagination",
            "Extract reusable hooks from duplicated component logic",
        ],
        "JavaScript": [
            "Rewrite one callback-based flow with async/await and error handling",
            "Add unit tests for array/object utilities you use most",
        ],
        "Redis": [
            "Add a Redis cache in front of one expensive query",
            "Set explicit TTLs and measure the cache hit ratio",
        ],
        "Python": [
            "Add type hints and mypy checks to one Python module",
            "Package a script into an installable CLI with tests",
        ],
        "SQL": [
            "Write joins and aggregations against a real dataset",
            "Explain and optimize a slow query",
        ],
        "Pandas": [
            "Load, clean and aggregate a real CSV dataset end-to-end",
            "Profile a dataset and document data-quality issues",
        ],
        "Machine Learning": [
            "Train a baseline model on a tabular dataset with a held-out split",
            "Report precision/recall and explain one failure mode",
        ],
        "Statistics": [
            "Compute and interpret confidence intervals on a real dataset",
            "Run one A/B-style comparison with a stated hypothesis",
        ],
        "GitHub Actions": [
            "Add a workflow that runs lint and tests on every push",
            "Cache dependencies between workflow runs",
        ],
        "Linux": [
            "Deploy an app to a Linux VM using only the shell",
            "Diagnose a slow process with standard Unix tools",
        ],
        "AWS": [
            "Deploy one service to a managed compute service",
            "Set up billing alerts and least-privilege access",
        ],
        "Next.js": [
            "Build a server-rendered page with data fetching",
            "Add client-side transitions between two routes",
        ],
        "HTML": ["Build an accessible form with semantic elements and labels"],
        "CSS": [
            "Build a responsive card grid without a CSS framework",
            "Implement dark mode with custom properties",
        ],
        "Data Visualization": [
            "Build an interactive chart from a real dataset",
            "Design a dashboard that answers one business question",
        ],
        "NumPy": [
            "Vectorize a loop-based computation and benchmark it",
        ],
        "FastAPI": [
            "Build a CRUD API with validation and OpenAPI docs",
        ],
        "Machine Learning & Statistics": [
            "Train a baseline model and report calibrated metrics",
        ],
    }
    if skill in catalog:
        return list(catalog[skill])
    generic = [
        f"Complete a guided exercise using {skill}",
        f"Apply {skill} in a small feature of an existing project",
        f"Write a short note explaining when {skill} is the right tool",
    ]
    return generic


def _practice_project_for(skills: list[str], target_role: str) -> str:
    """A phase-level practice task that exercises the phase skills (§7)."""
    if "Testing" in skills and "CI/CD" in skills:
        return "Add a tested CI pipeline to one of your existing repositories"
    if "Docker" in skills:
        return "Containerize and ship one of your existing projects end-to-end"
    if "System Design" in skills:
        return "Design and document the next major feature of your main project"
    if "Database" in skills or "Redis" in skills:
        return "Add a data layer with caching to an existing application"
    return f"Build a small {target_role.lower()} project applying {', '.join(skills)}"


def _order_gaps(gaps: list[SkillGapEntry]) -> list[SkillGapEntry]:
    """Deterministic roadmap order (§7, §33).

    Sort key: dependency depth (foundations first), then priority score,
    then gap size, then name. This puts JavaScript before React and
    Testing before CI/CD while keeping the biggest gaps early within a
    dependency tier.
    """
    return sorted(
        gaps,
        key=lambda g: (
            dependency_depth(g.skill),
            -g.priorityScore,
            -g.gap,
            g.skill,
        ),
    )


def build_roadmap(
    gaps_doc: SkillGapsDocument,
    target_role: str,
    version: int,
    analysis_version: str,
    previous_phases: list[RoadmapPhase] | None = None,
) -> RoadmapDocument:
    """Generate the roadmap from actual gaps (§26: never pad with strengths).

    `previous_phases` carries completion forward across versions: a phase
    with the same skill set that was already completed stays completed.
    """
    now = datetime.now(UTC)
    ordered = _order_gaps(gaps_doc.gaps)

    def dependency_prereqs(skill: str) -> list[str]:
        from .dependency_graph import prerequisites_of

        return prerequisites_of(skill)

    # Skip LOW-priority tail when there are enough substantial gaps (§27):
    # the roadmap exists to close real gaps, not to list the matrix.
    substantial = [g for g in ordered if g.priority != "LOW"]
    if len(substantial) >= 2:
        ordered = substantial + [g for g in ordered if g.priority == "LOW"][:1]

    phases: list[RoadmapPhase] = []
    buffered: list[SkillGapEntry] = []

    def flush(buffer: list[SkillGapEntry]) -> None:
        if not buffer or len(phases) >= MAX_PHASES:
            return
        skills = [g.skill for g in buffer]
        order = len(phases) + 1
        phase_id = f"phase-{order}"
        priorities = [g.priority for g in buffer]
        priority = (
            "HIGH" if "HIGH" in priorities else ("MEDIUM" if "MEDIUM" in priorities else "LOW")
        )
        resources: list[ResourceRef] = []
        for s in skills:
            resources.extend(resources_for(s))
        # A previous phase is a prerequisite when any of its skills is a
        # direct dependency of a skill in this phase (§23: lock until done).
        prerequisite_ids = [
            p.id
            for p in phases
            if any(dep in p.skills for s in skills for dep in dependency_prereqs(s))
        ]
        completed_before = False
        if previous_phases:
            for prev in previous_phases:
                if set(prev.skills) == set(skills) and prev.completed:
                    completed_before = True
                    break
        phases.append(
            RoadmapPhase(
                id=phase_id,
                order=order,
                title=_title_for(skills).capitalize(),
                description=(
                    f"Closes your {skills[0]} gap"
                    + (f" plus {len(skills) - 1} related skill(s)" if len(skills) > 1 else "")
                    + f" for the {target_role} role."
                ),
                skills=skills,
                priority=priority,
                prerequisites=prerequisite_ids,
                estimatedDuration=_duration_for(len(skills)),
                learningObjectives=[obj for s in skills for obj in _objectives_for(s)],
                resources=resources,
                project=_practice_project_for(skills, target_role),
                completed=completed_before,
            )
        )

    for gap in ordered:
        if len(phases) >= MAX_PHASES:
            break
        buffered.append(gap)
        # Flush when the phase is full or the next skill breaks dependency
        # contiguity (a new foundation layer starts a new phase).
        if len(buffered) >= MAX_SKILLS_PER_PHASE:
            flush(buffered)
            buffered = []
    flush(buffered)

    estimated = _duration_for(sum(len(p.skills) for p in phases))

    return RoadmapDocument(
        userId=gaps_doc.userId,
        targetRole=target_role,
        version=version,
        analysisVersion=analysis_version,
        status="ACTIVE",
        generatedAt=now.isoformat(),
        updatedAt=now.isoformat(),
        estimatedDuration=estimated,
        phases=phases,
    )
