"""Language analysis over real GitHub language byte counts (§7).

Deterministic aggregation of Phase 3 `Repository.languages` maps.
Percentages are normalized so they total ~100 at both repository and
developer level.
"""

from __future__ import annotations

from ..models.analysis_models import LanguageShare


def normalize_languages(raw: dict[str, int]) -> list[LanguageShare]:
    """Language byte counts → normalized shares, largest first."""
    total = sum(v for v in raw.values() if v > 0)
    if total <= 0:
        return []
    shares = [
        LanguageShare(
            name=name,
            bytes=int(value),
            percentage=round(100.0 * value / total, 1),
        )
        for name, value in sorted(raw.items(), key=lambda kv: -kv[1])
        if value > 0
    ]
    # Re-normalize rounding drift onto the largest share so totals ≈ 100.
    drift = round(100.0 - sum(s.percentage for s in shares), 1)
    if drift and shares:
        shares[0].percentage = round(shares[0].percentage + drift, 1)
    return shares


def aggregate_developer_languages(
    per_repo: list[dict[str, int]],
) -> list[LanguageShare]:
    """Sum language bytes across repositories (double counting is not a
    concern: each repo is measured once by GitHub; forks flagged separately)."""
    combined: dict[str, int] = {}
    for languages in per_repo:
        for name, value in languages.items():
            combined[name] = combined.get(name, 0) + int(value)
    return normalize_languages(combined)


def language_diversity(shares: list[LanguageShare]) -> float:
    """Normalized Herfindahl diversity: 1.0 = many equal languages,
    ~0.0 = single language. Deterministic."""
    if len(shares) <= 1:
        return 0.0 if not shares else 0.0
    hhi = sum((s.percentage / 100.0) ** 2 for s in shares)
    # HHI in [1/len, 1]; normalize so uniform distribution → 1.0
    n = len(shares)
    uniform = 1.0 / n
    if hhi <= uniform:
        return 1.0
    return round(max(0.0, (1.0 - hhi) / (1.0 - uniform)), 3)
