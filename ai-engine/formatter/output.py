"""
FORMATTER MODULE — Output Formatter
Merges LLM output with rule-based extraction and normalizes the final JSON.
Ensures the output always conforms to ParsedCV schema.
"""

from typing import Optional
from loguru import logger
from models.schemas import ParsedCV, BehavioralFit, TraitScores, WorkExperience, Education, InferenceMode


class OutputFormatter:
    """
    Merges, validates, and normalizes CV extraction results.
    Priority: LLM output > Rule-based extraction > Default values
    """

    def merge_and_format(
        self,
        llm_output: dict,
        rules_output: dict,
        embedding: Optional[list] = None,
        inference_mode: InferenceMode = InferenceMode.HYBRID,
    ) -> ParsedCV:
        """
        Merge LLM and rule-based outputs into a validated ParsedCV.

        Strategy:
        - Use LLM values when present and non-empty
        - Fall back to rule-based values for missing fields
        - Always validate and clamp numeric fields
        """
        merged = {}

        # Simple string fields: prefer LLM, fallback to rules
        for field in ["fullName", "email", "phone", "location", "summary"]:
            merged[field] = (
                self._coerce_str(llm_output.get(field))
                or self._coerce_str(rules_output.get(field))
            )

        # Lists: union of LLM and rule-based (deduplicated)
        merged["skills"] = self._merge_lists(
            llm_output.get("skills", []),
            rules_output.get("skills", []),
        )

        merged["certifications"] = self._merge_lists(
            llm_output.get("certifications", []),
            rules_output.get("certifications", []),
        )

        merged["languages"] = self._merge_lists(
            llm_output.get("languages", []),
            rules_output.get("languages", []),
        )

        merged["domainExpertise"] = self._merge_lists(
            llm_output.get("domainExpertise", []),
            rules_output.get("domainExpertise", []),
        )

        merged["highlights"] = self._merge_lists(
            llm_output.get("highlights", []),
            rules_output.get("highlights", []),
        )

        # Experience years: prefer LLM (more accurate), fallback to rules
        llm_exp = self._coerce_float(llm_output.get("totalExperienceYears"))
        rules_exp = self._coerce_float(rules_output.get("totalExperienceYears"))
        merged["totalExperienceYears"] = max(llm_exp, rules_exp) if (llm_exp and rules_exp) else (llm_exp or rules_exp or 0.0)

        # Structured lists
        merged["experience"] = self._format_experience(
            llm_output.get("experience", []) or rules_output.get("experience", [])
        )
        merged["education"] = self._format_education(
            llm_output.get("education", []) or rules_output.get("education", [])
        )

        # Behavioral fit
        llm_fit = llm_output.get("behavioralFit", {}) or {}
        rules_fit = rules_output.get("behavioralFit", {}) or {}
        merged["behavioralFit"] = BehavioralFit(
            traits=self._merge_lists(
                llm_fit.get("traits", []),
                rules_fit.get("traits", []),
            ),
            workStyle=llm_fit.get("workStyle") or "mixed",
            teamPlayer=llm_fit.get("teamPlayer", rules_fit.get("teamPlayer", True)),
            leadershipIndicators=self._merge_lists(
                llm_fit.get("leadershipIndicators", []),
                rules_fit.get("leadershipIndicators", []),
            ),
        )

        # Trait scores: use LLM if present, else rules
        llm_traits = llm_output.get("traitScores", {}) or {}
        rules_traits = rules_output.get("traitScores", {}) or {}
        merged["traitScores"] = TraitScores(
            vigilance=self._clamp(llm_traits.get("vigilance") or rules_traits.get("vigilance", 0.5)),
            leadership=self._clamp(llm_traits.get("leadership") or rules_traits.get("leadership", 0.5)),
            adaptability=self._clamp(llm_traits.get("adaptability") or rules_traits.get("adaptability", 0.5)),
            analytical_ability=self._clamp(
                llm_traits.get("analyticalAbility") or llm_traits.get("analytical_ability")
                or rules_traits.get("analytical_ability", 0.5)
            ),
            communication=self._clamp(llm_traits.get("communication") or rules_traits.get("communication", 0.5)),
            evidence=llm_traits.get("evidence", {}),
        )

        # Metadata
        merged["embedding"] = embedding
        merged["inferenceMode"] = inference_mode
        merged["confidence"] = 1.0 if inference_mode == InferenceMode.LLM else (
            0.8 if inference_mode == InferenceMode.HYBRID else 0.6
        )

        try:
            return ParsedCV(**merged)
        except Exception as e:
            logger.error(f"ParsedCV validation error: {e}. Using minimal output.")
            return ParsedCV(
                fullName=merged.get("fullName"),
                email=merged.get("email"),
                skills=merged.get("skills", []),
                totalExperienceYears=merged.get("totalExperienceYears", 0.0),
                inferenceMode=inference_mode,
                confidence=0.4,
            )

    def to_json(self, parsed_cv: ParsedCV) -> dict:
        """Convert ParsedCV to JSON-serializable dict for API response."""
        return parsed_cv.model_dump(by_alias=True, exclude_none=True)

    # ─── Private Helpers ──────────────────────────────────────────────────────────

    def _merge_lists(self, a: list, b: list) -> list:
        """Union of two lists, deduplicated, case-insensitive."""
        seen = set()
        result = []
        for item in (a or []) + (b or []):
            if isinstance(item, str):
                key = item.lower().strip()
                if key and key not in seen:
                    seen.add(key)
                    result.append(item)
        return result

    def _coerce_str(self, val) -> Optional[str]:
        if val is None or val == "null" or val == "":
            return None
        return str(val).strip() or None

    def _coerce_float(self, val) -> float:
        try:
            f = float(val or 0)
            return max(0.0, min(f, 60.0))  # cap experience at 60 years
        except (TypeError, ValueError):
            return 0.0

    def _clamp(self, val, lo: float = 0.0, hi: float = 1.0) -> float:
        try:
            return max(lo, min(float(val or lo), hi))
        except (TypeError, ValueError):
            return (lo + hi) / 2

    def _format_experience(self, entries: list) -> list:
        result = []
        for e in (entries or [])[:15]:
            if not isinstance(e, dict):
                continue
            result.append(WorkExperience(
                company=self._coerce_str(e.get("company")),
                role=self._coerce_str(e.get("role")),
                start_date=self._coerce_str(e.get("startDate") or e.get("start_date")),
                end_date=self._coerce_str(e.get("endDate") or e.get("end_date")),
                duration_years=self._coerce_float(
                    e.get("durationYears") or e.get("duration_years")
                ),
                description=self._coerce_str(e.get("description")),
            ))
        return result

    def _format_education(self, entries: list) -> list:
        result = []
        for e in (entries or [])[:5]:
            if not isinstance(e, dict):
                continue
            result.append(Education(
                degree=self._coerce_str(e.get("degree")),
                institution=self._coerce_str(e.get("institution")),
                year=self._coerce_str(e.get("year")),
                gpa=self._coerce_str(e.get("gpa")),
            ))
        return result


# Module singleton
output_formatter = OutputFormatter()
