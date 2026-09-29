"""Testing analysis (§12).

Test evidence from the file manifest + declared frameworks. Missing test
data is reported as unavailable rather than scored as zero (§29).
"""

from __future__ import annotations

from ..models.analysis_models import TestingReport

FRAMEWORK_BY_FILE = {
    "pytest.ini": "pytest",
    "conftest.py": "pytest",
    "jest.config.js": "Jest",
    "jest.config.ts": "Jest",
    "vitest.config.ts": "Vitest",
    "vitest.config.js": "Vitest",
    "playwright.config.ts": "Playwright",
    "cypress.config.ts": "Cypress",
    ".cypressrc.json": "Cypress",
    "karma.conf.js": "Karma",
}

FRAMEWORK_BY_NAME = {
    "pytest",
    "jest",
    "vitest",
    "mocha",
    "cypress",
    "playwright",
    "junit",
    "karma",
    "jasmine",
}


def analyze_testing(
    *,
    test_files: list[str],
    source_files_count: int,
    technologies: list[str],
    ci_detected: bool,
    ci_runs_tests: bool = False,
) -> TestingReport:
    frameworks: set[str] = set()
    for path in test_files:
        base = path.rsplit("/", 1)[-1].lower()
        if base in FRAMEWORK_BY_FILE:
            frameworks.add(FRAMEWORK_BY_FILE[base])
    for tech in technologies:
        if tech.lower() in FRAMEWORK_BY_NAME:
            frameworks.add(tech.lower() if tech.lower() == "pytest" else tech)

    notes: list[str] = []
    if not test_files and source_files_count == 0:
        return TestingReport(
            testingScore=None,
            testFiles=0,
            sourceFiles=source_files_count,
            sourceToTestRatio=None,
            frameworks=sorted(frameworks),
            ciTestingDetected=ci_detected,
            notes=["No source files in the manifest — testing data unavailable."],
        )

    if not test_files:
        # Negative evidence: sources exist, tests do not → legitimately low.
        notes.append("No test files detected among source files.")
        ratio: float | None = None
        score = 0.0 if source_files_count >= 5 else None
        if score is None:
            notes.append("Too few source files to expect tests — testing data unavailable.")
    else:
        ratio = round(len(test_files) / max(1, source_files_count), 3)
        score = 45.0
        score += min(30.0, 60.0 * ratio)
        if frameworks:
            score += 15
            notes.append(f"Testing framework detected: {', '.join(sorted(frameworks))}")
        if ci_runs_tests or ci_detected:
            score += 10

    return TestingReport(
        testingScore=round(max(0.0, min(100.0, score))) if score is not None else None,
        testFiles=len(test_files),
        sourceFiles=source_files_count,
        sourceToTestRatio=ratio,
        frameworks=sorted(frameworks),
        ciTestingDetected=ci_detected,
        notes=notes,
    )
