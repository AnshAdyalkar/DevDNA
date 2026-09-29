# DevDNA

> **Your code. Your skills. Your developer DNA.**

DevDNA is a developer intelligence platform that analyzes your GitHub repositories — commits, languages, architecture, documentation, testing practices — and converts raw data into an **evidence-backed Developer DNA Profile**, complete with skill gaps, a personalized learning roadmap, and interview preparation.

Every score in DevDNA is derived from **measurable signals** and ships with its **evidence**. No random numbers. No vanity metrics.

---

## The Growth Loop

```text
Connect GitHub → Analyze Profile → View Developer DNA → Understand Strengths
      → Discover Skill Gaps → Get Personalized Roadmap → Build Recommended Project
      → Take AI Interview → Track Improvement
```

---

## Architecture

```text
                ┌───────────────────────┐
                │   React + Vite (TS)   │
                │   Tailwind · Recharts │
                └───────────┬───────────┘
                     REST / Socket.IO
                ┌───────────▼───────────┐
                │  Node.js / Express    │
                │  API Gateway · JWT    │
                └───────┬───────┬───────┘
                        │       │
                ┌───────▼──┐ ┌──▼──────────┐
                │ MongoDB  │ │ GitHub API  │
                └──────────┘ └─────────────┘
                        │
                ┌───────▼────────────┐
                │ Python FastAPI     │
                │ Intelligence Engine│
                └────┬──────┬──────┬─┘
              Analytics   Scoring   DNA Engine
```

| Service | Port | Stack | Responsibility |
|---|---|---|---|
| `frontend/` | 5173 | React 19, Vite 7, TypeScript, Tailwind v4, TanStack Query, Zustand, Framer Motion, Recharts | UI, charts, state |
| `backend/` | 5000 | Express 5, TypeScript, Mongoose, Socket.IO, JWT, Zod | Auth, API gateway, GitHub sync, WebSockets |
| `intelligence/` | 8000 | FastAPI, Pydantic v2, NumPy, pandas, scikit-learn | Deterministic analysis: skills, complexity, behavior, DNA, gaps |
| MongoDB | 27017 | `mongo:7` (Docker) | Persistence |

The Node gateway calls the Python service **server-side only** with a shared internal key (`x-internal-key`) — the intelligence engine is never exposed to browsers.

---

## What's Implemented (Phase 6 — AI Developer Analyst & AI Interviewer)

- ✅ **AI Developer Analyst** — chat at `/dashboard/analyst` grounded in the developer's actual DNA, repositories, skill gaps and roadmap (Phases 4–5 data is the source of truth; the LLM only interprets it)
- ✅ **AI Interviewer** — `/dashboard/interview`: role/difficulty/type setup, LLM-generated questions personalized from real skills & repos, per-answer evaluation with feedback, adaptive difficulty + follow-ups, final report and history
- ✅ Provider abstraction (`generate` / `generateStructured` / `stream` / `healthCheck`) — OpenAI-compatible today, swappable tomorrow; `AI_PROVIDER=mock` for tests, fail-closed 503 `AI_NOT_CONFIGURED` when unset (never fake answers)
- ✅ Compact context builder + versioned prompts with grounding & prompt-injection fencing (repo text is untrusted data, never instructions)
- ✅ Conversation memory (`AIConversation`) and cached dashboard insights (`AIInsight` with deterministic `sourceDataVersion` + TTL), AI insight cards on the dashboard
- ✅ Security: JWT + ownership checks, dedicated AI rate limit (30 req/5 min), message/context caps, timeouts, key never leaves the server
- ✅ Tests: backend Jest AI suite (11 tests), frontend Vitest AI suite (7 tests)
- 📄 Details: [docs/ai-layer.md](docs/ai-layer.md)

---

## What's Implemented (Phase 3 — GitHub OAuth & Data Ingestion)

