"""Project pattern detection (§14).

Classifies a repository into a project type from languages, technologies,
file structure, and topics — with explicit confidence and evidence.
"""

from __future__ import annotations

from ..models.analysis_models import ProjectPattern


# The candidate patterns and the evidence each one collects.
def detect_project_pattern(
    *,
    languages: list[str],
    technologies: list[str],
    topics: list[str],
    manifest_paths: list[str],
    has_tests: bool,
    is_fork: bool = False,
) -> ProjectPattern | None:
    techs = {t.lower() for t in technologies}
    langs = {lang.lower() for lang in languages}
    tops = {t.lower() for t in topics}
    paths = [p.lower() for p in manifest_paths]

    frontend = bool(
        techs & {"react", "next.js", "vue", "angular", "svelte", "tailwind", "bootstrap"}
    )
    backend = bool(
        techs & {"express", "fastapi", "django", "flask", "nestjs", "fastify", "node.js", "spring"}
    )
    database = bool(
        techs & {"mongodb", "postgresql", "mysql", "sqlite", "redis", "mongoose", "prisma"}
    )
    mobile = bool(langs & {"dart", "swift", "kotlin"} or techs & {"react native"})
    ml = bool(
        techs & {"scikit-learn", "tensorflow", "pytorch"}
        or tops & {"machine-learning", "deep-learning", "nlp", "computer-vision"}
    )
    cli = (
        any(
            p.endswith(("cli.py", "main.py", "cli.ts", "cli.js", "bin/")) or "/bin/" in p
            for p in paths
        )
        and not frontend
    )
    infra = bool(
        techs & {"docker", "kubernetes", "terraform", "github actions"}
        or tops & {"devops", "infrastructure"}
    )
    data = bool(techs & {"pandas", "numpy"} or tops & {"data-analysis", "data-science"})
    iot = "iot" in tops or bool(langs & {"c", "cpp"} and "arduino" in " ".join(paths))
    library = any(
        p.lower() in {"index.js", "index.ts", "__init__.py", "lib/"} for p in paths
    ) and not (frontend and backend)

    reasons: list[str] = []
    best_label, best_score = "General Application", 0.3

    def consider(label: str, total: float, why: list[str]) -> None:
        nonlocal best_label, best_score
        if total > best_score:
            best_label, best_score = label, total
            reasons.clear()
            reasons.extend(why)

    if frontend and backend:
        consider(
            "Full-stack Web Application",
            0.85 + 0.05 * database + 0.03 * bool(topics),
            [
                "Frontend framework detected",
                "Backend framework detected",
                *(["Database integration detected"] if database else []),
            ],
        )
    elif backend and database:
        consider(
            "Backend API / Service",
            0.8,
            ["Backend framework detected", "Database integration detected"],
        )
    elif backend:
        consider("Backend API / Service", 0.65, ["Backend framework detected"])
    elif frontend:
        consider(
            "Frontend Application",
            0.7,
            ["Frontend framework detected", "No backend framework present"],
        )
    if ml:
        consider(
            "Machine Learning Project",
            0.75 + (0.1 if "python" in langs else 0.0),
            ["ML framework detected (scikit-learn/TensorFlow/PyTorch)"],
        )
    if data and not ml:
        consider("Data Analysis Project", 0.6, ["Data libraries detected (pandas/NumPy)"])
    if mobile:
        consider("Mobile Application", 0.7, ["Mobile language/framework detected"])
    if infra and not (frontend or backend):
        consider(
            "DevOps / Infrastructure Project",
            0.7,
            ["Infrastructure tooling detected without app frameworks"],
        )
    if iot:
        consider("IoT Project", 0.6, ["IoT topic / embedded sources detected"])
    if library:
        consider("Library / Package", 0.55, ["Package entry-point layout without app structure"])
    if cli and not (frontend or backend):
        consider("CLI Tool", 0.6, ["CLI entry point detected"])

    if best_score < 0.35:
        return None

    confidence = min(0.97, best_score)
    if is_fork:
        confidence = round(confidence * 0.9, 2)  # fork provenance weakens certainty
    return ProjectPattern(
        projectType=best_label,
        confidence=round(confidence, 2),
        evidence=reasons or ["Language and topic signals"],
    )
