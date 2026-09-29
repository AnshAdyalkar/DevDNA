"""Phase 5 growth-engine models (§2-§15, §29, §31).

Everything the growth engine produces is derived from the stored Developer
Profile (Phase 4) and the role-skill matrix. No request ever carries a
userId except as an opaque routing key; ownership is enforced in Node.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from ..api.models.schemas import Confidence

GapPriority = Literal["HIGH", "MEDIUM", "LOW"]
GapKind = Literal["demonstrated", "limited_evidence", "not_detected"]
Difficulty = Literal["Beginner", "Intermediate", "Advanced"]
PhaseStatus = Literal["LOCKED", "AVAILABLE", "IN_PROGRESS", "COMPLETED"]

# Weights for the deterministic priority score (§5) — documented in
# docs/growth-engine.md. They sum with their ranges to <= 1.
PRIO_W_GAP = 0.5
PRIO_W_IMPORTANCE = 0.3
PRIO_W_EVIDENCE = 0.2

# Roadmap phase-size targets (§8).
MAX_SKILLS_PER_PHASE = 3
MAX_PHASES = 8


class RoleSkill(BaseModel):
    """One required skill inside a role matrix (§2)."""

    name: str
    importance: float = Field(ge=0.0, le=1.0)
    requiredLevel: int = Field(ge=0, le=100)


class RoleMatrix(BaseModel):
    role: str
    description: str
    skills: list[RoleSkill] = Field(default_factory=list)


class RolesResponse(BaseModel):
    roles: list[RoleMatrix]


class AnalyzeRequest(BaseModel):
    """POST /api/growth/analyze — Node sends the user id as a routing key."""

    userId: str = Field(min_length=12)


class AnalyzeSummary(BaseModel):
    """What the growth pipeline produced (returned to Node)."""

    userId: str
    status: Literal["completed"] = "completed"
    targetRole: str
    gapsFound: int = Field(ge=0)
    roadmapPhases: int = Field(ge=0)
    roadmapVersion: int = Field(ge=1, default=1)
    projectsGenerated: int = Field(ge=0)
    analysisVersion: str
    generatedAt: str


class SkillGapEntry(BaseModel):
    """One skill gap with typed evidence and priority (§3-§5)."""

    skill: str
    requiredLevel: int = Field(ge=0, le=100)
    currentScore: int | None = None  # None ⇒ not detected (insufficient evidence)
    confidence: float | None = Confidence
    gap: int = Field(ge=0, le=100)
    priority: GapPriority
    priorityScore: float = Field(ge=0.0, le=1.0)
    kind: GapKind
    evidence: list[str] = Field(default_factory=list)
    dependencies: list[str] = Field(default_factory=list)


class SkillGapsDocument(BaseModel):
    userId: str
    targetRole: str
    analysisVersion: str
    generatedAt: str
    gaps: list[SkillGapEntry] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    evidenceSummary: dict[str, Any] = Field(default_factory=dict)


class ResourceRef(BaseModel):
    """A named learning resource; URLs only when verified (§10)."""

    name: str
    type: Literal[
        "Documentation",
        "Tutorial",
        "Course",
        "Video",
        "Article",
        "Book",
        "Practice",
        "Project",
    ]
    url: str | None = None  # None ⇒ name-only, no fabricated URLs (§10)


class RoadmapPhase(BaseModel):
    """One ordered phase of the learning roadmap (§8, §9)."""

    id: str
    order: int = Field(ge=1)
    title: str
    description: str
    skills: list[str] = Field(default_factory=list)
    priority: GapPriority
    prerequisites: list[str] = Field(default_factory=list)  # phase ids
    estimatedDuration: str
    learningObjectives: list[str] = Field(default_factory=list)
    resources: list[ResourceRef] = Field(default_factory=list)
    project: str | None = None
    completed: bool = False


class RoadmapDocument(BaseModel):
    """Persisted learning roadmap (§8, §28, §29)."""

    userId: str
    targetRole: str
    version: int = Field(ge=1)
    analysisVersion: str
    status: Literal["ACTIVE", "OUTDATED", "SUPERSEDED"] = "ACTIVE"
    generatedAt: str
    updatedAt: str
    estimatedDuration: str
    phases: list[RoadmapPhase] = Field(default_factory=list)


class ProjectMilestone(BaseModel):
    """A milestone with its skill mapping (§14, §15)."""

    order: int = Field(ge=1)
    title: str
    description: str
    skills: list[str] = Field(default_factory=list)
    estimatedDuration: str


class ProjectRecommendation(BaseModel):
    """A recommended project (§12-§15)."""

    userId: str
    targetRole: str
    title: str
    description: str
    difficulty: Difficulty
    estimatedDuration: str
    technologies: list[str] = Field(default_factory=list)
    skillsDeveloped: list[str] = Field(default_factory=list)
    gapsAddressed: list[str] = Field(default_factory=list)
    prerequisites: list[str] = Field(default_factory=list)
    architecture: str | None = None
    milestones: list[ProjectMilestone] = Field(default_factory=list)
    generatedAt: str
    analysisVersion: str


class GrowthAnalysisRequest(BaseModel):
    """POST /api/growth/analyze — run the full growth pipeline for one user."""

    userId: str = Field(min_length=12)
    targetRole: str = Field(min_length=1)


class GrowthAnalysisResponse(BaseModel):
    targetRole: str
    analysisVersion: str
    gapsFound: int
    roadmapGenerated: bool
    roadmapVersion: int
    projectsGenerated: int


class GrowthGapsRequest(BaseModel):
    """POST /api/growth/gaps — recompute/return stored gaps for a role."""

    userId: str = Field(min_length=12)
    targetRole: str = Field(min_length=1)


class GrowthRoadmapRequest(BaseModel):
    """POST /api/growth/roadmap — build (or fetch) the roadmap.

    targetRole is optional: empty means "the user's latest roadmap".
    """

    userId: str = Field(min_length=12)
    targetRole: str = ""
    version: int | None = None  # None ⇒ next version


class GrowthProjectsRequest(BaseModel):
    """POST /api/growth/projects — list/generate project recommendations."""

    userId: str = Field(min_length=12)
    targetRole: str = ""


class PhasesProgressRequest(BaseModel):
    """PATCH-style payload: set the status of roadmap phases (§30)."""

    userId: str = Field(min_length=12)
    updates: list[PhaseProgressUpdate] = Field(min_length=1, max_length=50)


class PhaseProgressUpdate(BaseModel):
    phaseId: str
    status: PhaseStatus


class GapsResponse(BaseModel):
    targetRole: str
    analysisVersion: str
    gaps: list[SkillGapEntry]
    strengths: list[str]
