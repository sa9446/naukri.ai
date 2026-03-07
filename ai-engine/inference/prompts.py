"""
INFERENCE MODULE — Prompt Templates
All prompts used by the local LLM (naukri-cv-parser / phi3:mini via Ollama).
Designed for low temperature (0.1) deterministic JSON output.
Uses Phi-3 Instruct format: <|user|>...<|end|>\n<|assistant|>
"""


class PromptTemplates:
    """
    Central registry of all prompt templates.
    Format is compatible with Phi-3 Mini Instruct and the fine-tuned naukri-cv-parser.
    """

    @staticmethod
    def cv_parsing_prompt(cv_text: str) -> str:
        """
        Primary CV parsing prompt.
        Extracts all structured fields from raw CV text.
        Temperature: 0.1 for deterministic JSON.
        """
        return f"""<|user|>
Extract structured data from this CV. Return ONLY valid JSON, no extra text.

IMPORTANT:
- Extract EVERY job from the experience section (list all roles, most recent first).
- The first job listed is the CURRENT or most recent role.
- Use null for missing fields.
- For totalExperienceYears, sum all work durations (use today = 2026-03 for "Present" roles).

JSON structure to return:
{{
  "fullName": "string or null",
  "email": "string or null",
  "phone": "string or null",
  "location": "string or null",
  "summary": "2-3 sentence professional summary",
  "skills": ["skill1", "skill2"],
  "totalExperienceYears": 0.0,
  "experience": [
    {{
      "company": "string",
      "role": "string",
      "startDate": "YYYY-MM or null",
      "endDate": "YYYY-MM or Present",
      "durationYears": 0.0,
      "description": "key achievements"
    }}
  ],
  "education": [
    {{
      "degree": "string",
      "institution": "string",
      "year": "string or null",
      "gpa": "string or null"
    }}
  ],
  "certifications": ["cert1"],
  "languages": ["English"],
  "domainExpertise": ["domain1"],
  "behavioralFit": {{
    "traits": ["trait1"],
    "workStyle": "collaborative/independent/mixed",
    "teamPlayer": true,
    "leadershipIndicators": ["evidence from CV"]
  }}
}}

CV TEXT:
{cv_text[:3000]}
<|end|>
<|assistant|>
"""

    @staticmethod
    def trait_inference_prompt(experience_summary: str) -> str:
        """
        Infer quantified trait scores from CV experience.
        Returns scores 0.0 - 1.0 with evidence.
        """
        return f"""<|user|>
You are an organizational psychologist specializing in CV analysis.
Analyze this professional experience and score each trait from 0.0 to 1.0.

Score definitions:
- vigilance: attention to detail, quality, compliance, testing, accuracy
- leadership: team management, mentoring, project ownership, strategic decisions
- adaptability: career transitions, diverse tech stacks, startup experience
- analyticalAbility: data analysis, metrics, optimization, research, algorithm design
- communication: presentations, documentation, client-facing, publications

Return ONLY valid JSON:
{{
  "vigilance": 0.0,
  "leadership": 0.0,
  "adaptability": 0.0,
  "analyticalAbility": 0.0,
  "communication": 0.0,
  "evidence": {{
    "vigilance": ["quote from CV"],
    "leadership": ["quote from CV"],
    "adaptability": ["quote from CV"],
    "analyticalAbility": ["quote from CV"],
    "communication": ["quote from CV"]
  }}
}}

EXPERIENCE SUMMARY:
{experience_summary[:4000]}
<|end|>
<|assistant|>
"""

    @staticmethod
    def job_fit_explanation_prompt(candidate_summary: str, job_summary: str) -> str:
        """
        Generate a human-readable fit explanation between candidate and job.
        Used AFTER scoring to add qualitative context.
        """
        return f"""<|user|>
You are a senior recruiter. Briefly explain the fit between this candidate and job.

Return ONLY valid JSON:
{{
  "fitScore": 0.0,
  "fitReason": "2-sentence explanation",
  "keyMatchingSkills": ["skill1", "skill2", "skill3"],
  "gaps": ["gap1"],
  "strengths": ["strength1", "strength2"]
}}

CANDIDATE:
{candidate_summary[:2000]}

JOB:
{job_summary[:2000]}
<|end|>
<|assistant|>
"""

    @staticmethod
    def skill_gap_analysis_prompt(candidate_skills: list, required_skills: list) -> str:
        """Analyze skill gaps between candidate and job requirements."""
        return f"""<|user|>
Compare these skill sets and identify gaps.

Return ONLY valid JSON:
{{
  "matched": ["skills present in both"],
  "missing": ["required skills the candidate lacks"],
  "transferable": ["candidate skills that partially satisfy requirements"],
  "matchPercentage": 0.0
}}

CANDIDATE SKILLS: {candidate_skills}
REQUIRED SKILLS: {required_skills}
<|end|>
<|assistant|>
"""

    @staticmethod
    def domain_classification_prompt(cv_text: str) -> str:
        """Classify which industry domains are present in a CV."""
        return f"""<|user|>
Identify the top 3 industry domains from this CV text.

Valid domains: FinTech, Healthcare, E-commerce, SaaS, AI/ML, Cloud/DevOps,
EdTech, Gaming, Logistics, Automotive, Telecom, Media, Government, Consulting

Return ONLY valid JSON:
{{
  "primaryDomain": "string",
  "domains": ["domain1", "domain2"],
  "confidence": 0.0
}}

CV TEXT (excerpt):
{cv_text[:3000]}
<|end|>
<|assistant|>
"""

    @staticmethod
    def experience_calculation_prompt(experience_text: str) -> str:
        """
        Dedicated prompt for accurate experience calculation.
        Handles overlapping dates, career gaps, and progression.
        """
        return f"""<|user|>
Calculate total professional experience from this work history.
Sum durations carefully. Do not double-count overlapping periods.
If a role says "Present" or "Current", use today's date (2026-03).

Return ONLY valid JSON:
{{
  "totalYears": 0.0,
  "breakdown": [
    {{
      "role": "string",
      "company": "string",
      "startDate": "YYYY-MM",
      "endDate": "YYYY-MM or Present",
      "years": 0.0
    }}
  ],
  "careerGaps": [],
  "progression": "junior/mid/senior/principal/executive"
}}

WORK HISTORY:
{experience_text[:4000]}
<|end|>
<|assistant|>
"""


# Module singleton
prompts = PromptTemplates()
