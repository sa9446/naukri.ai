"""
NaukriAI — Self-Hosted AI Engine
FastAPI service providing fully local CV parsing, skill extraction,
trait inference, and job matching. No cloud API required.

Architecture:
  Browser → Node.js API (5000) → THIS SERVICE (8000) → Ollama (11434)
                                                      → sentence-transformers (local)
"""

import os
import time
import asyncio
from contextlib import asynccontextmanager
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Header, UploadFile, File, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from loguru import logger
from dotenv import load_dotenv

load_dotenv()

# ─── Internal modules ─────────────────────────────────────────────────────────
from ingestion.file_parser import file_parser
from ingestion.text_cleaner import text_cleaner
from nlp.rule_extractor import rule_extractor
from inference.ollama_client import ollama_client
from inference.prompts import prompts
from inference.embedder import embedder
from scoring.matcher import job_matcher
from formatter.output import output_formatter
from models.schemas import (
    ParseCVRequest, ParseCVResponse, ParsedCV,
    EmbedRequest, EmbedResponse, HealthResponse,
    InferenceMode,
)

INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "internal-service-key-change-in-production")


# ─── Lifespan (startup/shutdown) ──────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Warm up models on startup."""
    logger.info("AI Engine starting up...")

    # Check Ollama availability
    ollama_ok = await ollama_client.is_available()
    if ollama_ok:
        model = await ollama_client.get_active_model()
        logger.info(f"Ollama ready. Active model: {model}")
    else:
        logger.warning(
            "Ollama not available! Will use rule-based fallback.\n"
            "To enable LLM: run 'ollama serve' and 'ollama pull mistral:7b-instruct-v0.3-q4_K_M'"
        )

    # Pre-load embedding model (lazy load on first use — no blocking here)
    logger.info("Embedding model will load on first request.")
    logger.info("AI Engine ready.")
    yield

    logger.info("AI Engine shutting down.")


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="NaukriAI Local Inference Engine",
    description="Self-hosted CV parsing, skill extraction, and job matching. No cloud API required.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Auth ──────────────────────────────────────────────────────────────────────

async def verify_internal_key(x_internal_key: Optional[str] = Header(None)):
    """Verify that the request comes from our own Node.js backend."""
    if x_internal_key != INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid internal API key")
    return True


# ─── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse)
async def health():
    """Service health check — reports Ollama and model status."""
    ollama_ok = await ollama_client.is_available()
    model = await ollama_client.get_active_model() if ollama_ok else None
    return HealthResponse(
        status="ok",
        ollamaAvailable=ollama_ok,
        modelLoaded=model is not None,
        embeddingModel=embedder.model_name,
    )


@app.post("/parse-cv", response_model=ParseCVResponse)
async def parse_cv(
    request: ParseCVRequest,
    _auth: bool = Depends(verify_internal_key),
):
    """
    Parse raw CV text into structured JSON.

    Flow:
    1. Clean and truncate text
    2. Run LLM parsing (Ollama) in parallel with rule-based extraction
    3. Run trait inference via LLM
    4. Generate embedding for semantic matching
    5. Merge outputs and return validated ParsedCV
    """
    start_ms = int(time.time() * 1000)
    raw_text = request.raw_text
    mode = request.mode

    cleaned = text_cleaner.clean(raw_text)
    truncated = text_cleaner.truncate_for_llm(cleaned)

    llm_output = {}
    rules_output = {}
    trait_output = {}
    cv_embedding = None

    use_llm = mode in (InferenceMode.LLM, InferenceMode.HYBRID)

    # ── Run rule-based extraction (always, fast) ──────────────────────────────
    rules_output = rule_extractor.extract_all(cleaned)
    logger.debug("Rule-based extraction complete")

    # ── Run LLM extraction (if available) ─────────────────────────────────────
    if use_llm:
        ollama_ok = await ollama_client.is_available()
        if ollama_ok:
            try:
                # CV parsing via LLM
                cv_prompt = prompts.cv_parsing_prompt(truncated)
                llm_output = await ollama_client.generate_json(cv_prompt)
                logger.debug("LLM CV parsing complete")

            except Exception as e:
                logger.error(f"LLM inference failed: {e}. Falling back to rules.")
                if mode == InferenceMode.LLM:
                    raise HTTPException(
                        status_code=503,
                        detail=f"LLM unavailable: {e}. Set mode=rules for fallback."
                    )
                # HYBRID: continue with rules only
        else:
            if mode == InferenceMode.LLM:
                raise HTTPException(
                    status_code=503,
                    detail="Ollama is not running. Start with: ollama serve"
                )

    # ── Generate local embedding ───────────────────────────────────────────────
    try:
        cv_embedding = embedder.embed(truncated[:8000])
        logger.debug(f"Embedding generated: {len(cv_embedding)} dims")
    except Exception as e:
        logger.warning(f"Embedding failed: {e}")
        cv_embedding = None

    # ── Determine final inference mode ────────────────────────────────────────
    actual_mode = InferenceMode.RULES
    if llm_output and rules_output:
        actual_mode = InferenceMode.HYBRID
    elif llm_output:
        actual_mode = InferenceMode.LLM

    # ── Merge and format output ────────────────────────────────────────────────
    parsed_cv = output_formatter.merge_and_format(
        llm_output, rules_output, cv_embedding, actual_mode
    )

    elapsed_ms = int(time.time() * 1000) - start_ms
    logger.info(f"CV parsed in {elapsed_ms}ms [mode={actual_mode}]")

    return ParseCVResponse(
        success=True,
        data=parsed_cv,
        processingTimeMs=elapsed_ms,
    )


