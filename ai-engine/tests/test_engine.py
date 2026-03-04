"""
Integration tests for the AI engine.
Run: python -m pytest tests/ -v
"""

import pytest
import httpx
import asyncio

BASE_URL = "http://localhost:8000"
HEADERS = {"x-internal-key": "internal-service-key-change-in-production"}

SAMPLE_CV = """
Jane Doe
jane.doe@example.com | +91 9876543210 | Bangalore

Senior Software Engineer at Razorpay (Jan 2021 - Present)
- Built payment processing microservices handling 1M+ transactions/day
- Led team of 6 engineers across backend and frontend
- Reduced API latency by 40% through Redis caching and query optimization

Software Engineer at Swiggy (June 2018 - Dec 2020)
- Developed real-time order tracking using WebSockets and Node.js
- Worked with React and TypeScript for consumer-facing apps

B.Tech Computer Science, BITS Pilani, 2018

Skills: Python, Node.js, React, TypeScript, PostgreSQL, Redis, Docker, Kubernetes, AWS
Certifications: AWS Solutions Architect Associate
"""


@pytest.mark.asyncio
async def test_health():
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{BASE_URL}/health", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        print(f"Ollama: {data['ollamaAvailable']}, Model: {data['modelLoaded']}")


@pytest.mark.asyncio
async def test_parse_cv_rules_mode():
    """Test CV parsing with rule-based fallback (no Ollama needed)."""
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{BASE_URL}/parse-cv",
            json={"rawText": SAMPLE_CV, "mode": "rules"},
            headers=HEADERS,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        parsed = data["data"]

        # Basic field checks
        assert parsed.get("email") == "jane.doe@example.com"
        assert len(parsed.get("skills", [])) > 3
        assert parsed.get("totalExperienceYears", 0) > 0
        print(f"Rules mode: {len(parsed['skills'])} skills, {parsed['totalExperienceYears']}y exp")


@pytest.mark.asyncio
async def test_parse_cv_hybrid_mode():
    """Test CV parsing with hybrid mode (LLM + rules)."""
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{BASE_URL}/parse-cv",
            json={"rawText": SAMPLE_CV, "mode": "hybrid"},
            headers=HEADERS,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        parsed = data["data"]
        print(f"Hybrid mode: confidence={parsed.get('confidence')}, "
              f"mode={parsed.get('inferenceMode')}")


@pytest.mark.asyncio
async def test_embedding():
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{BASE_URL}/embed",
            json={"text": "Senior Python developer with FastAPI and PostgreSQL experience"},
            headers=HEADERS,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["embedding"]) > 0
        assert data["dimensions"] > 0
        print(f"Embedding: {data['dimensions']} dims, model={data['model']}")


@pytest.mark.asyncio
async def test_score_match():
    candidate = {
        "skills": ["Python", "FastAPI", "PostgreSQL", "Docker", "AWS"],
        "totalExperienceYears": 5.0,
        "domainExpertise": ["FinTech", "SaaS"],
        "behavioralFit": {"traits": ["Leadership", "Analytical Ability"]},
    }
    job = {
        "requiredSkills": ["Python", "FastAPI", "PostgreSQL", "Redis"],
        "experienceMin": 3,
        "experienceMax": 7,
        "domain": "FinTech",
        "description": "Backend engineer for fintech platform",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{BASE_URL}/score-match",
            json={"candidate": candidate, "job": job},
            headers=HEADERS,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "overallScore" in data
        assert 0.0 <= data["overallScore"] <= 1.0
        print(f"Match score: {data['overallScore']:.2%}")
        print(f"  Skills: {data['skillsScore']:.2%}")
        print(f"  Experience: {data['experienceScore']:.2%}")
        print(f"  Domain: {data['domainScore']:.2%}")
        print(f"  Behavioral: {data['behavioralScore']:.2%}")


if __name__ == "__main__":
    asyncio.run(test_parse_cv_rules_mode())
    asyncio.run(test_embedding())
    asyncio.run(test_score_match())
