"""
NLP MODULE — Rule-Based Extractor
Fallback extraction when Ollama is unavailable.
Uses regex patterns, keyword lists, and date math — no ML required.
Also used to VALIDATE and ENRICH LLM output.
"""

import re
from datetime import datetime
from typing import Optional
from loguru import logger


# ─── Comprehensive Skill Taxonomy ─────────────────────────────────────────────
SKILL_TAXONOMY = {
    "languages": [
        "Python", "JavaScript", "TypeScript", "Java", "C++", "C#", "Go", "Rust",
        "PHP", "Ruby", "Swift", "Kotlin", "Scala", "R", "MATLAB", "Perl", "Bash",
        "Shell", "PowerShell", "Dart", "Lua", "Haskell", "Elixir", "Clojure",
    ],
    "frontend": [
        "React", "Vue", "Angular", "Next.js", "Nuxt", "Svelte", "HTML", "CSS",
        "SASS", "SCSS", "Tailwind", "Bootstrap", "Material UI", "Redux", "MobX",
        "GraphQL", "REST", "WebSocket", "Webpack", "Vite", "Electron",
    ],
    "backend": [
        "Node.js", "Express", "FastAPI", "Django", "Flask", "Spring", "Spring Boot",
        "ASP.NET", "Laravel", "Rails", "NestJS", "Gin", "Fiber", "gRPC",
        "Microservices", "REST API", "GraphQL", "WebSockets",
    ],
    "databases": [
        "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch", "Cassandra",
        "DynamoDB", "SQLite", "Oracle", "SQL Server", "InfluxDB", "Neo4j",
        "Supabase", "Firebase", "Firestore", "Prisma", "SQLAlchemy", "Sequelize",
    ],
    "cloud_devops": [
        "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "Ansible",
        "CI/CD", "Jenkins", "GitHub Actions", "GitLab CI", "CircleCI",
        "Prometheus", "Grafana", "ELK", "Nginx", "Apache", "Linux", "Unix",
    ],
    "ml_ai": [
        "Machine Learning", "Deep Learning", "NLP", "Computer Vision", "TensorFlow",
        "PyTorch", "Keras", "Scikit-learn", "Pandas", "NumPy", "Matplotlib",
        "Hugging Face", "LangChain", "OpenCV", "BERT", "GPT", "LLM",
        "Stable Diffusion", "RAG", "Vector Database", "FAISS", "Pinecone",
    ],
    "methodologies": [
        "Agile", "Scrum", "Kanban", "TDD", "BDD", "DevOps", "GitOps",
        "Microservices", "Domain-Driven Design", "Event-Driven", "SOLID",
        "Design Patterns", "System Design", "API Design",
    ],
    "soft_skills": [
        "Leadership", "Communication", "Team Management", "Problem Solving",
        "Critical Thinking", "Project Management", "Mentoring", "Collaboration",
        "Presentation", "Stakeholder Management",
    ],
}

# All skills flattened with lowercase keys for fast lookup
ALL_SKILLS_LOWER = {
    skill.lower(): skill
    for category in SKILL_TAXONOMY.values()
    for skill in category
}

# ─── Trait Inference Keywords ─────────────────────────────────────────────────
TRAIT_KEYWORDS = {
    "vigilance": [
        "audit", "quality", "compliance", "testing", "review", "validation",
        "accuracy", "monitoring", "security", "detail", "precise", "thorough",
    ],
    "leadership": [
        "led", "managed", "directed", "founded", "built team", "mentored",
        "coached", "supervised", "hired", "team lead", "head of", "vp", "cto",
        "manager", "director", "established", "grew team",
    ],
    "adaptability": [
        "diverse", "various", "multiple technologies", "quickly learned",
        "transitioned", "pivoted", "cross-functional", "startup", "fast-paced",
        "agile", "rapidly", "new stack", "learned",
    ],
    "analytical_ability": [
        "analyzed", "data-driven", "metrics", "kpi", "optimized", "reduced",
        "improved performance", "benchmarked", "measured", "quantified",
        "research", "hypothesis", "algorithm", "modeled",
    ],
    "communication": [
        "presented", "published", "authored", "wrote", "documentation",
        "stakeholder", "client-facing", "translated", "trained", "taught",
        "conference", "workshop", "blog",
    ],
}


