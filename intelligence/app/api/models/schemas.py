"""Pydantic schemas — the service contract with the Node API gateway.

Every request is validated; every score carries evidence so the
frontend can explain *why* a number is what it is.
"""

from typing import Literal

from pydantic import BaseModel, Field

Evidence = str


class HealthResponse(BaseModel):
    """Liveness payload for /health."""

    status: str
    service: str
    version: str
    analyzers: list[str]


Score = Field(ge=0, le=100, description="Normalized 0-100 score")
Confidence = Field(ge=0.0, le=1.0, description="How strongly signals support this score")


class ScoredSkill(BaseModel):
    skill: str
    score: int = Score
    confidence: float = Confidence
    evidence: list[Evidence] = Field(default_factory=list)


class RepositoryAnalysisRequest(BaseModel):
    """Payload sent by Node for a single repository analysis."""

    repository_id: str
    name: str
    languages: dict[str, int] = Field(default_factory=dict, description="language -> bytes")
    commit_count: int = Field(ge=0, default=0)
    file_count: int = Field(ge=0, default=0)
    technologies: list[str] = Field(default_factory=list)
    has_tests: bool = False
    has_docs: bool = False
    has_ci: bool = False
    has_docker: bool = False
    stars: int = Field(ge=0, default=0)
    size_kb: int = Field(ge=0, default=0)


class RepositoryAnalysis(BaseModel):
    repository_id: str
    name: str
    documentation_score: int = Score
    testing_score: int = Score
    maintainability_score: int = Score
    complexity_score: int = Score
    activity_score: int = Score
    health_score: int = Score
    complexity_reasons: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class ContributorSummary(BaseModel):
    login: str
    commit_count: int = Field(ge=0, default=0)


class CommitActivityPoint(BaseModel):
    date: str
    commits: int = Field(ge=0)


class BehaviorAnalysisRequest(BaseModel):
    """Commit timestamps (ISO 8601) for one developer across repositories."""

    commits: list[CommitActivityPoint]
    repositories: list[str] = Field(default_factory=list)
    contributors: list[ContributorSummary] = Field(default_factory=list)


class BehaviorHourHistogram(BaseModel):
    hour: int = Field(ge=0, le=23)
    commits: int = Field(ge=0)


class BehaviorAnalysis(BaseModel):
    total_commits: int
    active_days: int
    active_weeks: int
    active_months: int
    longest_active_streak_days: int
    longest_inactive_gap_days: int
    most_productive_day: str
    most_active_hour: int = Field(ge=0, le=23)
    weekly_histogram: list[BehaviorHourHistogram]
    weekend_commit_ratio: float = Field(ge=0.0, le=1.0)
    consistency_score: int = Score
    consistency_breakdown: list[str] = Field(default_factory=list)


class SkillProfileRequest(BaseModel):
    """Aggregated language/technology signals across all repositories."""

    languages: dict[str, int] = Field(default_factory=dict, description="language -> bytes")
    technologies: list[str] = Field(default_factory=list)
    repositories: list[RepositoryAnalysisRequest] = Field(default_factory=list)


class SkillProfile(BaseModel):
    skills: list[ScoredSkill]


class DnaRequest(BaseModel):
    """Full DNA computation input — derived data only, never raw code."""

    skills: list[ScoredSkill]
    behavior: BehaviorAnalysis | None = None
    repositories: list[RepositoryAnalysis] = Field(default_factory=list)


class DnaDimension(BaseModel):
    dimension: str
    score: int = Score
    evidence: list[str] = Field(default_factory=list)


class DnaResult(BaseModel):
    overall: int = Score
    dimensions: list[DnaDimension]
    methodology: str


class SkillGap(BaseModel):
    skill: str
    current_level: int = Score
    target_level: int = Score
    gap: int = Field(ge=0, le=100)
    importance: Literal["critical", "important", "nice_to_have"]


class SkillGapsRequest(BaseModel):
    skills: list[ScoredSkill]
    target_role: str


class SkillGapsResult(BaseModel):
    target_role: str
    gaps: list[SkillGap]
    strengths: list[ScoredSkill]


class RoadmapStage(BaseModel):
    stage: int = Field(ge=1)
    skill: str
    current_level: int = Score
    target_level: int = Score
    why_it_matters: str
    recommended_concepts: list[str]
    practice_task: str
    mini_project: str
    estimated_difficulty: Literal["beginner", "intermediate", "advanced"]


class RoadmapResult(BaseModel):
    target_role: str
    stages: list[RoadmapStage]


class RecommendationRequest(BaseModel):
    skills: list[ScoredSkill]
    gaps: list[SkillGap] = Field(default_factory=list)
    technologies: list[str] = Field(default_factory=list)


class RecommendedProject(BaseModel):
    title: str
    description: str
    develops: list[str]
    why_now: str
    estimated_difficulty: Literal["beginner", "intermediate", "advanced"]


class RecommendationResult(BaseModel):
    projects: list[RecommendedProject]
