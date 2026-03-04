"""
INGESTION MODULE — Text Cleaner
Preprocesses raw CV text before sending to LLM or rule-based extractor.
"""

import re
from loguru import logger


class TextCleaner:
    """
    Cleans and normalizes CV text for optimal LLM parsing.
    - Removes noise (page numbers, headers, watermarks)
    - Normalizes dates and phone formats
    - Chunks text to fit LLM context windows
    """

    # Maximum characters to send to LLM (safe for 8K token window)
    MAX_CHARS = 12000

    def clean(self, text: str) -> str:
        """Full cleaning pipeline."""
        text = self._remove_page_numbers(text)
        text = self._remove_repeated_headers(text)
        text = self._normalize_bullets(text)
        text = self._normalize_dates(text)
        text = self._normalize_whitespace(text)
        return text.strip()

    def truncate_for_llm(self, text: str, max_chars: int = None) -> str:
        """
        Intelligently truncate text to fit LLM context window.
        Prefers keeping the beginning and end (name/contact at start,
        recent experience at beginning, education at end).
        """
        limit = max_chars or self.MAX_CHARS
        if len(text) <= limit:
            return text

        # Keep first 70% + last 30% — contact info at top, education at bottom
        head_len = int(limit * 0.70)
        tail_len = limit - head_len
        head = text[:head_len]
        tail = text[-tail_len:]
        logger.debug(f"Text truncated: {len(text)} → {limit} chars")
        return head + "\n\n[...truncated...]\n\n" + tail

    def extract_sections(self, text: str) -> dict:
        """
        Heuristically split CV text into sections for targeted processing.
        Returns: {section_name: section_text}
        """
        section_patterns = {
            "contact": r"(?i)(contact|personal\s+info|profile)",
            "summary": r"(?i)(summary|objective|profile|about\s+me)",
            "experience": r"(?i)(experience|employment|work\s+history|career)",
            "education": r"(?i)(education|academic|qualification|degree)",
            "skills": r"(?i)(skills|technologies|competencies|technical)",
            "certifications": r"(?i)(certif|training|courses|awards)",
            "projects": r"(?i)(projects|portfolio|works)",
        }

        sections = {}
        lines = text.split("\n")
        current_section = "header"
        current_lines = []

        for line in lines:
            stripped = line.strip()
            if not stripped:
                current_lines.append("")
                continue

            matched_section = None
            for section_name, pattern in section_patterns.items():
                # A section header is typically a short line (< 50 chars)
                if len(stripped) < 50 and re.search(pattern, stripped):
                    matched_section = section_name
                    break

            if matched_section:
                sections[current_section] = "\n".join(current_lines).strip()
                current_section = matched_section
                current_lines = []
            else:
                current_lines.append(line)

        sections[current_section] = "\n".join(current_lines).strip()
        return {k: v for k, v in sections.items() if v}

    # ─── Private Cleaners ──────────────────────────────────────────────────────

    def _remove_page_numbers(self, text: str) -> str:
        """Remove standalone page number lines like 'Page 1 of 3' or just '2'."""
        text = re.sub(r"(?m)^Page\s+\d+\s+of\s+\d+\s*$", "", text)
        text = re.sub(r"(?m)^\s*\d+\s*$", "", text)
        return text

    def _remove_repeated_headers(self, text: str) -> str:
        """Remove repeated header/footer lines (seen 3+ times)."""
        lines = text.split("\n")
        line_count: dict = {}
        for line in lines:
            stripped = line.strip()
            if len(stripped) > 5:
                line_count[stripped] = line_count.get(stripped, 0) + 1

        repeated = {line for line, count in line_count.items() if count >= 3}
        if repeated:
            lines = [l for l in lines if l.strip() not in repeated]

        return "\n".join(lines)

    def _normalize_bullets(self, text: str) -> str:
        """Normalize bullet point characters to standard dashes."""
        return re.sub(r"(?m)^[\s]*[•·▪▸►◆◇●○→–—]\s*", "- ", text)

    def _normalize_dates(self, text: str) -> str:
        """Standardize common date formats for easier LLM parsing."""
        # Jan 2020 → January 2020
        month_map = {
            "Jan": "January", "Feb": "February", "Mar": "March",
            "Apr": "April", "Jun": "June", "Jul": "July",
            "Aug": "August", "Sep": "September", "Oct": "October",
            "Nov": "November", "Dec": "December",
        }
        for abbr, full in month_map.items():
            text = re.sub(rf"\b{abbr}\b\.?", full, text)
        return text

    def _normalize_whitespace(self, text: str) -> str:
        """Final whitespace normalization."""
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text


text_cleaner = TextCleaner()
