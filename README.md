# NaukriAI — AI-Powered CV Parsing & Job Matching

A fully local, privacy-first recruitment platform. Upload CVs, parse them with a local LLM (Mistral 7B via Ollama), and match candidates to jobs using a 4-dimensional scoring algorithm — no cloud APIs, no data leaves your machine.

---

## Features

### Job Seekers
- Upload PDF/DOCX CVs — parsed instantly by local AI
- Auto-matched against all active job postings (80%+ score threshold)
- View match breakdown: skills fit, experience, domain, behavioral
- Browse job listings with keyword/location search
- Key achievement highlights extracted from your CV

### Recruiters
- Batch upload CVs for candidate pipeline ingestion
- Create job postings with skill requirements and experience range
- Ranked candidate list per job with score breakdown
- Filter candidates by skills, experience, and domain
- Skill distribution analytics across all matched candidates
- Update application status (Pending → Reviewed → Shortlisted → Rejected)

### Technical Highlights
- **100% local inference** — Mistral 7B via Ollama, no OpenAI/Anthropic keys
- **Hybrid parsing** — LLM + regex rules for robust extraction
- **Semantic embeddings** — BAAI/bge-small-en-v1.5 for behavioral fit scoring
- **Fine-tuning ready** — QLoRA training script included for domain adaptation
- Fully containerised with Docker Compose (5 services, health checks, auto-migrations)

---

## Tech Stack

| Layer | Stack |
|---|---|
| **Frontend** | Next.js 16, React 18, TypeScript, Tailwind CSS |
| **Backend** | Node.js 20, Express, Prisma ORM, PostgreSQL 16 |
| **AI Engine** | Python 3.11, FastAPI, Ollama (Mistral 7B / Phi-3) |
| **Embeddings** | sentence-transformers — BAAI/bge-small-en-v1.5 |
| **NLP** | spaCy en_core_web_sm + custom regex extractors |
| **Auth** | JWT (7-day expiry) |
| **Infra** | Docker Compose, Uvicorn, Multer, pdf-parse, mammoth |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Docker Compose                    │
│                                                     │
│  ┌──────────┐    ┌──────────┐    ┌───────────────┐  │
│  │ frontend │───▶│ backend  │───▶│  ai-engine    │  │
│  │ Next.js  │    │ Express  │    │  FastAPI      │  │
│  │ :3000    │    │ :5000    │    │  :8000        │  │
│  └──────────┘    └────┬─────┘    └──────┬────────┘  │
│                       │                 │           │
│                  ┌────▼─────┐    ┌──────▼────────┐  │
│                  │ postgres │    │    ollama     │  │
│                  │ :5432    │    │    :11434     │  │
│                  └──────────┘    └───────────────┘  │
└─────────────────────────────────────────────────────┘
```

The **backend** handles auth, file uploads, job management, and orchestrates AI calls.
The **ai-engine** handles CV text extraction, LLM parsing, embedding generation, and scoring.
**Ollama** runs the LLM (Mistral 7B) locally — the ai-engine calls it over HTTP.

---

## Matching Algorithm

Each CV–job pair is scored across 4 dimensions:

| Dimension | Weight | Method |
|---|---|---|
| Skills | 40% | Jaccard similarity with fuzzy matching |
| Experience | 25% | Years overlap with range penalties |
| Domain Expertise | 20% | Industry tag matching |
| Behavioral Fit | 15% | Cosine similarity of text embeddings |

Only matches with a **combined score ≥ 80%** are shown (configurable via `MIN_MATCH_SCORE`).

---

## Quick Start (Docker)

### Prerequisites
- Docker & Docker Compose
- 16 GB RAM (Mistral 7B needs ~8 GB)
- 20 GB free disk space
- NVIDIA GPU optional but recommended for faster inference

### 1. Clone & configure

```bash
git clone https://github.com/sa9446/naukri.ai.git
cd naukri.ai

cp backend/.env.example backend/.env
cp ai-engine/.env.example ai-engine/.env
```

Edit `backend/.env` — at minimum set a strong `JWT_SECRET` and `INTERNAL_API_KEY`:

```env
JWT_SECRET=your-long-random-secret-here
INTERNAL_API_KEY=your-internal-key-here
DATABASE_URL=postgresql://postgres:password@postgres:5432/naukri_cv_db
AI_ENGINE_URL=http://ai-engine:8000
```

### 2. Start all services

```bash
docker-compose up -d
```

Watch until all services are healthy:

```bash
docker-compose ps
```

### 3. Pull the LLM model (first time only)

```bash
docker exec naukri_ollama ollama pull mistral:7b-instruct-v0.3-q4_K_M
# ~4.1 GB download, takes 3–5 min
```

Low-VRAM alternative (needs < 4 GB RAM):

```bash
docker exec naukri_ollama ollama pull phi3:mini
# Then set OLLAMA_MODEL=phi3:mini in ai-engine/.env and restart
```

### 4. Open the app

| Service | URL |
|---|---|
| Web app | http://localhost:3000 |
| Backend API | http://localhost:5000/api |
| AI engine (Swagger) | http://localhost:8000/docs |

Register at `/auth/register` as **Job Seeker** or **Recruiter**.

---

## Local Development (No Docker)

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env: point DATABASE_URL to your local Postgres

npm install
npx prisma migrate dev
npx prisma generate
npm run dev          # http://localhost:5000
```

### AI Engine

```bash
cd ai-engine
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate

pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
python -m spacy download en_core_web_sm

# Start Ollama separately
ollama serve
ollama pull mistral:7b-instruct-v0.3-q4_K_M

cp .env.example .env
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
# Create .env.local with: NEXT_PUBLIC_API_URL=http://localhost:5000/api
npm run dev          # http://localhost:3000
```

