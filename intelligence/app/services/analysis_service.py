"""Analysis orchestrator (§5, §21, §36).

Pipeline per user:
  load repositories → fingerprint each (sourceHash) → skip unchanged
  (cached analysis) → run analyzers → persist RepositoryAnalysis docs →
  build DeveloperProfile → persist.

Deterministic; the fingerprint means unchanged repositories are never
re-analyzed (incremental analysis).
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import UTC, datetime
from typing import Any

from ..analyzers import (
    code_metrics as _code_metrics,
)
from ..analyzers import (
    complexity_analyzer,
    documentation_analyzer,
    testing_analyzer,
)
from ..analyzers.language_analyzer import normalize_languages
from ..analyzers.project_pattern_analyzer import detect_project_pattern
from ..analyzers.technology_analyzer import detect_technologies, merge_technologies
from ..config import get_settings
from ..dna.dna_engine import build_developer_profile
from ..models.analysis_models import (
    RepositoryAnalysisDocument,
)
from . import mongodb

logger = logging.getLogger("devdna.intelligence")


class AnalysisError(Exception):
    """Raised with a user-facing message when analysis cannot proceed."""


def _fingerprint(repo: dict[str, Any]) -> str:
    """Stable fingerprint of the synchronized data feeding analysis (§20)."""
    payload = json.dumps(
        {
            "languages": repo.get("languages", {}),
            "manifest": repo.get("fileManifest", []),
            "manifestTruncated": repo.get("fileManifestTruncated", False),
            "topics": repo.get("topics", []),
            "readme": [
                repo.get("readmeExists"),
                repo.get("readmeSize"),
                str(repo.get("readmeHash")),
            ],
            "pushedAt": str(repo.get("pushedAt")),
            "githubUpdatedAt": str(repo.get("githubUpdatedAt")),
        },
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _repo_source_hash_id(repo: dict[str, Any]) -> str:
    return str(repo["_id"])


async def analyze_user(user_id: str) -> dict[str, Any]:
    """Run the full intelligence pipeline for one user. Returns a summary."""
    settings = get_settings()
    now = datetime.now(UTC)

    if not await mongodb.user_exists(user_id):
        raise AnalysisError("User not found")

    repos = await mongodb.load_repositories(user_id)
    # §29: never manufacture intelligence from nothing.
    analyzable = [r for r in repos if not r.get("disabled")]
    if not analyzable:
        raise AnalysisError("Not enough data for analysis — no repositories are synchronized")

    logger.info(
        "[INTELLIGENCE] Analysis started",
        extra={"userId": user_id, "repositories": len(analyzable)},
    )

    analyses: list[RepositoryAnalysisDocument] = []
    cached_count = 0
    analyzed_count = 0

    for repo in analyzable:
        repo_id = _repo_source_hash_id(repo)
        source_hash = _fingerprint(repo)

        # ── Incremental: reuse cached analysis for unchanged repos (§21) ──
        cached = await mongodb.load_cached_analysis(repo_id, source_hash, settings.analysis_version)
        if cached:
            cached_count += 1
            try:
                analyses.append(RepositoryAnalysisDocument.model_validate(cached["document"]))
                continue
            except Exception:  # corrupted cache → re-analyze
                logger.warning("Cached analysis unusable — re-analyzing", extra={"repoId": repo_id})

        logger.info(
            "[INTELLIGENCE] Repository analysis started", extra={"repo": repo.get("fullName")}
        )

        manifest = repo.get("fileManifest", []) or []
        truncated = bool(repo.get("fileManifestTruncated", False))
        languages_raw = {
            k: int(v)
            for k, v in (repo.get("languages") or {}).items()
            if isinstance(v, (int, float))
        }
        topics = repo.get("topics", []) or []
        has_ci = any(
            p.startswith(".github/workflows") for p in (entry.get("path", "") for entry in manifest)
        )

        # ── Analyzers ──────────────────────────────────────────────────
        language_shares = normalize_languages(languages_raw)
        tech_by_source = detect_technologies(
            manifest_paths=[entry.get("path", "") for entry in manifest],
            topics=topics,
            languages=list(languages_raw.keys()),
        )
        technologies = merge_technologies(tech_by_source)
        metrics = _code_metrics.compute_file_metrics(manifest, truncated=truncated)

        manifest_paths = [entry.get("path", "") for entry in manifest]
        complexity = complexity_analyzer.analyze_complexity(
            metrics_files=metrics.files,
            metrics_source_files=metrics.sourceFiles,
            manifest_paths=manifest_paths,
            technologies=technologies,
            has_tests=metrics.testFiles > 0,
            has_ci=has_ci,
            has_docker="Docker" in technologies,
            has_docs=bool(repo.get("readmeExists")),
            total_size_bytes=sum(int(entry.get("size", 0)) for entry in manifest),
        )
        documentation = documentation_analyzer.analyze_documentation(
            readme_exists=bool(repo.get("readmeExists")),
            readme_size=int(repo.get("readmeSize") or 0),
            license_known=bool(repo.get("license")),
            has_description=bool(repo.get("description")),
        )
        test_paths = [
            entry.get("path", "") for entry in manifest if _is_test(entry.get("path", ""))
        ]
        source_count = sum(
            1
            for entry in manifest
            if str(entry.get("path", "")).rsplit(".", 1)[-1].lower()
            in {
                "ts",
                "tsx",
                "js",
                "jsx",
                "py",
                "go",
                "rb",
                "java",
                "rs",
                "c",
                "cpp",
                "cs",
                "php",
                "kt",
                "swift",
            }
            and not _is_test(str(entry.get("path", "")))
        )
        testing = testing_analyzer.analyze_testing(
            test_files=test_paths,
            source_files_count=source_count,
            technologies=technologies,
            ci_detected=has_ci,
            ci_runs_tests=has_ci,
        )
        pattern = detect_project_pattern(
            languages=list(languages_raw.keys()),
            technologies=technologies,
            topics=topics,
            manifest_paths=manifest_paths,
            has_tests=metrics.testFiles > 0,
            is_fork=bool(repo.get("fork")),
        )

        doc = RepositoryAnalysisDocument(
            repositoryId=repo_id,
            userId=user_id,
            analysisVersion=settings.analysis_version,
            analyzedAt=now.isoformat(),
            sourceHash=source_hash,
            fullName=repo.get("fullName", ""),
            primaryLanguage=repo.get("primaryLanguage"),
            languages=language_shares,
            technologies=technologies,
            metrics=metrics,
            complexity=complexity,
            documentation=documentation,
            testing=testing,
            projectType=pattern,
            architectureSignals=[
                *(
                    {"Frontend framework"}
                    if {"react", "next.js", "vue", "angular"} & {t.lower() for t in technologies}
                    else set()
                ),
                *(
                    {"Backend framework"}
                    if {"express", "fastapi", "django", "flask"} & {t.lower() for t in technologies}
                    else set()
                ),
                *(
                    {"Database"}
                    if {"mongodb", "postgresql", "mysql", "redis"}
                    & {t.lower() for t in technologies}
                    else set()
                ),
                *({"Real-time"} if "socket.io" in {t.lower() for t in technologies} else set()),
                *({"Containerized"} if "docker" in {t.lower() for t in technologies} else set()),
                *({"CI/CD"} if has_ci else set()),
            ],
        )
        doc.pushedAt = str(repo.get("pushedAt"))
        doc.isFork = bool(repo.get("fork"))
        doc.isArchived = bool(repo.get("archived"))

        await mongodb.save_repository_analysis(doc.model_dump())
        analyses.append(doc)
        analyzed_count += 1
        logger.info(
            "[INTELLIGENCE] Repository analysis completed", extra={"repo": repo.get("fullName")}
        )

    # ── Developer-level aggregation ────────────────────────────────────
    commits = await mongodb.load_commits(user_id)
    profile = build_developer_profile(
        user_id=user_id,
        analyses=analyses,
        commits=[{"committedAt": str(c.get("committedAt"))} for c in commits],
        analysis_version=settings.analysis_version,
    )
    if profile is None:
        raise AnalysisError("Not enough data for analysis")

    await mongodb.save_developer_profile(profile.model_dump())
    logger.info(
        "[INTELLIGENCE] DNA calculation completed",
        extra={
            "userId": user_id,
            "skills": len(profile.skills),
        },
    )

    return {
        "userId": user_id,
        "status": "completed",
        "repositoriesAnalyzed": len(analyses),
        "repositoriesReanalyzed": analyzed_count,
        "repositoriesCached": cached_count,
        "skillsDetected": len(profile.skills),
        "analysisVersion": settings.analysis_version,
        "analyzedAt": profile.analyzedAt,
    }


def _is_test(path: str) -> bool:
    from ..utils.technology_utils import TEST_FILE_PATTERNS

    return bool(TEST_FILE_PATTERNS.search(path))
