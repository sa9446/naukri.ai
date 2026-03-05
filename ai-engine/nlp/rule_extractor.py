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
            "location": self.extract_location(text),
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

    def extract_location(self, text: str) -> Optional[str]:
        """Extract location from CV header lines."""
        # Search entire header (first 500 chars) for city/country patterns
        header = text[:500]
        location_pattern = re.compile(
            r"\b(?:Abu Dhabi|Mumbai|Delhi|Bangalore|Bengaluru|Hyderabad|Pune|Chennai|"
            r"Kolkata|Noida|Gurugram|Gurgaon|Ahmedabad|Jaipur|Chandigarh|"
            r"New York|San Francisco|London|Singapore|Dubai|Toronto|Sydney|Berlin|"
            r"Remote|Worldwide)\b"
            r"(?:[,\s]+(?:India|USA|UK|US|Canada|Australia|Germany|UAE|Singapore))?",
            re.IGNORECASE
        )
        m = location_pattern.search(header)
        if m:
            return m.group().strip()
        # Fallback: "Word, Word" pattern (City, Country) in header, not on email/phone line
        lines = [l.strip() for l in text.split("\n") if l.strip()][:10]
        generic_pattern = re.compile(
            r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*([A-Z]{2,3}|[A-Z][a-z]+)\b"
        )
        for line in lines:
            m = generic_pattern.search(line)
            if m and not re.search(r"\d|@|http", line):
                return m.group()
        return None

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
        """
        Extract job entries by looking for lines with BOTH a role title AND a date range.
        This avoids false positives from section headers or competency lists.
        """
        entries = []
        seen = set()

        # Date range pattern (reusable)
        DATE_MONTHS = r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
        DATE_RANGE = re.compile(
            rf"({DATE_MONTHS}\s+\d{{4}}|\d{{4}})\s*[–—\-]+\s*({DATE_MONTHS}\s+\d{{4}}|\d{{4}}|Present|Current|Now)",
            re.IGNORECASE
        )

        ROLE_KEYWORDS = re.compile(
            r"(?i)\b(Consultant|Director|Manager|Lead|Engineer|Analyst|Specialist|"
            r"Architect|Officer|Scientist|Developer|Head|Executive|President|"
            r"Principal|Coordinator|Advisor|Transformation Leader|Integration Leader|"
            r"Delivery Leader|Strategist)\b"
        )

        # Look for lines that contain BOTH a role keyword AND a date range
        lines = text.split("\n")
        for i, line in enumerate(lines):
            line = line.strip()
            date_match = DATE_RANGE.search(line)
            if not date_match:
                continue

            # Use text before the date range as role+company context
            pre_date = line[:date_match.start()].strip().rstrip("|–— ")

            # Only consider short lines (< 200 chars) to avoid bullet points
            # Also require a role keyword in the pre-date text
            if len(pre_date) > 200:
                continue
            role_kw = ROLE_KEYWORDS.search(pre_date)
            if not role_kw:
                # Check line above as fallback (role might be on prev line)
                if i > 0:
                    prev = lines[i-1].strip()
                    role_kw = ROLE_KEYWORDS.search(prev)
                    if role_kw:
                        pre_date = prev
                    else:
                        continue
                else:
                    continue

            # Split on "–" (en-dash) to separate role_part from location
            # e.g. "ROLE Company – Location" → pre = "ROLE Company"
            parts = re.split(r"\s*[–—]\s*", pre_date)
            role_section = parts[0].strip()   # "ROLE Company" or "ROLE – MORE TITLE Company"

            # If the role_section contains multiple "–" parts, try to rejoin smartly
            if len(parts) >= 2 and ROLE_KEYWORDS.search(parts[1]):
                role_section = f"{parts[0]} – {parts[1]}"

            # Extract role: everything up to and including the last role keyword
            kw_match = None
            for m in ROLE_KEYWORDS.finditer(role_section):
                kw_match = m
            if not kw_match:
                continue

            role_text = role_section[:kw_match.end()].strip()
            # Company: text after the role keyword (short, before any dash)
            after_kw = role_section[kw_match.end():].strip()
            company_text = re.match(r"([A-Z][A-Za-z0-9&\.\s]{1,25})", after_kw)
            company = company_text.group(1).strip() if company_text else ""

            start_raw = date_match.group(1)
            end_raw = date_match.group(2)

            key = role_text.lower().strip()
            if key not in seen and len(role_text) > 3:
                seen.add(key)
                entries.append({
                    "role": role_text,
                    "company": company,
                    "startDate": self._normalize_date_str(start_raw),
                    "endDate": "Present" if end_raw.lower() in ("present", "current", "now") else self._normalize_date_str(end_raw),
                    "durationYears": 0,
                    "description": "",
                })

        return entries[:10]

    def _normalize_date_str(self, s: str) -> Optional[str]:
        """Convert 'March 2021' or '2021' to 'YYYY-MM' or 'YYYY'."""
        MONTHS = {"january": "01", "february": "02", "march": "03", "april": "04",
                  "may": "05", "june": "06", "july": "07", "august": "08",
                  "september": "09", "october": "10", "november": "11", "december": "12",
                  "jan": "01", "feb": "02", "mar": "03", "apr": "04",
                  "jun": "06", "jul": "07", "aug": "08", "sep": "09",
                  "oct": "10", "nov": "11", "dec": "12"}
        s = s.strip()
        m = re.match(r"([A-Za-z]+)\s+(\d{4})", s)
        if m:
            month = MONTHS.get(m.group(1).lower(), "01")
            return f"{m.group(2)}-{month}"
        m = re.match(r"(\d{4})", s)
        if m:
            return m.group(1)
        return s

    def extract_education(self, text: str) -> list:
        """Extract education entries scoped to the Education section."""
        entries = []

        # Scope to the Education section if present
        edu_section = text
        edu_match = re.search(
            r"(?i)(?:^|\n)[ \t]*(?:EDUCATION|ACADEMIC|QUALIFICATION)\b[^\n]*\n(.*?)(?=\n[ \t]*[A-Z][A-Z &\-]{3,}\n|$)",
            text, re.DOTALL
        )
        if edu_match:
            edu_section = edu_match.group(1)

        # Require full-word matches — don't match "MBA" in "Mumbai", "Master" in "Scrum Master"
        # Negative lookbehind for "Scrum" to avoid matching "Scrum Master"
        degree_pattern = re.compile(
            r"(?i)(?<!Scrum\s)(?<!Scrum )\b"
            r"(Bachelor(?:'?s)?(?:\s+of\s+[A-Za-z\s]{2,30})?|Master(?:'?s)?(?:\s+of\s+[A-Za-z\s]{2,30})?"
            r"|B\.?\s*Tech|M\.?\s*Tech|B\.?\s*E\.?(?=[\s,\(])|M\.?\s*E\.?(?=[\s,\(])"
            r"|B\.?\s*Sc|M\.?\s*Sc|Ph\.?\s*D\.?|(?<!\w)MBA(?!\w)|BCA|MCA"
            r")\b"
        )
        seen = set()
        for m in degree_pattern.finditer(edu_section):
            start = m.start()
            # Get text from this position to end of line, trim at "|" delimiter
            line_text = edu_section[start:start + 200].split("\n")[0]
            snippet = line_text.split("|")[0].strip()  # trim at pipe (year separator)
            # Also trim at certification keywords to avoid bleeding into cert section
            for stop in ("Professional Certif", "Certif", "TOGAF", "ITIL"):
                if stop.lower() in snippet.lower():
                    snippet = snippet[:snippet.lower().find(stop.lower())].strip()
            if len(snippet) < 3:
                snippet = m.group().strip()
            # Strip trailing punctuation like ")" or ","
            snippet = snippet.rstrip(").,; ")
            key = m.group().lower().strip()
            if key not in seen and len(snippet) > 3:
                seen.add(key)
                # Try to extract year from the pipe-separated part
                year_match = re.search(r"(\d{4}(?:\s*[-–]\s*\d{4})?)", line_text)
                entries.append({
                    "degree": snippet,
                    "institution": None,
                    "year": year_match.group(1) if year_match else None,
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
        """Infer industry domain from text using word-boundary matching."""
        domain_keywords = {
            "FinTech": [r"\bbanking\b", r"\bfinance\b", r"\bpayment\b", r"\btrading\b", r"\binsurance\b", r"\bfintech\b"],
            "Healthcare": [r"\bhealth(?:care)?\b", r"\bmedical\b", r"\bclinical\b", r"\bhospital\b", r"\bpharma\b", r"\behr\b"],
            "E-commerce": [r"\becommerce\b", r"\bretail\b", r"\bmarketplace\b", r"\binventory\b"],
            "SaaS": [r"\bsaas\b", r"\bb2b\b", r"\bsubscription\b", r"\bmulti-tenant\b"],
            "AI/ML": [r"\bmachine learning\b", r"\bdeep learning\b", r"\bneural network\b", r"\bnlp\b", r"\bllm\b"],
            "Cloud/DevOps": [r"\bcloud\b", r"\baws\b", r"\bazure\b", r"\bgcp\b", r"\bdevops\b", r"\binfrastructure\b"],
            "EdTech": [r"\bedtech\b", r"\be-learning\b", r"\bonline learning\b", r"\bcourseware\b"],
            "Gaming": [r"\bgaming\b", r"\bvideo game\b", r"\bunity\b", r"\bunreal\b"],
        }
        text_lower = text.lower()
        found = []
        for domain, patterns in domain_keywords.items():
            if any(re.search(p, text_lower) for p in patterns):
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
