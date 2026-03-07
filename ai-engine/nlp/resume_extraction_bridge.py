"""
Bridge to ResumeDataExtraction repo.
Uses spacy + NLTK + skills.csv for enhanced NLP-based extraction from raw text.
Falls back gracefully if unavailable.
"""

import sys
import os
import re
from loguru import logger

REPO_PATH = "C:/Users/HP/ResumeDataExtraction"
_utils = None
_nlp = None
_available = False


def _load():
    global _utils, _nlp, _available

    if not os.path.isdir(REPO_PATH):
        logger.warning(f"ResumeDataExtraction repo not found at {REPO_PATH}")
        return

    try:
        if REPO_PATH not in sys.path:
            sys.path.insert(0, REPO_PATH)

        orig_dir = os.getcwd()
        os.chdir(REPO_PATH)

        import utils as repo_utils
        import spacy
        _utils = repo_utils
        _nlp = spacy.load("en_core_web_sm")
        _available = True
        logger.info("ResumeDataExtraction bridge loaded (spacy + skills.csv)")

        os.chdir(orig_dir)

    except Exception as e:
        logger.warning(f"ResumeDataExtraction bridge failed: {e}")
        _available = False


_load()


def is_available() -> bool:
    return _available


def extract_from_text(text: str) -> dict:
    """
    Run NLP-based extraction on raw CV text.
    Returns partial dict with enhanced fields to merge with regex extraction.
    """
    if not _available or _utils is None or _nlp is None:
        return {}

    orig_dir = os.getcwd()
    try:
        os.chdir(REPO_PATH)

        clean = " ".join(text.split())
        doc = _nlp(clean)
        noun_chunks = list(doc.noun_chunks)

        result = {}

        # Name via spacy NER (PERSON entities) from header section
        try:
            header_doc = _nlp(clean[:400])
            candidates = [
                ent.text.strip() for ent in header_doc.ents
                if ent.label_ == "PERSON"
                and not re.search(r"[\d@+]", ent.text)  # no digits/symbols
                and 2 <= len(ent.text.split()) <= 4      # 2-4 words
            ]
            if candidates:
                result["fullName"] = candidates[0]
        except Exception:
            pass

        # Email
        try:
            email = _utils.extract_email(text)
            if email:
                result["email"] = email
        except Exception:
            pass

        # Phone
        try:
            phone = _utils.extract_mobile_number(text)
            if phone:
                result["phone"] = str(phone)
        except Exception:
            pass

        # Skills from skills.csv — much richer than our hand-coded taxonomy
        try:
            skills = _utils.extract_skills(doc, noun_chunks)
            result["skills"] = [s for s in skills if s and len(s) > 1]
        except Exception:
            result["skills"] = []

        # Languages
        try:
            langs_file = os.path.join(REPO_PATH, "Language_Resume.csv")
            langs = _utils.extract_language(doc, noun_chunks, langs_file)
            result["languages"] = [
                l[0] if isinstance(l, tuple) else str(l)
                for l in (langs or []) if l
            ]
        except Exception:
            result["languages"] = []

        # Location: GPE entities from spacy (cities, countries)
        try:
            gpe_entities = [ent.text for ent in doc.ents if ent.label_ == "GPE" and len(ent.text) > 2]
            if gpe_entities:
                result["location"] = ", ".join(gpe_entities[:2])
        except Exception:
            pass

        os.chdir(orig_dir)
        return result

    except Exception as e:
        logger.warning(f"ResumeDataExtraction extract failed: {e}")
        os.chdir(orig_dir)
        return {}
