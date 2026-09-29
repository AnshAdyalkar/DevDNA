"""Developer DNA skill scoring (§15-§17).

Deterministic rules documented in docs/dna-algorithm.md. Every skill score
is a weighted combination of measurable inputs; every score carries typed
evidence; confidence reflects evidence quantity/diversity — not skill level.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone

from ..models.analysis_models import (
    RepositoryAnalysisDocument,
    SkillWithEvidence,
)

# Points available per component (sums to 100, docs/dna-algorithm.md §Score)
W_USAGE = 35.0  # share of the developer's measured codebase
W_REPOS = 25.0  # repository breadth (log-scaled)
W_DEPTH = 20.0  # ecosystem depth: frameworks/infra using this skill
W_QUALITY = 10.0  # tested & documented usage
W_RECENCY = 10.0  # repositories pushed recently

RECENCY_DAYS = 180


def _log_pts(value: float, midpoint: float, max_pts: float) -> float:  # noqa: UP047
    """Saturating log curve: 0 at 0, max_pts at ≥ ~8× midpoint."""
    if value <= 0:
        return 0.0
    return max_pts * min(1.0, math.log2(value + 1) / math.log2(midpoint * 8 + 1))


def score_skill(
    skill: str,
    *,
    repo_ids: list[str],
    all_language_shares: dict[str, float],
    analyses: list[RepositoryAnalysisDocument],
    now: datetime,
) -> SkillWithEvidence | None:
    """Score one skill (language or technology) from repository analyses.

    `repo_ids` are the repositories where the skill was detected;
    `all_language_shares` maps language → percentage of the total codebase.
    """
    repo_count = len(repo_ids)
    if repo_count == 0:
        return None

    evidence: list[dict[str, str]] = []
    flagged = [a for a in analyses if str(a.repositoryId) in set(repo_ids)]

    # 1) Usage volume (languages only)
    share = all_language_shares.get(skill, 0.0)
    usage_pts = W_USAGE * min(1.0, share / 60.0)  # ≥60% of codebase saturates
    if share > 0:
        evidence.append(
            {"type": "code_volume", "value": f"{skill} represents {share:.0f}% of measured code"}
        )

    # 2) Repository breadth
    breadth_pts = _log_pts(repo_count, midpoint=5, max_pts=W_REPOS)
    evidence.append(
        {
            "type": "repository",
            "value": f"detected in {repo_count} repositor{'y' if repo_count == 1 else 'ies'}",
        }
    )

    # 3) Ecosystem depth — related technologies detected in the same repos
    related: set[str] = set()
    for a in flagged:
        related.update(a.technologies)
    related.discard(skill)
    depth_pts = min(W_DEPTH, 4.0 * len(related))
    if related:
        evidence.append(
            {"type": "technology", "value": f"used alongside {', '.join(sorted(related)[:6])}"}
        )

    # 4) Quality — tested & documented usage
    tested = sum(1 for a in flagged if (a.testing.testingScore or 0) >= 40)
    documented = sum(1 for a in flagged if a.documentation.readmePresent)
    quality_pts = 0.0
    if flagged:
        quality_pts += W_QUALITY * 0.6 * (tested / len(flagged))
        quality_pts += W_QUALITY * 0.4 * (documented / len(flagged))
    if tested:
        evidence.append(
            {"type": "testing", "value": f"{tested} of {len(flagged)} repositories have tests"}
        )
    if documented:
        evidence.append(
            {
                "type": "documentation",
                "value": f"{documented} of {len(flagged)} repositories have a README",
            }
        )

    # 5) Recency
    recent = 0
    for a in flagged:
        pushed = getattr(a, "pushedAt", None)
        if pushed:
            try:
                from datetime import datetime

                pushed_at = (
                    pushed
                    if isinstance(pushed, datetime)
                    else datetime.fromisoformat(str(pushed).replace("Z", "+00:00"))
                )
                if pushed_at.tzinfo is None:
                    # BSON dates arrive naive (UTC by definition); make both
                    # sides comparable so subtraction cannot raise.
                    pushed_at = pushed_at.replace(tzinfo=timezone.utc)
                if (now - pushed_at).days <= RECENCY_DAYS:
                    recent += 1
            except ValueError:
                continue
    recency_pts = W_RECENCY * min(1.0, recent / max(1, min(3, repo_count)))
    if recent:
        months_text = RECENCY_DAYS // 30
        evidence.append(
            {
                "type": "activity",
                "value": (
                    f"{recent} repositor{'y' if recent == 1 else 'ies'} "
                    f"pushed in the last {months_text} months"
                ),
            }
        )

    score = round(min(100.0, usage_pts + breadth_pts + depth_pts + quality_pts + recency_pts))

    # Confidence: evidence diversity & volume (NOT skill level, §17)
    confidence = min(
        0.95,
        0.30
        + 0.12 * min(repo_count, 5) / 5  # breadth
        + 0.03 * len(evidence)  # evidence count
        + (0.08 if len(related) >= 2 else 0.0)  # ecosystem corroboration
        + (0.05 if tested else 0.0),
    )
    if repo_count == 1 and share < 5:
        confidence = min(confidence, 0.5)  # single mention ≠ expertise (§6)

    return SkillWithEvidence(
        skill=skill,
        score=score,
        confidence=round(confidence, 2),
        evidence=evidence,
        updatedAt=now.isoformat(),
    )


def confidence_band(confidence: float) -> str:
    """Human-readable band (§17)."""
    if confidence >= 0.9:
        return "strong evidence"
    if confidence >= 0.7:
        return "good evidence"
    if confidence >= 0.5:
        return "moderate evidence"
    return "limited evidence"