---

## Environment Variables

### `backend/.env`

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/naukri_cv_db
JWT_SECRET=change-this-to-a-long-random-string
JWT_EXPIRES_IN=7d

AI_ENGINE_URL=http://localhost:8000
INTERNAL_API_KEY=internal-service-key-change-in-production

PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=10

MIN_MATCH_SCORE=0.80
WEIGHT_SKILLS=0.40
WEIGHT_EXPERIENCE=0.25
WEIGHT_DOMAIN=0.20
WEIGHT_BEHAVIORAL=0.15
```

### `ai-engine/.env`

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=mistral:7b-instruct-v0.3-q4_K_M
OLLAMA_FALLBACK_MODEL=phi3:mini
OLLAMA_TIMEOUT=120

INTERNAL_API_KEY=internal-service-key-change-in-production
AI_ENGINE_PORT=8000

LLM_TEMPERATURE=0.1
LLM_MAX_TOKENS=4096
```

---

## API Reference

### Auth — `/api/auth`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/register` | — | Register (role: `JOB_SEEKER` or `RECRUITER`) |
| POST | `/login` | — | Login, returns JWT |
| GET | `/me` | JWT | Current user profile |
| PUT | `/profile` | JWT | Update profile fields |

### Jobs — `/api/jobs` (public)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | List jobs — query: `keyword`, `location`, `skills`, `page` |
| GET | `/:id` | Single job detail |

### Job Seeker — `/api/job-seeker` (JWT, JOB_SEEKER role)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/cv/upload` | Upload CV (PDF/DOCX, multipart) |
| GET | `/cv` | List my CVs with match counts |
| GET | `/cv/:id/matches` | Get job matches for a CV |
| POST | `/cv/:id/match` | Re-run matching for a CV |
| DELETE | `/cv/:id` | Delete CV and all its matches |

### Recruiter — `/api/recruiter` (JWT, RECRUITER role)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/cv/batch` | Batch upload CVs (multipart, up to 50 files) |
| POST | `/jobs` | Create job posting |
| GET | `/jobs` | List my job postings |
| GET | `/jobs/:id/candidates` | Ranked candidates — query: `skills`, `minExperience`, `domain` |
| GET | `/jobs/:id/skills` | Skill distribution for a job |
| GET | `/dashboard` | Aggregate stats |
| POST | `/scrape` | Trigger job scraping (LinkedIn / Naukri / Indeed) |
| PATCH | `/matches/:id/status` | Update application status |

---

## Fine-tuning (Optional)

Fine-tune Mistral 7B on your own CV dataset for better domain-specific parsing.

**Requires:** NVIDIA GPU with 8 GB+ VRAM.
**No GPU?** Use the included Google Colab notebook: `ai-engine/finetuning/train_colab.ipynb`

### Steps

1. Expand `ai-engine/finetuning/dataset_examples.jsonl` with your own examples:

```jsonl
{"instruction": "Parse this CV into structured JSON", "input": "John Doe\nReact Developer...", "output": "{\"fullName\": \"John Doe\", \"skills\": [\"React\",...]}"}
```

2. Install training dependencies:

```bash
pip install unsloth trl peft bitsandbytes datasets transformers
```

3. Run training (~30–40 min on RTX 4090):

```bash
cd ai-engine
python finetuning/train.py
# Output: ./models/naukri-cv-parser-lora/model.gguf
```

4. Load into Ollama:

```bash
# Update ai-engine/setup/Modelfile FROM line to point to your .gguf
ollama create naukri-cv-parser -f ai-engine/setup/Modelfile
# Set OLLAMA_MODEL=naukri-cv-parser in ai-engine/.env
```

---

## Project Structure

```
naukri.ai/
├── docker-compose.yml
├── backend/
│   ├── src/
│   │   ├── app.js
│   │   ├── controllers/        auth, jobSeeker, recruiter, profile
│   │   ├── services/           aiInference, cvExtraction, jobMatching, scraper, analytics
│   │   ├── routes/             auth, job, jobSeeker, recruiter
│   │   ├── middleware/         auth (JWT), upload (Multer)
│   │   └── config/             database (Prisma), logger (Winston)
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   └── Dockerfile
├── ai-engine/
│   ├── main.py
│   ├── inference/              ollama_client, embedder, prompts
│   ├── nlp/                    rule_extractor (regex fallback)
│   ├── formatter/              output (merge + validate)
│   ├── models/                 schemas (Pydantic)
│   ├── scoring/                matcher (4D algorithm)
│   ├── ingestion/              file_parser, text_cleaner
│   ├── finetuning/             train.py, train_colab.ipynb, dataset_examples.jsonl
│   ├── setup/                  Modelfile, install scripts
│   └── Dockerfile
└── frontend/
    └── src/
        ├── app/
        │   ├── auth/           login, register
        │   ├── job-seeker/     dashboard, upload-cv, job-matches, jobs
        │   ├── recruiter/      dashboard, upload-cvs, candidates
        │   └── settings/
        ├── components/         Navbar, CandidateCard, JobMatchCard
        └── lib/                api.ts (Axios), auth.ts (JWT helpers)
```

---

## Database Schema

```
users ──┬── job_seeker_profiles ── cvs ── candidate_analyses
        │                              └── job_matches ──┐
        └── recruiter_profiles ── job_postings ──────────┘
```

Key fields: `candidate_analyses` stores skills, experience, embeddings, highlights, behavioral traits. `job_matches` stores 4D scores and match reasons JSON.

---

## License

MIT
