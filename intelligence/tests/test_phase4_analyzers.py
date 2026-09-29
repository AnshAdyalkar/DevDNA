"""Phase 4 intelligence engine tests (§31).

Deterministic analyzers over synthetic-but-realistic synchronized data.
No network, no MongoDB required for the analyzer/scoring suites.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.analyzers import (
    code_metrics,
    complexity_analyzer,
    documentation_analyzer,
    testing_analyzer,
)
from app.analyzers.behavior_analyzer import analyze_behavior
from app.analyzers.language_analyzer import (
    aggregate_developer_languages,
    language_diversity,
    normalize_languages,
)
from app.analyzers.project_pattern_analyzer import detect_project_pattern
from app.analyzers.technology_analyzer import detect_technologies, merge_technologies
from app.dna.scoring import confidence_band, score_skill
from app.models.analysis_models import RepositoryAnalysisDocument

# ─── Language analyzer ──────────────────────────────────────────────────────


class TestLanguageAnalyzer:
    def test_percentages_normalize_to_100(self):
        shares = normalize_languages({"Python": 450_000, "JavaScript": 550_000})
        assert len(shares) == 2
        assert sum(s.percentage for s in shares) == pytest.approx(100.0, abs=0.2)
        assert shares[0].name == "JavaScript"  # largest first

    def test_multiple_languages_ordered_desc(self):
        shares = normalize_languages({"Python": 450, "Go": 100, "Rust": 450})
        assert [s.name for s in shares] == ["Python", "Rust", "Go"]

    def test_empty_language_data(self):
        assert normalize_languages({}) == []
        assert normalize_languages({"Python": 0}) == []

    def test_developer_aggregation_sums_bytes(self):
        combined = aggregate_developer_languages([{"Python": 100, "JS": 50}, {"Python": 300}])
        python = next(s for s in combined if s.name == "Python")
        assert python.bytes == 400
        assert sum(s.percentage for s in combined) == pytest.approx(100.0, abs=0.2)

    def test_diversity_bounds(self):
        assert language_diversity([]) == 0.0
        assert language_diversity(normalize_languages({"Python": 100})) == 0.0
        assert language_diversity(normalize_languages({"A": 50, "B": 50})) == pytest.approx(1.0)
        assert 0.0 <= language_diversity(normalize_languages({"A": 90, "B": 10})) < 1.0


# ─── Technology detector ────────────────────────────────────────────────────


class TestTechnologyDetector:
    def test_package_json_dependencies(self):
        grouped = detect_technologies(
            manifest_paths=["package.json"],
            manifest_bodies={
                "package.json": (
                    '{"dependencies": {"react": "^19", "express": "^5", "mongoose": "^8"}}'
                )
            },
        )
        merged = merge_technologies(grouped)
        # mongoose maps to Mongoose (its own tech); MongoDB appears via mongo driver name
        assert {"React", "Express", "Mongoose"}.issubset(set(merged))

    def test_requirements_txt(self):
        grouped = detect_technologies(
            manifest_paths=["requirements.txt"],
            manifest_bodies={"requirements.txt": "fastapi==0.1\npytest==8\nmotor==3\n"},
        )
        merged = merge_technologies(grouped)
        assert {"FastAPI", "pytest", "MongoDB"}.issubset(set(merged))

    def test_dockerfile_and_ci_config_files(self):
        grouped = detect_technologies(
            manifest_paths=["Dockerfile", "docker-compose.yml", ".github/workflows/ci.yml"]
        )
        merged = merge_technologies(grouped)
        assert "Docker" in merged
        assert "GitHub Actions" in merged

    def test_github_topics(self):
        grouped = detect_technologies(manifest_paths=[], topics=["react", "mongodb", "iot"])
        merged = merge_technologies(grouped)
        assert {"React", "MongoDB"}.issubset(set(merged))
        assert "IoT" in merged

    def test_languages_source(self):
        grouped = detect_technologies(manifest_paths=[], languages=["TypeScript", "Shell"])
        merged = merge_technologies(grouped)
        assert "TypeScript" in merged

    def test_dependency_evidence_beats_topics(self):
        merged = merge_technologies(
            detect_technologies(
                manifest_paths=["package.json"],
                manifest_bodies={"package.json": '{"dependencies": {"vue": "^3"}}'},
                topics=["react"],
            )
        )
        assert "Vue" in merged  # from actual dependency
        assert "React" in merged  # from topic


# ─── Code metrics ───────────────────────────────────────────────────────────


def _entry(path: str, size: int = 1000) -> dict[str, int | str]:
    return {"path": path, "size": size}


class TestCodeMetrics:
    def test_classification(self):
        manifest = [
            _entry("src/index.ts", 4000),
            _entry("src/app.py", 2000),
            _entry("tests/test_app.py", 1500),
            _entry("README.md", 800),
            _entry("package.json", 300),
            _entry("node_modules/left-pad/index.js", 99999),  # excluded
            _entry("vendor/lib.go", 99999),  # excluded
        ]
        metrics = code_metrics.compute_file_metrics(manifest)
        assert metrics.files == 5  # vendored excluded
        assert metrics.sourceFiles == 2
        assert metrics.testFiles == 1
        assert metrics.documentationFiles == 1
        # package.json matches the config patterns; vendor/ does not count
        assert metrics.configurationFiles == 1
        assert metrics.manifestFiles == 1
        assert metrics.linesOfCode > 0

    def test_empty_repo(self):
        metrics = code_metrics.compute_file_metrics([])
        assert metrics.files == 0
        assert metrics.linesOfCode == 0
        assert metrics.manifestTruncated is False


# ─── Complexity analyzer ────────────────────────────────────────────────────


class TestComplexityAnalyzer:
    def test_simple_repository(self):
        report = complexity_analyzer.analyze_complexity(
            metrics_files=5,
            metrics_source_files=3,
            manifest_paths=["main.py", "README.md"],
            technologies=["Flask"],
            has_tests=False,
            has_ci=False,
            has_docker=False,
            has_docs=True,
            total_size_bytes=5_000,
        )
        assert report.complexityScore < 40
        assert report.level in {"Minimal", "Simple"}

    def test_full_stack_repository_scores_higher(self):
        common = dict(
            metrics_files=180,
            metrics_source_files=120,
            manifest_paths=[f"src/mod{i}/file{i}.ts" for i in range(30)],
            technologies=[
                "React",
                "Express",
                "MongoDB",
                "Socket.IO",
                "JWT Auth",
                "Docker",
                "GitHub Actions",
                "Stripe",
                "Tailwind",
            ],
            has_tests=True,
            has_ci=True,
            has_docker=True,
            has_docs=True,
            total_size_bytes=2_000_000,
        )
        report = complexity_analyzer.analyze_complexity(**common)
        assert report.complexityScore > 70
        assert report.level in {"Advanced", "Complex"}
        factors = {f.factor for f in report.factors}
        assert "Architecture" in factors
        assert "Engineering practices" in factors

    def test_factors_explain_score(self):
        report = complexity_analyzer.analyze_complexity(
            metrics_files=40,
            metrics_source_files=30,
            manifest_paths=["src/a.ts", "src/b.ts"],
            technologies=["Express", "MongoDB", "JWT Auth"],
            has_tests=True,
            has_ci=False,
            has_docker=False,
            has_docs=True,
            total_size_bytes=100_000,
        )
        total_from_factors = sum(f.contribution for f in report.factors)
        assert total_from_factors <= report.complexityScore + 5  # rounding
        assert report.complexityScore >= total_from_factors - 5


# ─── Documentation analyzer ────────────────────────────────────────────────


class TestDocumentationAnalyzer:
    def test_missing_readme_is_not_zero(self):
        report = documentation_analyzer.analyze_documentation(readme_exists=False, readme_size=0)
        assert report.documentationScore is None  # data unavailable (§29)
        assert report.readmePresent is False
        assert report.notes

    def test_readme_with_sections_scores(self):
        body = (
            "# Project\n\n## Installation\npip install\n\n## Usage\nrun it\n\n"
            "## Architecture\nlayers\n\n## API\nendpoints\n\n## License\nMIT\n"
        )
        report = documentation_analyzer.analyze_documentation(
            readme_exists=True, readme_size=4_200, readme_body=body, has_description=True
        )
        assert report.documentationScore is not None and report.documentationScore >= 75
        assert {"Installation", "Usage", "Architecture", "API", "License"}.issubset(
            set(report.sectionsDetected)
        )

    def test_large_readme_caps_substance_points(self):
        report = documentation_analyzer.analyze_documentation(
            readme_exists=True, readme_size=99_999, readme_body="# x\n"
        )
        # Substance caps at 20 + base 40 - tiny-content penalty, no section points.
        assert report.documentationScore is not None and report.documentationScore <= 60


# ─── Testing analyzer ───────────────────────────────────────────────────────


class TestTestingAnalyzer:
    def test_no_tests_with_sources_is_low_not_missing(self):
        report = testing_analyzer.analyze_testing(
            test_files=[], source_files_count=50, technologies=[], ci_detected=False
        )
        assert report.testingScore == 0  # negative evidence
        assert report.sourceToTestRatio is None

    def test_tests_with_framework_and_ci(self):
        report = testing_analyzer.analyze_testing(
            test_files=["tests/test_app.py", "tests/test_api.py"],
            source_files_count=30,
            technologies=["pytest"],
            ci_detected=True,
            ci_runs_tests=True,
        )
        assert report.testingScore is not None and report.testingScore >= 70
        assert "pytest" in report.frameworks
        assert report.ciTestingDetected is True
        assert report.sourceToTestRatio == pytest.approx(2 / 30, abs=0.01)

    def test_no_data_at_all(self):
        report = testing_analyzer.analyze_testing(
            test_files=[], source_files_count=0, technologies=[], ci_detected=False
        )
        assert report.testingScore is None
        assert any("unavailable" in n for n in report.notes)


# ─── Behavior analyzer ──────────────────────────────────────────────────────


class TestBehaviorAnalyzer:
    def _commits(self, days: int, per_day: int = 1, hour: int = 10) -> list[dict[str, str]]:
        base = datetime(2026, 1, 1, hour, 0, tzinfo=UTC)
        return [
            {"committedAt": (base + timedelta(days=d)).isoformat()}
            for d in range(days)
            for _ in range(per_day)
        ]

    def test_factual_observations(self):
        report = analyze_behavior(self._commits(10, 3))
        assert report.totalCommits == 30
        assert report.activeDays == 10
        assert report.mostActiveHour == 10
        assert any("UTC" in o for o in report.observations)  # timezone context stated
        assert not any(
            "lazy" in o.lower() or "disciplined" in o.lower() for o in report.observations
        )

    def test_streak_and_gap(self):
        commits = self._commits(5) + [
            {"committedAt": "2026-03-01T10:00:00+00:00"}  # big gap after Jan 5
        ]
        report = analyze_behavior(commits)
        assert report.longestActivePeriodDays == 5
        assert report.longestInactiveGapDays >= 50

    def test_no_commits(self):
        report = analyze_behavior([])
        assert report.totalCommits == 0
        assert report.observations


# ─── Project pattern ────────────────────────────────────────────────────────


class TestProjectPattern:
    def test_full_stack(self):
        pattern = detect_project_pattern(
            languages=["TypeScript", "JavaScript"],
            technologies=["React", "Express", "MongoDB", "Socket.IO"],
            topics=["fullstack"],
            manifest_paths=["src/client/App.tsx", "src/server/index.ts"],
            has_tests=True,
        )
        assert pattern is not None
        assert pattern.projectType == "Full-stack Web Application"
        assert pattern.confidence >= 0.85
        assert pattern.evidence

    def test_backend_api(self):
        pattern = detect_project_pattern(
            languages=["Python"],
            technologies=["FastAPI", "MongoDB"],
            topics=["api"],
            manifest_paths=["app/main.py"],
            has_tests=False,
        )
        assert pattern is not None
        assert pattern.projectType == "Backend API / Service"

    def test_insufficient_evidence_returns_none(self):
        pattern = detect_project_pattern(
            languages=["HTML"], technologies=[], topics=[], manifest_paths=[], has_tests=False
        )
        assert pattern is None


# ─── Skill scoring & confidence ─────────────────────────────────────────────


def _analysis(
    repo_id: str,
    *,
    langs: dict[str, int] | None = None,
    techs: list[str] | None = None,
    testing_score: int | None = 60,
    readme: bool = True,
) -> RepositoryAnalysisDocument:
    from app.models.analysis_models import (
        ComplexityReport,
        DocumentationReport,
        TestingReport,
    )

    languages_raw = langs or {"Python": 800}
    total = sum(languages_raw.values())
    return RepositoryAnalysisDocument(
        repositoryId=repo_id,
        userId="u1",
        analysisVersion="1.0",
        analyzedAt="2026-09-01T00:00:00Z",
        sourceHash="x" * 64,
        fullName=f"octo/{repo_id}",
        languages=[
            {"name": n, "bytes": b, "percentage": round(100 * b / total, 1)}
            for n, b in languages_raw.items()
        ],
        technologies=techs or [],
        complexity=ComplexityReport(complexityScore=55, level="Moderate"),
        documentation=DocumentationReport(
            documentationScore=70 if readme else None,
            readmePresent=readme,
            readmeLength=4_000 if readme else 0,
        ),
        testing=TestingReport(testingScore=testing_score, testFiles=2, sourceFiles=10),
    )


class TestSkillScoring:
    def _shares(self) -> dict[str, float]:
        return {"Python": 60.0, "JavaScript": 40.0}

    def test_deterministic_output(self):
        now = datetime.now(UTC)
        analyses = [_analysis("r1"), _analysis("r2")]
        kwargs = dict(
            repo_ids=["r1", "r2"],
            all_language_shares=self._shares(),
            analyses=analyses,
            now=now,
        )
        first = score_skill("Python", **kwargs)
        second = score_skill("Python", **kwargs)
        assert first is not None and second is not None
        assert first.model_dump() == second.model_dump()

    def test_evidence_generated(self):
        scored = score_skill(
            "Python",
            repo_ids=["r1", "r2"],
            all_language_shares=self._shares(),
            analyses=[_analysis("r1"), _analysis("r2")],
            now=datetime.now(UTC),
        )
        assert scored is not None
        types = {e["type"] for e in scored.evidence}
        assert "repository" in types
        assert "code_volume" in types
        assert scored.score > 40

    def test_single_repo_low_share_limited_confidence(self):
        scored = score_skill(
            "Rust",
            repo_ids=["r9"],
            all_language_shares={"Rust": 3.0},
            analyses=[_analysis("r9", langs={"Rust": 30, "Go": 970})],
            now=datetime.now(UTC),
        )
        assert scored is not None
        assert scored.confidence <= 0.5
        assert confidence_band(scored.confidence) in {"limited evidence", "moderate evidence"}

    def test_missing_data_returns_none(self):
        assert (
            score_skill(
                "Python",
                repo_ids=[],
                all_language_shares={},
                analyses=[],
                now=datetime.now(UTC),
            )
            is None
        )
