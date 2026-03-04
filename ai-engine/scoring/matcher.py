"""
SCORING ENGINE — Job Matching Algorithm
4-dimension weighted scoring: Skills, Experience, Domain, Behavioral.
100% local computation — no external calls.
"""

import os
import re
from typing import List, Optional
from loguru import logger
from inference.embedder import embedder

# ─── Weights Configuration ─────────────────────────────────────────────────────
WEIGHTS = {
    "skills": float(os.getenv("WEIGHT_SKILLS", "0.40")),
    "experience": float(os.getenv("WEIGHT_EXPERIENCE", "0.25")),
    "domain": float(os.getenv("WEIGHT_DOMAIN", "0.20")),
    "behavioral": float(os.getenv("WEIGHT_BEHAVIORAL", "0.15")),
}
MIN_MATCH_SCORE = float(os.getenv("MIN_MATCH_SCORE", "0.80"))

# Validate weights sum to 1.0
assert abs(sum(WEIGHTS.values()) - 1.0) < 0.001, "Weights must sum to 1.0"


class JobMatcher:
    """
    Scores candidate-job fit using a 4-dimensional weighted algorithm.

    Dimension 1 — Skills (40%):
      Fuzzy Jaccard similarity between candidate skills and required skills.
      Uses Levenshtein distance for partial matches ("React" ~ "React.js").

    Dimension 2 — Experience (25%):
      Continuous scoring based on years-of-experience overlap.
      Penalty for underqualified; mild penalty for overqualified.

    Dimension 3 — Domain (20%):
      Keyword match between candidate domain expertise and job domain/description.

    Dimension 4 — Behavioral (15%):
      Cosine similarity between candidate CV embedding and job description embedding.
      Uses the local sentence-transformer model.
    """

    def score_match(
        self,
        candidate: dict,
        job: dict,
        candidate_embedding: Optional[List[float]] = None,
        job_embedding: Optional[List[float]] = None,
    ) -> dict:
        """
        Compute full match score between a candidate and a job.

        Args:
            candidate: ParsedCV dict
            job: JobPosting dict
            candidate_embedding: Pre-computed CV embedding (optional)
            job_embedding: Pre-computed job embedding (optional)

        Returns:
            Dict with all scores and match reasons
        """
        # Dimension scores
        skills_score, skills_detail = self._score_skills(
            candidate.get("skills", []),
            job.get("requiredSkills", [])
        )
        experience_score, exp_detail = self._score_experience(
            candidate.get("totalExperienceYears", 0) or
            candidate.get("total_experience_years", 0),
            job.get("experienceMin", 0),
            job.get("experienceMax", 99),
        )
        domain_score, domain_detail = self._score_domain(
            candidate.get("domainExpertise", []) or
            candidate.get("domain_expertise", []),
            job.get("domain"),
            job.get("description", ""),
        )
        behavioral_score, behavioral_detail = self._score_behavioral(
            candidate_embedding,
            job_embedding,
            candidate.get("behavioralFit", {}) or
            candidate.get("behavioral_fit", {}),
            job.get("description", ""),
        )

        # Weighted total
        overall = (
            skills_score * WEIGHTS["skills"]
            + experience_score * WEIGHTS["experience"]
            + domain_score * WEIGHTS["domain"]
            + behavioral_score * WEIGHTS["behavioral"]
        )
        overall = round(min(overall, 1.0), 4)

        return {
            "overallScore": overall,
            "passedThreshold": overall >= MIN_MATCH_SCORE,
            "skillsScore": round(skills_score, 4),
            "experienceScore": round(experience_score, 4),
            "domainScore": round(domain_score, 4),
            "behavioralScore": round(behavioral_score, 4),
            "matchReasons": {
                "skills": skills_detail,
                "experience": exp_detail,
                "domain": domain_detail,
                "behavioral": behavioral_detail,
            },
        }

    # ─── Dimension 1: Skills ────────────────────────────────────────────────────

    def _score_skills(self, candidate_skills: list, required_skills: list) -> tuple:
        """
        Fuzzy Jaccard similarity with Levenshtein partial matching.
        Returns (score, detail_dict)
        """
        if not required_skills:
            return 0.5, {"score": 50, "matched": [], "missing": [],
                         "summary": "No required skills specified"}

        norm = lambda s: s.lower().strip()
        cand_norm = [norm(s) for s in candidate_skills]
        req_norm = [norm(s) for s in required_skills]

        matched = []
        missing = []

        for req in req_norm:
            found = False
            for cand in cand_norm:
                # Exact substring match first
                if req in cand or cand in req:
                    found = True
                    break
                # Levenshtein fallback
                if self._levenshtein_sim(req, cand) > 0.82:
                    found = True
                    break
            if found:
                matched.append(req)
            else:
                missing.append(req)

        score = len(matched) / len(req_norm)
        return score, {
            "score": round(score * 100),
            "matched": matched[:10],
            "missing": missing[:10],
            "summary": f"{len(matched)}/{len(req_norm)} required skills matched",
        }

    # ─── Dimension 2: Experience ─────────────────────────────────────────────────

    def _score_experience(
        self, candidate_years: float, min_req: float, max_req: float
    ) -> tuple:
        """
        Continuous scoring:
        - Within range: 1.0
        - Below minimum: linear penalty
        - Above maximum: slight overqualification penalty (max 0.6)
        """
        candidate_years = float(candidate_years or 0)
        min_req = float(min_req or 0)
        max_req = float(max_req or 99)

        if candidate_years >= min_req and candidate_years <= max_req:
            score = 1.0
            summary = f"{candidate_years}y meets {min_req}-{max_req}y requirement"
        elif candidate_years < min_req:
            gap = min_req - candidate_years
            score = max(0.0, 1.0 - gap / max(min_req, 1))
            summary = f"{candidate_years}y is {gap:.1f}y below {min_req}y minimum"
        else:
            excess = candidate_years - max_req
            score = max(0.6, 1.0 - excess * 0.04)
            summary = f"{candidate_years}y exceeds {max_req}y max (overqualified)"

        return round(score, 4), {
            "score": round(score * 100),
            "candidateYears": candidate_years,
            "requiredRange": f"{min_req}-{max_req}",
            "summary": summary,
        }

    # ─── Dimension 3: Domain ────────────────────────────────────────────────────

    def _score_domain(
        self, candidate_domains: list, job_domain: Optional[str], job_description: str
    ) -> tuple:
        """
        Multi-level domain matching:
        1. Direct domain name match (score 1.0)
        2. Domain keyword in job description (score 0.7)
        3. No match (score 0.3)
        """
        if not candidate_domains:
            return 0.3, {"score": 30, "summary": "No domain expertise found in CV"}

        norm = lambda s: (s or "").lower().strip()
        cand_norm = [norm(d) for d in candidate_domains]
        job_domain_norm = norm(job_domain)
        desc_norm = norm(job_description)

        best_score = 0.3
        matched_domain = None

        for domain in cand_norm:
            # Direct domain match
            if job_domain_norm and (
                domain in job_domain_norm or job_domain_norm in domain
            ):
                best_score = 1.0
                matched_domain = domain
                break
            # In job description
            if domain in desc_norm:
                best_score = max(best_score, 0.7)
                matched_domain = domain

        return round(best_score, 4), {
            "score": round(best_score * 100),
            "candidateDomains": candidate_domains[:5],
            "jobDomain": job_domain or "Not specified",
            "matched": matched_domain,
            "summary": (
                f"Domain '{matched_domain}' aligns with job"
                if matched_domain
                else "Weak domain alignment"
            ),
        }

    # ─── Dimension 4: Behavioral / Semantic ──────────────────────────────────────

    def _score_behavioral(
        self,
        cv_embedding: Optional[List[float]],
        job_embedding: Optional[List[float]],
        behavioral_fit: dict,
        job_description: str,
    ) -> tuple:
        """
        Cosine similarity between CV and job description embeddings.
        Falls back to trait keyword matching if embeddings unavailable.
        """
        # If both embeddings are available, use cosine similarity
        if cv_embedding and job_embedding:
            sim = embedder.cosine_similarity(cv_embedding, job_embedding)
            # Cosine sim range [-1, 1] → normalize to [0, 1]
            score = (sim + 1) / 2
            return round(score, 4), {
                "score": round(score * 100),
                "method": "embedding_cosine_similarity",
                "summary": (
                    "Strong semantic alignment" if score >= 0.75
                    else "Moderate semantic fit"
                ),
            }

        # Fallback: generate job description embedding on-the-fly
        if cv_embedding and job_description:
            try:
                jd_emb = embedder.embed(job_description[:3000])
                sim = embedder.cosine_similarity(cv_embedding, jd_emb)
                score = (sim + 1) / 2
                return round(score, 4), {
                    "score": round(score * 100),
                    "method": "on_demand_embedding",
                    "summary": "Semantic fit computed from job description",
                }
            except Exception as e:
                logger.warning(f"Embedding fallback failed: {e}")

        # Last resort: trait count heuristic
        traits = behavioral_fit.get("traits", []) if behavioral_fit else []
        score = min(0.5 + len(traits) * 0.05, 0.75)
        return round(score, 4), {
            "score": round(score * 100),
            "method": "trait_heuristic",
            "summary": f"Estimated from {len(traits)} identified behavioral traits",
        }

    # ─── Utilities ────────────────────────────────────────────────────────────────

    def _levenshtein_sim(self, a: str, b: str) -> float:
        """Normalized Levenshtein similarity (0..1)."""
        m, n = len(a), len(b)
        if m == 0 and n == 0:
            return 1.0
        if m == 0 or n == 0:
            return 0.0

        dp = list(range(n + 1))
        for i in range(1, m + 1):
            prev = dp[0]
            dp[0] = i
            for j in range(1, n + 1):
                temp = dp[j]
                if a[i - 1] == b[j - 1]:
                    dp[j] = prev
                else:
                    dp[j] = 1 + min(dp[j], dp[j - 1], prev)
                prev = temp

        distance = dp[n]
        return 1.0 - distance / max(m, n)

    def rank_candidates(
        self, candidates: List[dict], job: dict, min_score: float = MIN_MATCH_SCORE
    ) -> List[dict]:
        """
        Score and rank a list of candidates for a single job.
        Returns only candidates above min_score threshold.
        """
        results = []
        for candidate in candidates:
            cv_emb = candidate.get("embedding")
            job_emb = job.get("embedding")
            score_data = self.score_match(candidate, job, cv_emb, job_emb)
            if score_data["overallScore"] >= min_score:
                results.append({
                    **score_data,
                    "candidate": candidate,
                })

        results.sort(key=lambda x: x["overallScore"], reverse=True)
        return results


# Module singleton
job_matcher = JobMatcher()
