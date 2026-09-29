"""Documentation analysis (§11).

Measurable evidence only: README presence/size and section headers detected
in the README body (fetched by Node during analysis — static, never executed).
"""

from __future__ import annotations

import re

from ..models.analysis_models import DocumentationReport

SECTIONS = {
    "Installation": ("installation", "getting started", "setup", "quick start", "prerequisites"),
    "Usage": ("usage", "how to use", "examples", "running"),
    "Architecture": ("architecture", "structure", "design", "how it works"),
    "API": ("api", "endpoints", "reference"),
    "Configuration": ("configuration", "environment", "env", "config"),
    "Deployment": ("deployment", "deploy", "docker", "production"),
    "Contributing": ("contributing", "contribution"),
    "Testing": ("testing", "tests", "running tests"),
    "License": ("license",),
    "Screenshots": ("screenshot", "demo", "preview"),
}

_HEADING = re.compile(r"^#{1,6}\s+(.*)$", re.MULTILINE)


def analyze_documentation(
    *,
    readme_exists: bool,
    readme_size: int,
    readme_body: str | None = None,
    has_description: bool = False,
    license_known: bool = False,
) -> DocumentationReport:
    notes: list[str] = []
    if not readme_exists:
        return DocumentationReport(
            documentationScore=None,
            readmePresent=False,
            readmeLength=readme_size,
            sectionsDetected=[],
            notes=["No README — documentation data unavailable (not scored as zero)."],
        )

    body = readme_body or ""
    headers = [h.strip().lower() for h in _HEADING.findall(body)]
    detected: list[str] = []
    for section, needles in SECTIONS.items():
        if any(needle in header for header in headers for needle in needles):
            detected.append(section)
    # License may be known from repo metadata even without a section header.
    if license_known and "License" not in detected:
        detected.append("License")

    score = 40.0  # base for an existing README
    score += min(20.0, readme_size / 400)  # substance (≈ 8 KB caps)
    score += min(24.0, 4.0 * len(detected))
    if has_description:
        score += 6
    if readme_size < 300:
        score -= 10
        notes.append("Very short README — little documentation signal")

    return DocumentationReport(
        documentationScore=round(max(0.0, min(100.0, score))),
        readmePresent=True,
        readmeLength=readme_size,
        sectionsDetected=detected,
        notes=notes,
    )
