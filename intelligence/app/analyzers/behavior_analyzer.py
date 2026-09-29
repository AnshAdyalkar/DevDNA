"""Development behavior analysis from commit timestamps (§13).

Reports factual observations only — never psychological traits. Timestamps
are analyzed in whatever timezone context is stored in MongoDB (UTC from the
GitHub API); this is stated explicitly in the observations.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from ..models.analysis_models import BehaviorReport

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def analyze_behavior(
    commits: list[dict[str, str]], *, repositories_touched: int = 0
) -> BehaviorReport:
    """`commits` items: {"committedAt": ISO-8601} from Phase 3 commit records."""
    if not commits:
        return BehaviorReport(
            observations=["No commit data available — behavior analysis skipped."]
        )

    dates: list[datetime] = []
    for c in commits:
        raw = c.get("committedAt")
        if not raw:
            continue
        try:
            value = (
                raw
                if isinstance(raw, datetime)
                else datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
            )
        except ValueError:
            continue
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        dates.append(value)

    if not dates:
        return BehaviorReport(
            observations=["No parsable commit timestamps — behavior analysis skipped."]
        )

    dates.sort()
    days = {d.date() for d in dates}
    weeks = {(d.isocalendar()[0], d.isocalendar()[1]) for d in dates}
    months = {(d.year, d.month) for d in dates}
    hours = [d.hour for d in dates]
    weekday_counts: dict[int, int] = {}
    for d in dates:
        weekday_counts[d.weekday()] = weekday_counts.get(d.weekday(), 0) + 1

    # Longest active streak & largest gap (day granularity)
    day_list = sorted(days)
    longest_streak = 1
    streak = 1
    largest_gap = 0
    for i in range(1, len(day_list)):
        delta = (day_list[i] - day_list[i - 1]).days
        if delta == 1:
            streak += 1
            longest_streak = max(longest_streak, streak)
        else:
            streak = 1
            largest_gap = max(largest_gap, delta - 1)

    observations: list[str] = [
        (
            f"{len(dates)} recorded commits across {len(weeks)} active weeks "
            f"and {len(months)} active months."
        ),
        (
            f"Most recorded commits occurred on "
            f"{DAY_NAMES[max(weekday_counts, key=lambda d: weekday_counts[d])]}s."
        ),
    ]
    if hours:
        bucket = sum(hours) // len(hours)
        observations.append(
            f"Average commit time-of-day ≈ {bucket:02d}:00 "
            "(timestamps analyzed in UTC as stored by the GitHub API)."
        )
        peak_hour = max(set(hours), key=hours.count)
        observations.append(f"Single most common commit hour: {peak_hour:02d}:00.")
    weekend = sum(1 for d in dates if d.weekday() >= 5)
    if dates:
        ratio = weekend / len(dates)
        if ratio > 0.25:
            observations.append(f"{ratio:.0%} of commits fall on weekends.")

    return BehaviorReport(
        totalCommits=len(dates),
        activeDays=len(days),
        activeWeeks=len(weeks),
        activeMonths=len(months),
        averageCommitsPerActiveWeek=round(len(dates) / max(1, len(weeks)), 1),
        longestActivePeriodDays=longest_streak,
        longestInactiveGapDays=largest_gap,
        mostActiveDay=DAY_NAMES[max(weekday_counts, key=lambda d: weekday_counts[d])],
        mostActiveHour=max(set(hours), key=lambda h: hours.count(h)) if hours else None,
        repositoriesTouched=repositories_touched,
        observations=observations,
    )


def analysis_window_days(dates: list[datetime]) -> int:
    """Span of the commit history in days (helper for summary metrics)."""
    if not dates:
        return 0
    span = max(dates) - min(dates)
    return max(1, span.days + 1)


_ = timedelta  # keep import used for typing parity
