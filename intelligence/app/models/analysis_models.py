"""Pydantic models for the Phase 4 intelligence pipeline.

These describe what the engine derives from the synchronized GitHub data:
per-repository analysis and the aggregated DeveloperProfile. Everything is
evidence-backed; missing data is represented explicitly (§29) rather than
turned into zero scores.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from ..api.models.schemas import Confidence, Score  # shared constraints

EvidenceItem = dict[str, str]  # {"type": "...", "value": "..."}


class LanguageShare(BaseModel):
    name: str
    bytes: int = Field(ge=0)
    percentage: float = Field(ge=0.0, le=100.0)


class FileMetrics(BaseModel):
    files: int = Field(ge=0, default=0)
    sourceFiles: int = Field(ge=0, default=0)
    testFiles: int = Field(ge=0, default=0)
    documentationFiles: int = Field(ge=0, default=0)
    configurationFiles: int = Field(ge=0, default=0)
    manifestFiles: int = Field(ge=0, default=0)
    linesOfCode: int = Field(ge=0, default=0)
    largeFiles: int = Field(ge=0, default=0)
    manifestTruncated: bool = False


class ComplexityFactor(BaseModel):
    factor: str
    contribution: int = Field(ge=0, le=100)


class ComplexityReport(BaseModel):
    complexityScore: int = Score
    level: Literal["Minimal", "Simple", "Moderate", "Advanced", "Complex"]
    factors: list[ComplexityFactor] = Field(default_factory=list)


class DocumentationReport(BaseModel):
    documentationScore: int | None = Score
    readmePresent: bool
    readmeLength: int = Field(ge=0, default=0)
    sectionsDetected: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class TestingReport(BaseModel):
    testingScore: int | None = Score
    testFiles: int = Field(ge=0, default=0)
    sourceFiles: int = Field(ge=0, default=0)
    sourceToTestRatio: float | None = None
    frameworks: list[str] = Field(default_factory=list)
    ciTestingDetected: bool = False
    notes: list[str] = Field(default_factory=list)


class BehaviorReport(BaseModel):
    totalCommits: int = Field(ge=0, default=0)
    activeDays: int = Field(ge=0, default=0)
    activeWeeks: int = Field(ge=0, default=0)
    activeMonths: int = Field(ge=0, default=0)
    averageCommitsPerActiveWeek: float = Field(ge=0.0, default=0.0)
    longestActivePeriodDays: int = Field(ge=0, default=0)
    longestInactiveGapDays: int = Field(ge=0, default=0)
    mostActiveDay: str | None = None
    mostActiveHour: int | None = Field(ge=0, le=23, default=None)
    repositoriesTouched: int = Field(ge=0, default=0)
    observations: list[str] = Field(default_factory=list)


class ProjectPattern(BaseModel):
    projectType: str
    confidence: float = Confidence
    evidence: list[str] = Field(default_factory=list)


class RepositoryAnalysisDocument(BaseModel):
    """Shape persisted in `repository_analyses` (§20)."""

    repositoryId: str
    userId: str
    analysisVersion: str
    analyzedAt: str
    sourceHash: str
    fullName: str
    primaryLanguage: str | None = None
    languages: list[LanguageShare] = Field(default_factory=list)
    technologies: list[str] = Field(default_factory=list)
    metrics: FileMetrics = Field(default_factory=FileMetrics)
    complexity: ComplexityReport
    documentation: DocumentationReport
    testing: TestingReport
    projectType: ProjectPattern | None = None
    architectureSignals: list[str] = Field(default_factory=list)
    pushedAt: str | None = None
    isFork: bool = False
    isArchived: bool = False


class SkillWithEvidence(BaseModel):
    """DeveloperProfile skill entry (§16-§18)."""

    skill: str
    score: int = Score
    confidence: float = Confidence
    evidence: list[EvidenceItem] = Field(default_factory=list)
    updatedAt: str


class BehaviorSummary(BaseModel):
    observations: list[str] = Field(default_factory=list)
    metrics: dict[str, Any] = Field(default_factory=dict)


class DeveloperProfileDocument(BaseModel):
    """Shape persisted in `developer_profiles` (§19)."""

    userId: str
    analysisVersion: str
    analyzedAt: str
    updatedAt: str
    repositoriesAnalyzed: int = Field(ge=0)
    primaryLanguages: list[LanguageShare] = Field(default_factory=list)
    technologies: list[str] = Field(default_factory=list)
    projectTypes: list[ProjectPattern] = Field(default_factory=list)
    skills: list[SkillWithEvidence] = Field(default_factory=list)
    behavior: BehaviorSummary = Field(default_factory=BehaviorSummary)
    engineeringPractices: dict[str, Any] = Field(default_factory=dict)
    summaryMetrics: dict[str, Any] = Field(default_factory=dict)