class RuleBasedExtractor:
    """
    Extracts CV data using deterministic rules.
    Used as:
      1. Fallback when Ollama is down
      2. Validator/enricher for LLM output
    """

    def extract_all(self, text: str) -> dict:
        """Run full rule-based extraction pipeline."""
        logger.debug("Running rule-based extraction...")
        return {
            "fullName": self.extract_name(text),
            "email": self.extract_email(text),
            "phone": self.extract_phone(text),
            "skills": self.extract_skills(text),
            "totalExperienceYears": self.calculate_total_experience(text),
            "experience": self.extract_experience_entries(text),
            "education": self.extract_education(text),
            "certifications": self.extract_certifications(text),
            "domainExpertise": self.infer_domain(text),
            "behavioralFit": {
                "traits": self.extract_traits(text),
                "teamPlayer": self._is_team_player(text),
                "leadershipIndicators": self._extract_leadership_evidence(text),
            },
            "traitScores": self.score_traits(text),
            "highlights": self.extract_highlights(text),
        }

    def extract_highlights(self, text: str) -> list:
        """
        Extract quantified achievement highlights from CV text.
        Returns up to 6 unique, clean highlight strings.
        """
        highlights = []
        seen = set()

        # Pattern 1: Impact verbs followed by a number or percentage in the same sentence
        impact_pattern = re.compile(
            r"[^.!?\n]*\b(reduced|increased|grew|built|saved|improved|generated|achieved|"
            r"delivered|led|managed|handled|deployed|launched|scaled|optimized|developed|"
            r"designed|implemented|drove|boosted|cut|accelerated)\b[^.!?\n]*"
            r"(\d[\d,]*\s*%|\d[\d,]+\+?|\$[\d,]+[KMBkmb]?)[^.!?\n]*",
            re.IGNORECASE,
        )

        # Pattern 2: Scale indicators — "X+ users/transactions/etc"
        scale_pattern = re.compile(
            r"[^.!?\n]*\b(\d[\d,]*[KMBkmb]?\+?\s*(?:users|customers|clients|transactions|"
            r"requests|engineers|team\s+members|developers|employees|products|projects|"
            r"services|systems|APIs|endpoints))\b[^.!?\n]*",
            re.IGNORECASE,
        )

        # Pattern 3: Percentage improvement/reduction sentences
        percent_pattern = re.compile(
            r"[^.!?\n]*\b(\d+\s*%\s*(?:improvement|reduction|increase|decrease|faster|"
            r"growth|efficiency|accuracy|savings|uplift|gain|drop|boost))\b[^.!?\n]*",
            re.IGNORECASE,
        )

        for pattern in (impact_pattern, scale_pattern, percent_pattern):
            for m in pattern.finditer(text):
                highlight = m.group().strip()
                # Remove leading bullet/dash/whitespace artifacts
                highlight = re.sub(r"^[\s•\-–—*·]+", "", highlight).strip()
                # Keep reasonable length
                if len(highlight) < 20 or len(highlight) > 200:
                    continue
                key = re.sub(r"\s+", " ", highlight.lower())
                if key not in seen:
                    seen.add(key)
                    highlights.append(highlight)
                if len(highlights) >= 6:
                    break
            if len(highlights) >= 6:
                break

        return highlights[:6]

    def extract_email(self, text: str) -> Optional[str]:
        pattern = r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
        matches = re.findall(pattern, text)
        # Filter out automated/placeholder emails
        for m in matches:
            if not any(x in m.lower() for x in ["noreply", "no-reply", "donotreply"]):
                return m.lower()
        return None

    def extract_phone(self, text: str) -> Optional[str]:
        patterns = [
            r"(?:\+\d{1,3}[\s\-]?)?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{4}",
            r"(?:\+91[\s\-]?)?\d{10}",  # Indian mobile
            r"\+\d{1,3}[\s\-]\d{4,15}",
        ]
        for pattern in patterns:
            m = re.search(pattern, text)
            if m:
                return m.group().strip()
        return None

    def extract_name(self, text: str) -> Optional[str]:
        """
        Heuristic: Name is usually in first 5 lines, all caps or title case,
        no numbers, and 2-4 words.
        """
        lines = [l.strip() for l in text.split("\n") if l.strip()][:8]
        for line in lines:
            # Skip lines with contact info
            if re.search(r"[@\d/\\|]", line):
                continue
            words = line.split()
            if 2 <= len(words) <= 4 and all(
                re.match(r"^[A-Za-z\.\-\']+$", w) for w in words
            ):
                return " ".join(w.title() for w in words)
        return None

    def extract_skills(self, text: str) -> list:
        """Match skills from taxonomy against CV text."""
        text_lower = text.lower()
        found = []
        for skill_lower, skill_original in ALL_SKILLS_LOWER.items():
            # Word-boundary match to avoid partial matches
            pattern = r"\b" + re.escape(skill_lower) + r"\b"
            if re.search(pattern, text_lower):
                found.append(skill_original)
        return list(dict.fromkeys(found))  # deduplicate preserving order

    def calculate_total_experience(self, text: str) -> float:
        """
        Extracts date ranges from experience sections and sums durations.
        Handles: 'Jan 2019 - Present', '2017 - 2020', 'March 2015 to June 2018'
        """
        # Pattern: Month/Year - Month/Year or Present
        date_range_pattern = r"""
            (?:January|February|March|April|May|June|July|August|September|
               October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)
            [\s,]+(\d{4})
            \s*(?:–|—|-|to)\s*
            (?:(?:January|February|March|April|May|June|July|August|September|
                  October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)
               [\s,]+(\d{4})|Present|Current|Now)
        """
        year_only_pattern = r"(\d{4})\s*(?:–|—|-|to)\s*(\d{4}|Present|Current)"

        total_months = 0
        current_year = datetime.now().year

        # Try month-year ranges first
        matches = re.finditer(date_range_pattern, text, re.VERBOSE | re.IGNORECASE)
        ranges = []
        for m in matches:
            start_year = int(m.group(1))
            end_raw = m.group(2)
            end_year = current_year if not end_raw else int(end_raw)
            if 1980 <= start_year <= current_year and start_year <= end_year:
                ranges.append((start_year, end_year))

        # Fallback: year-only ranges
        if not ranges:
            for m in re.finditer(year_only_pattern, text, re.IGNORECASE):
                start_year = int(m.group(1))
                end_raw = m.group(2)
                end_year = current_year if end_raw.lower() in ("present", "current") else int(end_raw)
                if 1980 <= start_year <= current_year and start_year <= end_year:
                    ranges.append((start_year, end_year))

        # Sum non-overlapping ranges
        if ranges:
            ranges.sort()
            merged = [ranges[0]]
            for start, end in ranges[1:]:
                if start <= merged[-1][1]:
                    merged[-1] = (merged[-1][0], max(merged[-1][1], end))
                else:
                    merged.append((start, end))
            total_years = sum(end - start for start, end in merged)
            return round(min(total_years, 50), 1)  # cap at 50

        return 0.0

    def extract_experience_entries(self, text: str) -> list:
        """Extract individual job entries as structured dicts."""
        entries = []
        # Match job title + company + date range patterns
        pattern = r"""
            (?P<role>[A-Z][A-Za-z\s/\-&,]+(?:Engineer|Developer|Manager|Lead|Analyst|
                                               Designer|Consultant|Director|Officer|
                                               Architect|Scientist|Specialist|Head)
            )\s*(?:at|@|,|\n)\s*
            (?P<company>[A-Z][A-Za-z\s\.,&'-]{2,50})
        """
        for m in re.finditer(pattern, text, re.VERBOSE):
            entries.append({
                "role": m.group("role").strip(),
                "company": m.group("company").strip(),
                "startDate": None,
                "endDate": None,
                "durationYears": 0,
                "description": "",
            })

        return entries[:10]  # max 10 entries from rules

    def extract_education(self, text: str) -> list:
        """Extract education entries."""
        entries = []
        degree_pattern = r"(?i)(Bachelor|Master|B\.?Tech|M\.?Tech|B\.?E|M\.?E|" \
                         r"B\.?Sc|M\.?Sc|Ph\.?D|MBA|BCA|MCA|B\.?Com|M\.?Com)" \
                         r"[^.\n]{0,80}"
        for m in re.finditer(degree_pattern, text):
            entries.append({
                "degree": m.group().strip(),
                "institution": None,
                "year": None,
            })
        return entries[:5]

    def extract_certifications(self, text: str) -> list:
        """Extract certification names."""
        cert_pattern = r"(?i)(AWS|Azure|GCP|Google|Oracle|Cisco|Certified|" \
                       r"Certificate|Certification|PMP|Scrum|ITIL|CPA|CFA)" \
                       r"[^.\n]{0,60}"
        found = []
        for m in re.finditer(cert_pattern, text):
            cert = m.group().strip()
            if len(cert) > 10:
                found.append(cert)
        return list(set(found))[:10]

    def infer_domain(self, text: str) -> list:
        """Infer industry domain from text."""
        domain_keywords = {
            "FinTech": ["banking", "finance", "payment", "trading", "insurance", "fintech"],
            "Healthcare": ["health", "medical", "clinical", "hospital", "pharma", "ehr"],
            "E-commerce": ["ecommerce", "retail", "marketplace", "inventory", "cart"],
            "SaaS": ["saas", "b2b", "subscription", "multi-tenant", "platform"],
            "AI/ML": ["machine learning", "deep learning", "neural", "nlp", "llm", "model"],
            "Cloud": ["cloud", "aws", "azure", "gcp", "infrastructure", "devops"],
            "EdTech": ["education", "learning", "course", "student", "teaching"],
            "Gaming": ["game", "unity", "unreal", "gaming", "player"],
        }
        text_lower = text.lower()
        found = []
        for domain, keywords in domain_keywords.items():
            if any(kw in text_lower for kw in keywords):
                found.append(domain)
        return found[:5]

    def extract_traits(self, text: str) -> list:
        """Return list of inferred trait labels."""
        text_lower = text.lower()
        traits = []
        for trait, keywords in TRAIT_KEYWORDS.items():
            matches = sum(1 for kw in keywords if kw in text_lower)
            if matches >= 2:
                traits.append(trait.replace("_", " ").title())
        return traits

    def score_traits(self, text: str) -> dict:
        """Return normalized 0.0-1.0 scores per trait."""
        text_lower = text.lower()
        scores = {}
        for trait, keywords in TRAIT_KEYWORDS.items():
            matches = sum(1 for kw in keywords if kw in text_lower)
            score = min(matches / max(len(keywords) * 0.4, 1), 1.0)
            scores[trait] = round(score, 3)
        return scores

    def _is_team_player(self, text: str) -> bool:
        team_keywords = ["team", "collaborated", "cross-functional", "together",
                         "pair programming", "code review", "sprint", "stand-up"]
        text_lower = text.lower()
        return sum(1 for kw in team_keywords if kw in text_lower) >= 2

    def _extract_leadership_evidence(self, text: str) -> list:
        """Find specific sentences showing leadership."""
        evidence = []
        sentences = re.split(r"[.\n]", text)
        lead_terms = ["managed", "led", "built", "founded", "hired", "mentored",
                      "directed", "oversaw", "established", "supervised"]
        for sentence in sentences:
            s = sentence.strip()
            if len(s) > 20 and any(term in s.lower() for term in lead_terms):
                evidence.append(s[:150])
                if len(evidence) >= 5:
                    break
        return evidence


# Module-level singleton
rule_extractor = RuleBasedExtractor()