- ✅ GitHub OAuth (read-only scopes) with CSRF-protected state and server-side code exchange
- ✅ GitHub access tokens stored **AES-256-GCM encrypted**, never returned to the frontend
- ✅ Full ingestion pipeline: profile, repositories, languages (raw bytes), commits (incremental), issues, pull requests, releases, contributors, branches, topics, README metadata + content hash
- ✅ Everything upserted on stable GitHub IDs — re-syncs never duplicate records
- ✅ Sync jobs with persisted progress + live Socket.IO updates (cookie-authenticated private rooms) and polling fallback
- ✅ Central GitHub API client: pagination (Link headers), rate-limit detection (no retry storms), exponential backoff on transient 5xx
- ✅ Disconnect with explicit choice: remove credential only, or purge all GitHub-derived data
- ✅ IDOR-safe endpoints — every query scoped to the authenticated user
- ✅ Pages: `/github` overview, `/github/repositories` (search/filter/sort/paginate), `/github/repositories/:id`
- ✅ Tests: 17 backend (mocked GitHub API) + 13 frontend

**Previously — Phase 2 (Authentication):** register/login, JWT access+refresh in HTTP-only cookies with rotation and reuse detection, sessions, profiles, password change/reset, protected routes.
**Previously — Phase 1 (Foundation):** monorepo, Express gateway, MongoDB layer, FastAPI intelligence service, Socket.IO wiring, Docker, CI.

**Coming next:** Python intelligence engine consuming the stored GitHub data (Phase 4).

---

## What's Implemented (Phase 2 — Authentication & User Management)

- ✅ Registration and login with Zod validation and case-insensitive email/username handling
- ✅ JWT access (15m) + refresh (7d) tokens in **HTTP-only cookies** — never in localStorage
- ✅ Refresh-token rotation with reuse detection (replay revokes every session)
- ✅ Sessions model, logout, logout-all, and a session list in Settings
- ✅ Profile API (GET/PATCH/DELETE `/api/users/me`) with a strict editable-fields whitelist
- ✅ Password change (revokes all sessions) and account deletion (confirmation + transactional cascade)
- ✅ Forgot/reset password (single-use hashed token, 30-minute TTL, no account enumeration)
- ✅ Protected API routes (`requireAuth`) and protected React routes with session persistence
- ✅ Login/register/forgot/reset/dashboard/profile/settings pages with React Hook Form + Zod
- ✅ Auth store (Zustand), axios 401→refresh→retry interceptor, toast notifications
- ✅ Audit log for security events; rate limiting on all auth endpoints
- ✅ Tests: 36 backend auth tests + 13 frontend tests, all passing

**Previously — Phase 1 (Foundation):** monorepo, Express gateway with standard envelope, MongoDB layer, FastAPI intelligence service with 6 analyzers, Socket.IO wiring, React landing/status pages, Dockerfiles + compose, CI.

**Coming next:** GitHub OAuth + sync (Phase 3), repository intelligence (Phase 4), live analysis pipeline (Phase 5), DNA visualization & history (Phase 6).

---

## Quick Start

### Prerequisites

- Node.js ≥ 20 and npm ≥ 10
- Python ≥ 3.12
- Docker (for MongoDB) — or a local MongoDB ≥ 6

### 1. Install

```bash
npm install                # installs frontend + backend workspaces
python -m venv .venv
.venv/Scripts/pip install -r intelligence/requirements.txt   # Windows
# .venv/bin/pip install -r intelligence/requirements.txt     # macOS/Linux
```

### 2. Configure

```bash
cp .env.example .env       # then edit values — never commit .env
cp .env intelligence/.env  # the Python service reads its own file
```

Generate real secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`PYTHON_INTERNAL_KEY` must match between `.env` (Node) and `intelligence/.env` (Python).

### 3. Run

```bash
docker compose up -d mongodb                     # 1. MongoDB
.venv/Scripts/python -m uvicorn app.main:app --port 8000 --app-dir intelligence   # 2. Python
npm run dev --workspace backend                  # 3. Node API → http://localhost:5000
npm run dev --workspace frontend                 # 4. React    → http://localhost:5173
```

Verify the full chain: open **http://localhost:5173/status** — all three services should show **up**.

### Docker (full stack)

```bash
docker compose up --build
```

---

