"""
Pydantic schemas for all AI engine inputs and outputs.
All data validated before processing or returning to clients.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Any
from enum import Enum


# ─── Enums ───────────────────────────────────────────────────────────────────

class InferenceMode(str, Enum):
    LLM = "llm"           # Use local Ollama LLM
    RULES = "rules"       # Use rule-based fallback only
    HYBRID = "hybrid"     # LLM with rule-based validation


# ─── CV Parsing ──────────────────────────────────────────────────────────────

class WorkExperience(BaseModel):
    company: Optional[str] = None
    role: Optional[str] = None
    start_date: Optional[str] = Field(None, alias="startDate")
    end_date: Optional[str] = Field(None, alias="endDate")
    duration_years: float = Field(0.0, alias="durationYears")
    description: Optional[str] = None

    class Config:
        populate_by_name = True


class Education(BaseModel):
    degree: Optional[str] = None
    institution: Optional[str] = None
    year: Optional[str] = None
    gpa: Optional[str] = None


class BehavioralFit(BaseModel):
    traits: List[str] = Field(default_factory=list)
    work_style: Optional[str] = Field(None, alias="workStyle")
    team_player: bool = Field(True, alias="teamPlayer")
    leadership_indicators: List[str] = Field(default_factory=list, alias="leadershipIndicators")

    class Config:
        populate_by_name = True


class TraitScores(BaseModel):
    """
    Quantified trait scores (0.0 - 1.0) inferred from CV language and content.
    """
    vigilance: float = Field(0.5, ge=0.0, le=1.0,
        description="Attention to detail, accuracy, process adherence")
    leadership: float = Field(0.5, ge=0.0, le=1.0,
        description="Team lead, mentoring, project ownership evidence")
    adaptability: float = Field(0.5, ge=0.0, le=1.0,
        description="Diverse roles, technologies, or industries")
    analytical_ability: float = Field(0.5, ge=0.0, le=1.0,
        description="Data-driven, problem solving, systems thinking")
    communication: float = Field(0.5, ge=0.0, le=1.0,
        description="Presentations, writing, cross-team collaboration")
    evidence: dict = Field(default_factory=dict,
        description="Supporting text excerpts from CV per trait")


class ParsedCV(BaseModel):
    """Full structured output from CV parsing."""
    full_name: Optional[str] = Field(None, alias="fullName")
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    summary: Optional[str] = None
    skills: List[str] = Field(default_factory=list)
    total_experience_years: float = Field(0.0, alias="totalExperienceYears")
    experience: List[WorkExperience] = Field(default_factory=list)
    education: List[Education] = Field(default_factory=list)
    certifications: List[str] = Field(default_factory=list)
    languages: List[str] = Field(default_factory=list)
    domain_expertise: List[str] = Field(default_factory=list, alias="domainExpertise")
    behavioral_fit: BehavioralFit = Field(default_factory=BehavioralFit, alias="behavioralFit")
    trait_scores: TraitScores = Field(default_factory=TraitScores, alias="traitScores")
    highlights: List[str] = Field(default_factory=list)
    embedding: Optional[List[float]] = None
    inference_mode: InferenceMode = Field(InferenceMode.LLM, alias="inferenceMode")
    confidence: float = Field(1.0, ge=0.0, le=1.0,
        description="Confidence in extraction quality (1.0 = LLM, 0.6 = rules)")

    class Config:
        populate_by_name = True


# ─── Job Matching ─────────────────────────────────────────────────────────────

class JobMatchRequest(BaseModel):
    cv_id: str = Field(alias="cvId")
    candidate: ParsedCV
    jobs: List[dict]
    min_score: float = Field(0.80, alias="minScore")

    class Config:
        populate_by_name = True


class MatchScoreBreakdown(BaseModel):
    skills_score: float = Field(alias="skillsScore")
    experience_score: float = Field(alias="experienceScore")
    domain_score: float = Field(alias="domainScore")
    behavioral_score: float = Field(alias="behavioralScore")
    overall_score: float = Field(alias="overallScore")
    match_reasons: dict = Field(alias="matchReasons")
    explanation: Optional[str] = None

    class Config:
        populate_by_name = True


class JobMatchResult(BaseModel):
    job_id: str = Field(alias="jobId")
    match_score: float = Field(alias="matchScore")
    breakdown: MatchScoreBreakdown
    passed_threshold: bool = Field(alias="passedThreshold")

    class Config:
        populate_by_name = True


# ─── API Request/Response ─────────────────────────────────────────────────────

class ParseCVRequest(BaseModel):
    raw_text: str = Field(alias="rawText", min_length=50)
    mode: InferenceMode = InferenceMode.HYBRID

    class Config:
        populate_by_name = True


class ParseCVResponse(BaseModel):
    success: bool
    data: Optional[ParsedCV] = None
    error: Optional[str] = None
    processing_time_ms: int = Field(alias="processingTimeMs")

    class Config:
        populate_by_name = True


class EmbedRequest(BaseModel):
    text: str
    truncate: bool = True


class EmbedResponse(BaseModel):
    embedding: List[float]
    model: str
    dimensions: int


class HealthResponse(BaseModel):
    status: str
    ollama_available: bool = Field(alias="ollamaAvailable")
    model_loaded: bool = Field(alias="modelLoaded")
    embedding_model: str = Field(alias="embeddingModel")
    version: str = "1.0.0"

    class Config:
        populate_by_name = True
