"""Skill-gap engine (§3-§5, §26, §36).

Compares the stored Developer DNA (Phase 4) against a target role's
required-skill matrix and produces typed, evidence-backed gaps:

  demonstrated      — the skill is present but below the role's bar
  limited_evidence  — present but with low confidence; the gap is provisional
  not_detected      — no evidence at all (never scored as a fake zero, §36)

Priority is a documented, deterministic formula — never random (§5, §33).
"""

from __future__ import annotations

from typing import Any

from .dependency_graph import prerequisites_of, unlocked_by
from .models import PRIO_W_EVIDENCE, PRIO_W_GAP, PRIO_W_IMPORTANCE, SkillGapEntry, SkillGapsDocument
from .role_matrix import get_role_matrix

# Role-matrix skills that aggregate several detectable technologies.
# The demonstrated score is the strongest matching skill — "Database" is
# demonstrated by whichever database the developer actually uses.
SKILL_ALIASES: dict[str, list[str]] = {
    "Database": ["MongoDB", "PostgreSQL", "MySQL", "Redis", "SQLite", "Mongoose"],
    "API Development": [
        "Express",
        "FastAPI",
        "Django",
        "Flask",
        "Socket.IO",
        "GraphQL",
        "REST API",
    ],
    "Testing": ["Jest", "Pytest", "Vitest", "Mocha", "Cypress", "Playwright", "Testing Library"],
    "CI/CD": ["GitHub Actions", "CI/CD", "Jenkins", "Travis CI", "CircleCI"],
    "Machine Learning": ["Scikit-learn", "TensorFlow", "PyTorch", "Keras"],
    "Data Visualization": ["Chart.js", "D3", "Recharts", "Matplotlib", "Seaborn"],
    "CSS": ["Tailwind", "Bootstrap", "Sass", "CSS"],
    "HTML": ["HTML"],
}

# Confidence below this ⇒ "limited evidence" (§4): the gap is provisional.
LIMITED_EVIDENCE_CONFIDENCE = 0.5

# Priority bands for the 0-1 priority score (§5).
PRIORITY_HIGH = 0.5
PRIORITY_MEDIUM = 0.3