## Testing

```bash
npm run test                 # backend (Jest) + frontend (Vitest)
npm run test:python          # intelligence (Pytest)
npm run typecheck            # strict TS in both workspaces
npm run lint                 # ESLint in both workspaces
.venv/Scripts/python -m ruff check intelligence/app intelligence/tests
.venv/Scripts/python -m mypy intelligence/app
```

Current status: **42 tests passing** (backend 4, frontend 8, Python 30) plus ruff + mypy clean.

### Test what matters

Python tests cover the scoring engine's core promises: determinism (same input → same output), evidence on every score, bounds (0–100), single-repo technology caps, critical-gap prioritization, and API contract behavior including internal-key enforcement.

---

## API Overview

Every response uses a standard envelope:

```json
{ "success": true, "data": {}, "message": "Request successful" }
```

```json
{ "success": false, "error": { "code": "INVALID_REQUEST", "message": "..." } }
```

### Node.js gateway

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness + DB state |
| GET | `/api/status` | Aggregated status of API, MongoDB, Python service |

### Python intelligence (internal — requires `x-internal-key`)

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness + analyzer registry |
| POST | `/analyze/repository` | Repository health & complexity report |
| POST | `/analyze/skills` | Evidence-backed skill profile |
| POST | `/analyze/behavior` | Commit behavior + consistency score |
| POST | `/analyze/dna` | Developer DNA aggregation |
| POST | `/analyze/gaps` | Skill gaps vs. target role |
| POST | `/analyze/recommendations` | Gap-closing project recommendations |

Interactive docs: `http://localhost:8000/docs`

---

## Design Principles

1. **No fake data.** Scores come from repository signals; the UI labels sample visualizations explicitly.
2. **Evidence always.** Every score carries the reasons behind it.
3. **Deterministic analysis.** Identical input produces identical output — safe to cache, safe to test.
4. **Secrets stay server-side.** GitHub tokens and the internal analysis key never reach the browser.
5. **Fail loudly in dev, gracefully in prod.** Invalid config aborts startup with the reason.

---

## Project Structure

```text
devdna/
├── frontend/          React + Vite + Tailwind (workspace)
├── backend/           Express + Mongoose + Socket.IO (workspace)
├── intelligence/      FastAPI analysis engine
│   ├── app/api/           routers + Pydantic schemas
│   ├── app/services/      analyzers: skills, complexity, behavior, gaps, recommendations
│   ├── app/scoring/       normalization + technology classification
│   └── tests/             pytest suite
├── shared/            cross-service TypeScript contracts
├── docs/              deep-dive docs (grows each phase)
└── .github/workflows/ CI pipeline
```

---

## Security

- Helmet security headers, strict CORS, rate limiting (global + stricter auth limits)
- Zod validation on every boundary (HTTP payloads *and* environment config)
- JWT access/refresh separation — **active since Phase 2**, HTTP-only cookies with rotation
- GitHub tokens **AES-256-GCM encrypted at rest** (Phase 3); OAuth state CSRF protection; read-only scopes
- Audit log for authentication events; no secrets in logs or API responses
- Internal service key between Node and Python; analysis endpoints reject browsers
- Centralized error handler that never leaks stack traces in production
- `.env` files gitignored; `.env.example` documents every variable

---

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation, monorepo, CI, all services talking | ✅ Done |
| 2 | Register/login, JWT + refresh, protected routes, profiles, sessions | ✅ Done |
| 3 | GitHub OAuth, repository sync, rate-limit handling | ✅ Done |
| 4 | Repository intelligence storage + metrics | ✅ Done |
| 5 | Live analysis pipeline via Python engine | ✅ Done |
| 6 | Developer DNA visualization + history | ✅ Done |
| 7 | Skill gaps + personalized roadmap UI | ✅ Done |
| 8 | AI analyst + interview module | ✅ Done |
| 9 | Socket.IO progress + notifications | ⬜ |
| 10+ | Portfolio mode, PDF export, benchmarking, demo mode | ⬜ |

---

## License

MIT — see [LICENSE](LICENSE).
