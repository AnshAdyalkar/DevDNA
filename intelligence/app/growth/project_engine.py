"""Project recommendation engine (§11-§15).

Recommendations come from curated project templates scored against the
user's ACTUAL state: gap overlap (which template closes their gaps?),
existing strengths to leverage, and role fit. The result is personalized
and deterministic (§33): identical DNA + role ⇒ identical output.

Projects never require technologies unrelated to the target role (§12)
and every milestone maps to skills so completion can later be tied to
skill growth (§15).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from .models import ProjectMilestone, ProjectRecommendation, SkillGapEntry, SkillGapsDocument

# ── Curated project templates (configuration, not user data) ────────────────
# coreTechnologies: the base stack; extendedTechnologies: added when they
# target the user's gaps. skillUniverse: skills this project can develop.
TEMPLATES: list[dict[str, Any]] = [
    {
        "key": "task-platform",
        "title": "Production-Style Task Management Platform",
        "description": (
            "A full-stack task management product with authentication, teams, "
            "real-time updates, caching and automated tests — deployed in containers."
        ),
        "roleHints": ["Full Stack Developer", "Software Engineer"],
        "coreTechnologies": ["React", "Node.js", "Database"],
        "gapTechnologies": ["Redis", "Docker", "Testing", "CI/CD", "TypeScript", "System Design"],
        "skillUniverse": [
            "System Design",
            "Testing",
            "Caching",
            "API Development",
            "Database",
            "CI/CD",
            "Docker",
            "TypeScript",
        ],
        "architecture": "React\n   ↓\nNode.js API\n   ↓\nRedis Cache\n   ↓\nMongoDB",
        "milestones": [
            (
                "Project architecture",
                "Sketch the architecture and data model; set up the monorepo",
                ["System Design"],
                "2-3 days",
            ),
            (
                "Authentication",
                "Implement register/login with hashed passwords and sessions",
                ["API Development"],
                "3-4 days",
            ),
            (
                "Database layer",
                "Design schemas and repositories for boards, lists and tasks",
                ["Database"],
                "3-4 days",
            ),
            (
                "Core API",
                "Build CRUD endpoints with validation and error envelopes",
                ["API Development"],
                "1 week",
            ),
            ("Frontend", "Build the board UI with optimistic updates", ["React"], "1 week"),
            (
                "Caching",
                "Add a Redis cache for hot reads with explicit TTLs",
                ["Caching"],
                "2-3 days",
            ),
            (
                "Automated testing",
                "Cover API and critical UI paths with automated tests",
                ["Testing"],
                "1 week",
            ),
            (
                "Containerization",
                "Dockerize the stack and wire a CI pipeline",
                ["Docker", "CI/CD"],
                "3-4 days",
            ),
        ],
    },
    {
        "key": "containerized-api",
        "title": "Containerized REST API Service",
        "description": (
            "A production-grade REST service with a relational/document data layer, "
            "caching, full test coverage and a CI pipeline that ships a container image."
        ),
        "roleHints": ["Backend Developer", "Software Engineer", "Python Developer"],
        "coreTechnologies": ["Node.js", "API Development", "Database"],
        "gapTechnologies": ["Testing", "Docker", "CI/CD", "Redis", "System Design", "SQL"],
        "skillUniverse": [
            "API Development",
            "Testing",
            "Docker",
            "CI/CD",
            "Caching",
            "System Design",
            "Database",
        ],
        "architecture": "Client\n   ↓\nNode.js API\n   ↓\nRedis Cache\n   ↓\nPostgreSQL",
        "milestones": [
            (
                "API design",
                "Design resources, status codes and error envelopes up front",
                ["API Development"],
                "2-3 days",
            ),
            (
                "Data layer",
                "Model entities with explicit schemas and indexes",
                ["Database"],
                "3-4 days",
            ),
            (
                "Core endpoints",
                "Implement CRUD with pagination and validation",
                ["API Development"],
                "1 week",
            ),
            (
                "Automated testing",
                "Reach 70%+ coverage across unit and API tests",
                ["Testing"],
                "1 week",
            ),
            ("Caching", "Cache expensive reads; measure the hit ratio", ["Caching"], "2-3 days"),
            (
                "Container & CI",
                "Multi-stage Dockerfile plus a lint-and-test pipeline",
                ["Docker", "CI/CD"],
                "3-4 days",
            ),
        ],
    },
    {
        "key": "portfolio-cms",
        "title": "Developer Portfolio Platform with CMS",
        "description": (
            "A server-rendered portfolio with a content model, admin editing, "
            "strong accessibility and component tests."
        ),
        "roleHints": ["Frontend Developer", "Full Stack Developer"],
        "coreTechnologies": ["React", "TypeScript", "CSS"],
        "gapTechnologies": ["Next.js", "Testing", "API Development", "Database"],
        "skillUniverse": ["React", "Next.js", "TypeScript", "CSS", "Testing", "API Development"],
        "architecture": "Next.js (SSR)\n   ↓\nNode.js API\n   ↓\nMongoDB",
        "milestones": [
            (
                "Design system",
                "Build the base components with tokens and dark mode",
                ["CSS", "React"],
                "1 week",
            ),
            (
                "Content model",
                "Define projects/posts schemas and the API for them",
                ["API Development"],
                "3-4 days",
            ),
            (
                "Server rendering",
                "Build data-driven pages with routing and metadata",
                ["Next.js"],
                "1 week",
            ),
            (
                "Admin editing",
                "Create and edit content from an authenticated UI",
                ["React"],
                "1 week",
            ),
            (
                "Component tests",
                "Test critical components and interactions",
                ["Testing"],
                "3-4 days",
            ),
        ],
    },
    {
        "key": "data-pipeline",
        "title": "Data Analysis Pipeline & Dashboard",
        "description": (
            "An end-to-end analytics project: ingest real data, model it in SQL, "
            "analyze with Python and publish an interactive dashboard."
        ),
        "roleHints": ["Data Analyst", "Software Engineer"],
        "coreTechnologies": ["Python", "SQL", "Database"],
        "gapTechnologies": ["Pandas", "Data Visualization", "Statistics", "Docker"],
        "skillUniverse": [
            "Python",
            "SQL",
            "Pandas",
            "Data Visualization",
            "Statistics",
            "Database",
        ],
        "architecture": "Data sources\n   ↓\nPython pipeline\n   ↓\nPostgreSQL\n   ↓\nDashboard",
        "milestones": [
            (
                "Data acquisition",
                "Collect a real dataset and document its quality issues",
                ["Python"],
                "2-3 days",
            ),
            (
                "Warehouse modeling",
                "Load and model the data with well-indexed tables",
                ["SQL", "Database"],
                "1 week",
            ),
            (
                "Analysis",
                "Profile and aggregate with pandas; state hypotheses",
                ["Pandas", "Statistics"],
                "1 week",
            ),
            (
                "Visualization",
                "Build a dashboard that answers three business questions",
                ["Data Visualization"],
                "1 week",
            ),
            (
                "Reproducibility",
                "Package the pipeline to run anywhere",
                ["Python", "Docker"],
                "2-3 days",
            ),
        ],
    },
    {
        "key": "ml-service",
        "title": "Machine Learning Model Service",
        "description": (
            "Train and evaluate a model on real data, then serve it behind a "
            "validated API with monitoring and containerized deployment."
        ),
        "roleHints": ["AI/ML Engineer", "Data Analyst", "Python Developer"],
        "coreTechnologies": ["Python", "Machine Learning"],
        "gapTechnologies": [
            "API Development",
            "Docker",
            "Testing",
            "Statistics",
            "NumPy",
            "Pandas",
        ],
        "skillUniverse": [
            "Machine Learning",
            "Statistics",
            "API Development",
            "Testing",
            "Docker",
            "NumPy",
            "Pandas",
        ],
        "architecture": "Client\n   ↓\nFastAPI\n   ↓\nModel registry\n   ↓\nMetrics store",
        "milestones": [
            (
                "Data & features",
                "Build the feature pipeline with documented transformations",
                ["Pandas", "NumPy"],
                "1 week",
            ),
            (
                "Baseline model",
                "Train, evaluate and report calibrated metrics",
                ["Machine Learning", "Statistics"],
                "1 week",
            ),
            (
                "Serving API",
                "Expose predictions with validation and health checks",
                ["API Development"],
                "3-4 days",
            ),
            (
                "Evaluation tests",
                "Pin evaluation metrics in automated tests",
                ["Testing"],
                "2-3 days",
            ),
            (
                "Deployment",
                "Ship the service as a container with monitoring",
                ["Docker"],
                "3-4 days",
            ),
        ],
    },
    {
        "key": "devops-pipeline",
        "title": "CI/CD Automation & Deployment Pipeline",
        "description": (
            "Automate build, test, containerize and deploy for a sample service, "
            "with rollbacks and environment promotion."
        ),
        "roleHints": ["DevOps Engineer", "Backend Developer", "Software Engineer"],
        "coreTechnologies": ["Docker", "CI/CD"],
        "gapTechnologies": ["Kubernetes", "GitHub Actions", "Linux", "AWS", "System Design"],
        "skillUniverse": [
            "Docker",
            "Kubernetes",
            "CI/CD",
            "GitHub Actions",
            "Linux",
            "AWS",
            "System Design",
        ],
        "architecture": "Git push\n   ↓\nGitHub Actions\n   ↓\nContainer registry\n   ↓\nCluster",
        "milestones": [
            ("Containerize", "Multi-stage build for the sample service", ["Docker"], "2-3 days"),
            (
                "CI workflow",
                "Lint, test and build on every push with caching",
                ["GitHub Actions", "CI/CD"],
                "3-4 days",
            ),
            (
                "Deployment",
                "Deploy to a cluster with health checks and rollback",
                ["Kubernetes", "Linux"],
                "1 week",
            ),
            (
                "Environment promotion",
                "Promote builds dev → staging → production",
                ["CI/CD", "System Design"],
                "3-4 days",
            ),
        ],
    },
    {
        "key": "realtime-collab",
        "title": "Real-Time Collaboration App",
        "description": (
            "A shared whiteboard/editor with presence, conflict handling, caching "
            "and end-to-end tests over websockets."
        ),
        "roleHints": ["Full Stack Developer", "Frontend Developer", "Backend Developer"],
        "coreTechnologies": ["React", "Node.js", "Database"],
        "gapTechnologies": ["Redis", "Testing", "Docker", "System Design", "TypeScript"],
        "skillUniverse": [
            "System Design",
            "Caching",
            "Testing",
            "Docker",
            "React",
            "TypeScript",
            "Database",
        ],
        "architecture": "React\n   ↓\nNode.js + Socket.IO\n   ↓\nRedis pub/sub\n   ↓\nMongoDB",
        "milestones": [
            (
                "Architecture",
                "Design the event flow and conflict strategy",
                ["System Design"],
                "2-3 days",
            ),
            (
                "Sync layer",
                "Implement realtime updates with pub/sub fan-out",
                ["Caching"],
                "1 week",
            ),
            ("Client", "Build the collaborative UI with presence", ["React"], "1 week"),
            ("Testing", "Integration tests over websocket flows", ["Testing"], "1 week"),
            ("Ship", "Containerize with persistent sessions", ["Docker"], "2-3 days"),
        ],
    },
    {
        "key": "quality-toolkit",
        "title": "Testing & Code Quality Toolkit",
        "description": (
            "A CLI that audits a repository for test coverage, complexity and "
            "documentation — with its own full test suite and CI."
        ),
        "roleHints": ["Software Engineer", "Backend Developer", "Python Developer"],
        "coreTechnologies": ["Python", "Testing"],
        "gapTechnologies": ["CI/CD", "Docker", "API Development", "SQL"],
        "skillUniverse": ["Testing", "CI/CD", "Docker", "API Development", "Python"],
        "architecture": "CLI\n   ↓\nAnalyzer core\n   ↓\nReport store\n   ↓\nDashboard API",
        "milestones": [
            (
                "Analyzer core",
                "Parse a repo tree and compute quality metrics",
                ["Python"],
                "1 week",
            ),
            ("Test suite", "Write the toolkit's tests to 80%+ coverage", ["Testing"], "1 week"),
            (
                "Reporting API",
                "Serve audit reports from a small API",
                ["API Development"],
                "3-4 days",
            ),
            (
                "Pipeline & image",
                "Publish releases via CI as a container",
                ["CI/CD", "Docker"],
                "2-3 days",
            ),
        ],
    },
]

PROJECTS_PER_USER = 3

# Difficulty weights (§13) — documented in docs/growth-engine.md.
BEGINNER_MAX = 2
INTERMEDIATE_MAX = 5


def _gap_sets(gaps: list[SkillGapEntry]) -> tuple[set[str], set[str]]:
    """(high+medium gap skills, all gap skills) for template scoring."""
    priority = {g.skill for g in gaps if g.priority in ("HIGH", "MEDIUM")}
    return priority, {g.skill for g in gaps}


def _template_technologies(template: dict[str, Any], all_gaps: set[str], role: str) -> list[str]:
    """Core stack plus gap-targeting extensions relevant to the role (§12)."""
    techs = list(template["coreTechnologies"])
    for tech in template["gapTechnologies"]:
        if tech in all_gaps and tech not in techs:
            techs.append(tech)
    # Keep the stack focused: core + at most 4 gap-driven additions.
    return techs[: len(template["coreTechnologies"]) + 4]


def _compute_difficulty(technologies: list[str], milestones: list[ProjectMilestone]) -> str:
    """Deterministic difficulty from measurable complexity factors (§13)."""
    score = min(3, len(technologies) // 2)
    score += min(2, len(milestones) // 3)
    if any(t in ("Docker", "Kubernetes", "AWS") for t in technologies):
        score += 1  # deployment complexity
    if any("test" in m.title.lower() for m in milestones):
        score += 1  # testing requirements
    return (
        "Advanced"
        if score > INTERMEDIATE_MAX
        else ("Intermediate" if score > BEGINNER_MAX else "Beginner")
    )


def _duration_for(difficulty: str) -> str:
    return {"Beginner": "1-2 weeks", "Intermediate": "3-4 weeks", "Advanced": "5-8 weeks"}[
        difficulty
    ]


def generate_projects(
    gaps_doc: SkillGapsDocument,
    target_role: str,
    analysis_version: str,
    now: str | None = None,
    limit: int = PROJECTS_PER_USER,
) -> list[ProjectRecommendation]:
    """Personalized, deterministic project recommendations (§11, §33).

    `now` is injectable so identical inputs reproduce identical output;
    it defaults to the current time in production.
    """
    if now is None:
        now = datetime.now(UTC).isoformat()
    priority_gaps, all_gaps = _gap_sets(gaps_doc.gaps)
    strengths = set(gaps_doc.strengths)

    scored: list[tuple[float, str, dict[str, Any]]] = []
    for template in TEMPLATES:
        overlap = len(priority_gaps & set(template["skillUniverse"]))
        leverage = len(strengths & set(template["coreTechnologies"]))
        role_fit = 1.5 if target_role in template["roleHints"] else 0.0
        score = float(overlap) + 0.5 * leverage + role_fit
        scored.append((score, template["key"], template))
    # Deterministic order: score desc, then template key (§33).
    scored.sort(key=lambda t: (-t[0], t[1]))

    projects: list[ProjectRecommendation] = []
    for score, _key, template in scored[: max(0, limit)]:
        if score <= 0 and projects:
            continue  # never pad with irrelevant projects (§27)
        technologies = _template_technologies(template, all_gaps, target_role)
        skills_developed = [s for s in template["skillUniverse"] if s in (all_gaps | strengths)]
        gaps_addressed = sorted(priority_gaps & set(template["skillUniverse"]))
        milestones = [
            ProjectMilestone(
                order=i + 1,
                title=title,
                description=description,
                skills=skills,
                estimatedDuration=duration,
            )
            for i, (title, description, skills, duration) in enumerate(template["milestones"])
        ]
        difficulty = _compute_difficulty(technologies, milestones)
        # Prerequisites: core technologies the user has NOT yet demonstrated.
        demonstrated = {s.lower() for s in gaps_doc.strengths}
        prerequisites = [
            t
            for t in template["coreTechnologies"]
            if t.lower() not in demonstrated
            and t not in all_gaps  # it's a gap → developed by the project, not assumed
        ]
        projects.append(
            ProjectRecommendation(
                userId=gaps_doc.userId,
                targetRole=target_role,
                title=template["title"],
                description=template["description"],
                difficulty=difficulty,
                estimatedDuration=_duration_for(difficulty),
                technologies=technologies,
                skillsDeveloped=skills_developed,
                gapsAddressed=gaps_addressed,
                prerequisites=prerequisites,
                architecture=template["architecture"],
                milestones=milestones,
                generatedAt=now,
                analysisVersion=analysis_version,
            )
        )
    return projects