def _find_demonstrated(skill: str, skills: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Strongest DNA skill matching a role skill (direct or alias)."""
    names = {skill.lower(), *(a.lower() for a in SKILL_ALIASES.get(skill, []))}
    best: dict[str, Any] | None = None
    for entry in skills:
        if str(entry.get("skill", "")).lower() in names and (
            best is None or float(entry.get("score") or 0) > float(best.get("score") or 0)
        ):
            best = entry
    return best


def _inferred_level(skill: str, skills: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Infer an implicit current level from demonstrated dependents (§26).

    A developer with React 88 demonstrably knows JavaScript — recommending
    "JavaScript fundamentals" to them would violate §26/§27. If a role
    skill was not directly detected but skills that build on it ARE
    demonstrated, the current level is the strongest dependent's score
    (you cannot build the dependent without the prerequisite), with a
    small confidence discount and an explicit inference evidence line.
    """
    dependents = unlocked_by(skill)
    best: dict[str, Any] | None = None
    best_dep: str | None = None
    for entry in skills:
        name = str(entry.get("skill", ""))
        if name in dependents and (
            best is None or float(entry.get("score") or 0) > float(best.get("score") or 0)
        ):
            best = entry
            best_dep = name
    if best is None or best_dep is None:
        return None
    score = int(float(best.get("score") or 0))
    confidence = max(0.0, float(best.get("confidence") or 0.0) - 0.05)
    return {
        "skill": skill,
        "score": score,
        "confidence": confidence,
        "evidence": [
            {
                "type": "inference",
                "value": f"inferred from your demonstrated {best_dep} work "
                f"(score {score}) — {best_dep} builds on {skill}",
            }
        ],
    }


def _evidence_lines(
    skill: str, demonstrated: dict[str, Any] | None, profile: dict[str, Any]
) -> list[str]:
    """Human-readable evidence explaining the gap (§4)."""
    lines: list[str] = []
    if demonstrated is None:
        lines.append(
            f"No evidence of {skill} found in your synchronized repositories — "
            "insufficient evidence to score it (§36: absence is not scored as zero)."
        )
        return lines

    for item in demonstrated.get("evidence") or []:
        value = str(item.get("value", "")).strip() if isinstance(item, dict) else str(item)
        if value:
            lines.append(value[0].upper() + value[1:])

    practices = profile.get("engineeringPractices") or {}
    if skill == "Testing":
        avg = practices.get("averageTestingScore")
        if avg is None:
            lines.append("No testing scores available — limited CI/test evidence in repositories")
        elif float(avg) < 50:
            lines.append(f"Average testing score across repositories is low ({avg}/100)")
    if skill == "CI/CD":
        ci = practices.get("repositoriesWithCi") or 0
        lines.append(f"CI configuration detected in {ci} repositor{'y' if ci == 1 else 'ies'}")

    confidence = float(demonstrated.get("confidence") or 0)
    if confidence < LIMITED_EVIDENCE_CONFIDENCE:
        lines.append("Limited GitHub evidence — some skill assessments have low confidence (§36)")
    return lines


def _priority_score(
    *, gap: int, required: int, importance: float, demonstrated: dict[str, Any] | None
) -> float:
    """Deterministic priority in [0, 1] (§5, documented in docs/growth-engine.md).

    priority = 0.5·(gap / required) + 0.3·(role importance) + 0.2·(evidence deficit)
    Evidence deficit is 1.0 when the skill is not detected at all, else
    (1 − confidence) of the demonstrated skill.
    """
    gap_ratio = min(1.0, gap / required) if required > 0 else 0.0
    if demonstrated is None:
        evidence_deficit = 1.0
    else:
        evidence_deficit = 1.0 - float(demonstrated.get("confidence") or 0.0)
    return round(
        PRIO_W_GAP * gap_ratio
        + PRIO_W_IMPORTANCE * importance
        + PRIO_W_EVIDENCE * evidence_deficit,
        4,
    )


def _priority_band(score: float) -> str:
    if score >= PRIORITY_HIGH:
        return "HIGH"
    if score >= PRIORITY_MEDIUM:
        return "MEDIUM"
    return "LOW"


def compute_skill_gaps(
    profile: dict[str, Any], target_role: str, analysis_version: str, generated_at: str
) -> SkillGapsDocument:
    """Compare Developer DNA against the role matrix; returns stored gaps doc."""
    matrix = get_role_matrix(target_role)
    dna_skills: list[dict[str, Any]] = list(profile.get("skills") or [])

    gaps: list[SkillGapEntry] = []
    strengths: list[str] = []
    limited: list[str] = []

    for required_skill in matrix.skills:
        demonstrated = _find_demonstrated(required_skill.name, dna_skills)
        if demonstrated is None:
            # Prerequisite inference (§26): dependents imply the foundation.
            demonstrated = _inferred_level(required_skill.name, dna_skills)
        current: int | None = None
        confidence: float | None = None
        if demonstrated is not None:
            current = int(demonstrated.get("score") or 0)
            confidence = float(demonstrated.get("confidence") or 0.0)

        # §3: an already-demonstrated skill is never represented as a gap.
        if current is not None and current >= required_skill.requiredLevel:
            strengths.append(required_skill.name)
            continue

        gap = required_skill.requiredLevel - (current or 0)
        if current is None:
            kind = "not_detected"
        elif confidence is not None and confidence < LIMITED_EVIDENCE_CONFIDENCE:
            kind = "limited_evidence"
            limited.append(required_skill.name)
        else:
            kind = "demonstrated"

        priority = _priority_score(
            gap=gap,
            required=required_skill.requiredLevel,
            importance=required_skill.importance,
            demonstrated=demonstrated,
        )
        deps = [d for d in prerequisites_of(required_skill.name) if d != required_skill.name]

        gaps.append(
            SkillGapEntry(
                skill=required_skill.name,
                requiredLevel=required_skill.requiredLevel,
                currentScore=current,
                confidence=confidence,
                gap=gap,
                priority=_priority_band(priority),
                priorityScore=priority,
                kind=kind,
                evidence=_evidence_lines(required_skill.name, demonstrated, profile),
                dependencies=deps,
            )
        )

    # §5: deterministic ordering — priority score desc, then gap desc, then name.
    gaps.sort(key=lambda g: (-g.priorityScore, -g.gap, g.skill))

    # Strengths also include strong DNA skills outside the role matrix.
    matrix_names = {s.name.lower() for s in matrix.skills}
    alias_names = {a.lower() for aliases in SKILL_ALIASES.values() for a in aliases}
    for entry in dna_skills:
        name = str(entry.get("skill", ""))
        score = int(entry.get("score") or 0)
        if (
            name
            and name.lower() not in matrix_names
            and name.lower() not in alias_names
            and score >= 70
            and name not in strengths
        ):
            strengths.append(name)

    return SkillGapsDocument(
        userId=str(profile.get("userId") or ""),
        targetRole=matrix.role,
        analysisVersion=analysis_version,
        generatedAt=generated_at,
        gaps=gaps,
        strengths=sorted(strengths),
        evidenceSummary={
            "repositoriesAnalyzed": profile.get("repositoriesAnalyzed") or 0,
            "skillsDetected": len(dna_skills),
            "limitedEvidenceSkills": limited,
        },
    )
