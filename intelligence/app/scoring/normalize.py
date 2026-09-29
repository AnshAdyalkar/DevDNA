"""Normalization helpers.

Every score in DevDNA is derived from measurable signals and normalized
to 0-100 with a deterministic function, so identical input always
produces identical output (cache-friendly, test-friendly).
"""

from __future__ import annotations

import math


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> int:
    """Clamp a float into the inclusive score range and round to int."""
    return int(round(max(low, min(high, value))))


def log_scale(value: float, *, k: float, midpoint: float) -> float:
    """Saturating logarithmic curve: 0 at value=0, ->100 as value grows.

    `midpoint` is the value that maps to 50 points; `k` controls steepness.
    Used for counts (commits, stars, files) where raw linear scaling would
    let one huge number dominate.
    """
    if value <= 0:
        return 0.0
    return 100.0 * (math.log1p(value) / (math.log1p(value) + math.log1p(midpoint / k)))


def weighted_average(parts: list[tuple[float, float]]) -> float:
    """Weighted average of (value, weight) pairs. Weights of 0 are skipped."""
    total_weight = sum(w for _, w in parts if w > 0)
    if total_weight <= 0:
        return 0.0
    return sum(v * w for v, w in parts if w > 0) / total_weight


def share_of(value: int, total: int) -> float:
    """Fraction value/total as 0..1, safe against division by zero."""
    if total <= 0:
        return 0.0
    return min(1.0, value / total)
