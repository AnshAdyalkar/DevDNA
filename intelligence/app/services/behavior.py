"""Coding-behavior analytics.

Uses only commit timestamps and repository names — never content. All
descriptions are neutral facts ("most activity between 7 PM and 11 PM"),
not personality claims. Deterministic: same commits, same numbers.
"""

from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime

from ..api.models.schemas import (
    BehaviorAnalysis,
    BehaviorAnalysisRequest,
    BehaviorHourHistogram,
)
from ..scoring.normalize import clamp

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _parse_dt(raw: str) -> datetime | None:
    """Parse an ISO timestamp; naive timestamps are assumed UTC."""
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt


def _active_periods(dates: list[datetime]) -> tuple[set, set, set]:
    """Return (active day-ids, active ISO weeks, active months)."""
    days: set = set()
    weeks: set = set()
    months: set = set()
    for d in dates:
        iso = d.isocalendar()
        days.add(d.date())
        weeks.add((iso.year, iso.week))
        months.add((d.year, d.month))
    return days, weeks, months


def _longest_streak(days: set) -> int:
    """Longest run of consecutive active days."""
    if not days:
        return 0
    ordered = sorted(days)
    best = 1
    current = 1
    for prev, curr in zip(ordered, ordered[1:], strict=False):
        delta = (curr - prev).days
        current = current + 1 if delta == 1 else 1
        best = max(best, current)
    return best


def _longest_gap(days: set) -> int:
    """Longest stretch of days with zero commits between first and last activity."""
    ordered = sorted(days)
    if len(ordered) < 2:
        return 0
    return max((b - a).days for a, b in zip(ordered, ordered[1:], strict=False))


def consistency_score(
    *,
    active_weeks: int,
    total_commits: int,
    repo_count: int,
    observed_days: int,
    commits_per_active_week: float,
) -> tuple[int, list[str]]:
    """Consistency = regularity of contribution, 0-100, fully explained.

    Components (weights sum to 1):
      - active-week density: share of observed weeks with any commit
      - cadence: commits per active week (log-scaled)
      - breadth: distinct repositories touched
      - sustained activity: total observed span
    """
    breakdown: list[str] = []

    density = min(1.0, active_weeks / 12.0)  # 12 active weeks saturates
    cadence = min(1.0, (commits_per_active_week / 8.0))  # 8+/week saturates
    breadth = min(1.0, repo_count / 5.0)
    span = min(1.0, observed_days / 180.0)  # 6 months observed saturates

    score = 45 * density + 25 * cadence + 15 * breadth + 15 * span

    breakdown.append(f"{active_weeks} active weeks (density {density:.2f})")
    breakdown.append(f"{commits_per_active_week:.1f} commits per active week")
    breakdown.append(f"{repo_count} repositories touched")
    breakdown.append(f"{observed_days} days of observed activity")
    return clamp(score), breakdown


def analyze(payload: BehaviorAnalysisRequest) -> BehaviorAnalysis:
    """Compute behavior analytics from commit activity points."""
    dates: list[datetime] = []
    for point in payload.commits:
        dt = _parse_dt(point.date)
        if dt is None:
            continue
        dates.extend([dt] * point.commits)

    if not dates:
        return BehaviorAnalysis(
            total_commits=0,
            active_days=0,
            active_weeks=0,
            active_months=0,
            longest_active_streak_days=0,
            longest_inactive_gap_days=0,
            most_productive_day="—",
            most_active_hour=0,
            weekly_histogram=[BehaviorHourHistogram(hour=h, commits=0) for h in range(24)],
            weekend_commit_ratio=0.0,
            consistency_score=0,
            consistency_breakdown=["No commit activity available yet"],
        )

    dates.sort()
    days, weeks, months = _active_periods(dates)

    day_counts = Counter(d.weekday() for d in dates)
    hour_counts = Counter(d.hour for d in dates)
    most_productive_day = DAY_NAMES[day_counts.most_common(1)[0][0]]
    most_active_hour = hour_counts.most_common(1)[0][0]

    weekend_commits = sum(c for wd, c in day_counts.items() if wd >= 5)
    weekend_ratio = weekend_commits / len(dates)

    histogram = [BehaviorHourHistogram(hour=h, commits=hour_counts.get(h, 0)) for h in range(24)]

    total = len(dates)
    repo_count = max(1, len(payload.repositories))
    observed_days = (dates[-1].date() - dates[0].date()).days + 1
    per_week = total / len(weeks) if weeks else 0.0

    consistency, breakdown = consistency_score(
        active_weeks=len(weeks),
        total_commits=total,
        repo_count=repo_count,
        observed_days=observed_days,
        commits_per_active_week=per_week,
    )

    return BehaviorAnalysis(
        total_commits=total,
        active_days=len(days),
        active_weeks=len(weeks),
        active_months=len(months),
        longest_active_streak_days=_longest_streak(days),
        longest_inactive_gap_days=_longest_gap(days),
        most_productive_day=most_productive_day,
        most_active_hour=most_active_hour,
        weekly_histogram=histogram,
        weekend_commit_ratio=round(weekend_ratio, 3),
        consistency_score=consistency,
        consistency_breakdown=breakdown,
    )