@app.post("/parse-cv/file", response_model=ParseCVResponse)
async def parse_cv_file(
    file: UploadFile = File(...),
    mode: InferenceMode = InferenceMode.HYBRID,
    _auth: bool = Depends(verify_internal_key),
):
    """
    Upload and parse a CV file directly (PDF/DOCX/TXT).
    Combines file parsing + CV parsing in one call.
    """
    content = await file.read()
    try:
        raw_text = file_parser.parse_bytes(content, file.content_type or "", file.filename or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return await parse_cv(
        ParseCVRequest(rawText=raw_text, mode=mode),
        _auth=True,
    )


@app.post("/embed", response_model=EmbedResponse)
async def generate_embedding(
    request: EmbedRequest,
    _auth: bool = Depends(verify_internal_key),
):
    """
    Generate a semantic embedding for any text.
    Uses local sentence-transformers model (BAAI/bge-small-en-v1.5).
    """
    try:
        emb = embedder.embed(request.text, truncate=request.truncate)
        return EmbedResponse(
            embedding=emb,
            model=embedder.model_name,
            dimensions=len(emb),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding failed: {e}")


@app.post("/score-match")
async def score_match(
    request: dict,
    _auth: bool = Depends(verify_internal_key),
):
    """
    Score a single candidate-job pair.
    Body: { candidate: ParsedCV, job: JobPosting }
    """
    candidate = request.get("candidate", {})
    job = request.get("job", {})

    if not candidate or not job:
        raise HTTPException(status_code=400, detail="candidate and job are required")

    cv_emb = candidate.get("embedding")
    job_emb = job.get("embedding")

    result = job_matcher.score_match(candidate, job, cv_emb, job_emb)
    return result


@app.post("/rank-candidates")
async def rank_candidates(
    request: dict,
    _auth: bool = Depends(verify_internal_key),
):
    """
    Rank multiple candidates for a single job.
    Body: { candidates: [ParsedCV], job: JobPosting, minScore: float }
    """
    candidates = request.get("candidates", [])
    job = request.get("job", {})
    min_score = float(request.get("minScore", 0.80))

    if not candidates or not job:
        raise HTTPException(status_code=400, detail="candidates and job are required")

    ranked = job_matcher.rank_candidates(candidates, job, min_score)
    return {"total": len(ranked), "results": ranked}


@app.get("/models")
async def list_models(_auth: bool = Depends(verify_internal_key)):
    """List all locally available Ollama models."""
    models = await ollama_client.list_models()
    return {"models": models, "active": ollama_client._active_model}


@app.post("/models/pull")
async def pull_model(
    request: dict,
    _auth: bool = Depends(verify_internal_key),
):
    """Pull a model from Ollama registry (requires internet once)."""
    model = request.get("model", "mistral:7b-instruct-v0.3-q4_K_M")
    asyncio.create_task(ollama_client.pull_model(model))
    return {"message": f"Model pull started for: {model}. Check /health for status."}


# ─── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("AI_ENGINE_PORT", "8000"))
    host = os.getenv("AI_ENGINE_HOST", "0.0.0.0")
    uvicorn.run("main:app", host=host, port=port, reload=True, log_level="info")
