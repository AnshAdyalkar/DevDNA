"""Repository complexity model (§10).

Additive, documented rules over observable signals — no randomness, no
black-box. Every point contribution is reported so the UI can explain the
score. Max 100 points:

  Size & structure            up to 25
    - source files (log-scaled): 12
    - manifest truncation / scale: 3
    - large-file pressure: 4 (penalty for monolith files)
    - directory depth breadth: 6
  Architecture (tech families) up to 30
    - frontend stack: 8, backend framework: 8, database: 6,
      real-time: 4, background/queues: 4
  Engineering practices        up to 25
    - tests: 10, CI: 5, Docker/infra: 5, docs: 5
  Feature complexity           up to 20
    - auth: 6, external APIs: 4, caching/queues: 4, env config: 3,
      payment/messaging integrations: 3
  Technology diversity         up to 10 (capped from distinct techs)
"""

from __future__ import annotations

from ..models.analysis_models import ComplexityFactor, ComplexityReport
from ..utils.technology_utils import line_count_estimate

FRONTEND_TECHS = {"React", "Next.js", "Vue", "Angular", "Svelte", "Tailwind", "Bootstrap"}
BACKEND_TECHS = {"Express", "FastAPI", "Django", "Flask", "NestJS", "Fastify", "Node.js", "Spring"}
DATABASE_TECHS = {
    "MongoDB",
    "PostgreSQL",
    "MySQL",
    "SQLite",
    "Redis",
    "Mongoose",
    "Prisma",
    "SQLAlchemy",
}
REALTIME_TECHS = {"Socket.IO", "WebSockets"}
QUEUE_TECHS = {"Celery", "Bull"}
AUTH_TECHS = {"JWT Auth", "Passport Auth", "OAuth"}
INTEGRATION_TECHS = {"Stripe", "Firebase", "AWS", "Azure", "GCP"}

LEVELS = (
    (20, "Minimal"),
    (40, "Simple"),
    (60, "Moderate"),
    (80, "Advanced"),
    (101, "Complex"),
)


def level_for(score: int) -> str:
    for bound, name in LEVELS:
        if score < bound:
            return name
    return "Complex"


def analyze_complexity(
    *,
    metrics_files: int,
    metrics_source_files: int,
    manifest_paths: list[str],
    technologies: list[str],
    has_tests: bool,
    has_ci: bool,
    has_docker: bool,
    has_docs: bool,
    total_size_bytes: int,
) -> ComplexityReport:
    techs = set(technologies)
    factors: list[ComplexityFactor] = []

    # ── Size & structure ───────────────────────────────────────────────
    import math

    size_pts = 0.0
    if metrics_source_files:
        size_pts += min(12.0, 4.0 * math.log2(metrics_source_files + 1))
    dirs = {p.rsplit("/", 1)[0] for p in manifest_paths if "/" in p}
    size_pts += min(6.0, 1.0 * len(dirs))
    big_files = sum(
        1
        for p in manifest_paths
        if p.lower().endswith((".ts", ".tsx", ".js", ".py", ".java", ".go"))
        and _approx_lines(manifest_paths, p, total_size_bytes) > 800
    )
    if big_files:
        size_pts -= min(4.0, 1.0 * big_files)
    size_pts = max(0.0, size_pts)
    if size_pts:
        factors.append(ComplexityFactor(factor="Size & structure", contribution=round(size_pts)))

    # ── Architecture ───────────────────────────────────────────────────
    arch = 0.0
    if techs & FRONTEND_TECHS:
        arch += 8
    if techs & BACKEND_TECHS:
        arch += 8
    if techs & DATABASE_TECHS:
        arch += 6
    if techs & REALTIME_TECHS:
        arch += 4
    if techs & QUEUE_TECHS:
        arch += 4
    if arch:
        factors.append(ComplexityFactor(factor="Architecture", contribution=arch))

    # ── Engineering practices ──────────────────────────────────────────
    practice = 0.0
    if has_tests:
        practice += 10
    if has_ci:
        practice += 5
    if has_docker:
        practice += 5
    if has_docs:
        practice += 5
    if practice:
        factors.append(
            ComplexityFactor(factor="Engineering practices", contribution=round(practice))
        )

    # ── Feature complexity ─────────────────────────────────────────────
    features = 0.0
    if techs & AUTH_TECHS:
        features += 6
    if techs & INTEGRATION_TECHS:
        features += 4
    if techs & QUEUE_TECHS:
        features += 4
    if "Environment Config" in techs:
        features += 3
    if "GraphQL" in techs or "REST API" in techs:
        features += 3
    features = min(20.0, features)
    if features:
        factors.append(ComplexityFactor(factor="Feature complexity", contribution=round(features)))

    # ── Technology diversity ───────────────────────────────────────────
    diversity = min(10.0, 1.5 * len(techs))
    if diversity:
        factors.append(
            ComplexityFactor(factor="Technology diversity", contribution=round(diversity))
        )

    total = min(100.0, size_pts + arch + practice + features + diversity)
    return ComplexityReport(
        complexityScore=round(max(0.0, total)),
        level=level_for(round(total)),
        factors=factors,
    )


def _approx_lines(manifest_paths: list[str], path: str, total_size: int) -> int:
    """Per-file line estimate is only possible with sizes; the manifest carries
    them, but this helper receives aggregated data — kept simple on purpose."""
    return line_count_estimate(total_size // max(1, len(manifest_paths)))
