"""Static code metrics from the file manifest (§9).

Counts and size-based estimates ONLY. No repository code is executed and no
repository contents are fetched beyond what Phase 3 already stored (paths +
sizes). LOC is an explicit estimate (~18 bytes/line) and labeled as such.
"""

from __future__ import annotations

from ..models.analysis_models import FileMetrics
from ..utils.technology_utils import classify_files, line_count_estimate


def compute_file_metrics(
    manifest: list[dict[str, int | str]],
    *,
    truncated: bool = False,
) -> FileMetrics:
    """Classify the manifest and derive static metrics."""
    facts = classify_files(manifest)
    return FileMetrics(
        files=len(facts.all_files),
        sourceFiles=len(facts.source_files),
        testFiles=len(facts.test_files),
        documentationFiles=len(facts.documentation_files),
        configurationFiles=len(facts.configuration_files),
        manifestFiles=len(facts.manifest_files),
        linesOfCode=line_count_estimate(facts.total_size_bytes),
        largeFiles=facts.large_files,
        manifestTruncated=truncated,
    )
