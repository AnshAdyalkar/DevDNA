"""Technology detection from multiple evidence sources (§8).

Sources, in decreasing reliability:
1. Dependency manifests (package.json, requirements.txt, pyproject.toml, …)
2. Infrastructure/config file paths (Dockerfile, .github/workflows, …)
3. GitHub topics (curated mapping)
4. GitHub language metadata

For Phase 4 the engine reads the file manifest (paths) collected by the
Node sync; manifest *contents* (package.json bodies) are fetched by Node
and passed in `extra_evidence` when available. No repository code is
executed — ever (§9, §30).
"""

from __future__ import annotations

import json
import re

from ..utils.technology_utils import (
    NPM_TECHNOLOGIES,
    OTHER_MANIFESTS,
    PYTHON_TECHNOLOGIES,
    TOPIC_TECHNOLOGIES,
    detect_from_manifest_files,
)

_VAR_NAME = re.compile(r"[A-Za-z0-9_.-]+")


def _techs_from_dependency_body(base_name: str, body: str) -> set[str]:
    """Parse dependency declarations from known manifest formats (static)."""
    found: set[str] = set()
    lowered = body.lower()
    if base_name == "package.json":
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            data = {}
        deps: dict[str, str] = {}
        for key in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
            section = data.get(key)
            if isinstance(section, dict):
                deps.update(section)
        for dep in deps:
            tech = NPM_TECHNOLOGIES.get(dep.lower())
            if tech:
                found.add(tech)
    elif base_name.startswith("requirements") or base_name in {"pyproject.toml", "Pipfile"}:
        # Match line-start package names; pyproject uses `dependencies = [...]`
        for dep in PYTHON_TECHNOLOGIES:
            if (
                re.search(rf"(?mi)^\s*[-A-Za-z\"']*{re.escape(dep)}\b", body)
                or f'"{dep}"' in lowered
            ):
                found.add(PYTHON_TECHNOLOGIES[dep])
    elif base_name in OTHER_MANIFESTS:
        mapping = OTHER_MANIFESTS[base_name]
        for token, tech in mapping.items():
            if token.lower() in lowered:
                found.add(tech)
    return found


def detect_technologies(
    *,
    manifest_paths: list[str],
    manifest_bodies: dict[str, str] | None = None,
    topics: list[str] | None = None,
    languages: list[str] | None = None,
) -> dict[str, list[str]]:
    """Detect technologies and return them grouped by evidence source.

    Deterministic and extensible: the vocabularies live in
    `utils/technology_utils.py` — add entries, not code.
    """
    bodies = manifest_bodies or {}
    by_source: dict[str, set[str]] = {
        "dependencies": set(),
        "config_files": set(),
        "topics": set(),
        "languages": set(),
    }

    for path in manifest_paths:
        base = path.rsplit("/", 1)[-1]
        if (
            base
            in {
                "package.json",
                "requirements.txt",
                "requirements-dev.txt",
                "pyproject.toml",
                "Pipfile",
            }
            or base in OTHER_MANIFESTS
        ):
            body = bodies.get(path, "")
            if body:
                by_source["dependencies"] |= _techs_from_dependency_body(base, body)

    by_source["config_files"] |= detect_from_manifest_files(manifest_paths)

    for topic in topics or []:
        tech = TOPIC_TECHNOLOGIES.get(topic.strip().lower())
        if tech:
            by_source["topics"].add(tech)

    # Language metadata contributes only where a language is itself a stack
    for language in languages or []:
        lowered = language.lower()
        if lowered in {"javascript"}:
            by_source["languages"].add("JavaScript")
        elif lowered in {"typescript"}:
            by_source["languages"].add("TypeScript")
        elif lowered in {"shell"}:
            by_source["languages"].add("Shell")

    return {source: sorted(techs) for source, techs in by_source.items()}


def merge_technologies(grouped: dict[str, list[str]]) -> list[str]:
    """Union across sources, dependency evidence first (highest trust)."""
    ordered: list[str] = []
    for source in ("dependencies", "config_files", "topics", "languages"):
        for tech in grouped.get(source, []):
            if tech not in ordered:
                ordered.append(tech)
    return ordered
