# DevDNA — GitHub Integration (Phase 3)

How DevDNA connects a GitHub account, synchronizes repository data, and prepares
it for the Python Intelligence Engine.

## OAuth flow (§3, §4)

```
User → DevDNA /github page
     → GET /api/github/connect   (returns authorizeUrl + sets one-time state cookie)
     → GitHub authorization screen (read-only scopes, §5)
     → GET /api/github/callback?code&state
          ├── state cookie ↔ URL state compared  (CSRF protection — mismatch → redirect /github?error=oauth_state_mismatch)
          ├── code exchanged for access token    (server-side only)
          ├── GET /user with the token           (identity)
          ├── token AES-256-GCM encrypted → GitHubAccount.accessTokenEncrypted
          └── redirect → /github?connected=1
```

The state is a 24-byte random nonce delivered twice: as an HttpOnly cookie
(path-scoped to `/api/github`, 10-minute maxAge) and in the URL. The callback
proceeds only on a constant-time match. A user ID is never trusted from the
callback URL.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GITHUB_CLIENT_ID` | for OAuth | OAuth app client id (dev + prod) |
| `GITHUB_CLIENT_SECRET` | for OAuth | OAuth app client secret — never committed, never logged |
| `GITHUB_CALLBACK_URL` | for OAuth | Full callback URL, e.g. `http://localhost:5000/api/github/callback` (`GITHUB_REDIRECT_URI` still accepted) |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | for storage | Key material for AES-256-GCM token encryption; falls back to `JWT_REFRESH_SECRET` when unset |

## Scopes (§5) — minimum necessary, all read-oriented

| Scope | Why |
|---|---|
| `read:user` | Identity + profile: login, name, avatar, followers. |
| `user:email` | Primary email for the profile view. |
| `repo:status` | Read commit statuses on accessible repositories. |
| `public_repo` | Read public repositories, commits, issues, PRs, releases. |

No write/delete scopes. Private-repo analysis is **not** enabled in Phase 3;
adding `repo` later is a deliberate, user-visible decision.

## Token security (§7)

- Stored **only** in `GitHubAccount.accessTokenEncrypted`, AES-256-GCM
  (`v1:<iv>:<tag>:<ciphertext>`), key derived via scrypt from
  `GITHUB_TOKEN_ENCRYPTION_KEY`.
- Stripped from every JSON serialization at the model layer.
- Never sent to React, sockets, or logs. Decrypts only inside the GitHub
  client when making API calls.

## Data models (§6, §12, §15, §21-§25, §39)

| Model | Key fields | Indexes |
|---|---|---|
| `GitHubAccount` | userId, githubId, login, profile fields, accessTokenEncrypted, syncStatus, lastSyncedAt | `userId` unique, `githubId` unique |
| `Repository` | userId, githubId, fullName, normalized fields, languages (raw bytes), topics, readmeExists/Size/Hash | `(userId, githubId)` unique, `(userId, primaryLanguage)` |
| `Commit` | repositoryId, sha, author, message, committedAt, branch | `(repositoryId, sha)` unique, `(repositoryId, committedAt)`, `(userId, committedAt)` |
| `Issue` | repositoryId, githubId, number, state, labels, closedAt | `(repositoryId, githubId)` unique |
| `PullRequest` | repositoryId, githubId, number, state, mergedAt | `(repositoryId, githubId)` unique |
| `Release` | repositoryId, githubId, tagName, publishedAt | `(repositoryId, githubId)` unique |
| `Contributor` | repositoryId, githubId, login, contributions | `(repositoryId, githubId)` unique |
| `Branch` | repositoryId, name, protected, isDefault | `(repositoryId, name)` unique |
| `GitHubSyncJob` | userId, status, progress, currentStep, counters | `(userId, createdAt)`, `(userId, status)` |

All GitHub snake_case fields are normalized to camelCase at the service layer
(`stargazers_count` → `stars`, `html_url` → `htmlUrl`, §14). The DB schema is
independent of GitHub's exact naming.

## API endpoints (§33)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/github/connect` | Start OAuth (JSON: `{authorizeUrl,state}`; `?redirect=1` for 302) |
| GET | `/api/github/callback` | OAuth callback (state-validated) |
| GET | `/api/github/status` | Connection state + latest sync job |
| POST | `/api/github/sync` | Queue a sync job (202; job id returned) |
| GET | `/api/github/sync/:jobId` | Poll job status/progress |
| DELETE | `/api/github/disconnect` | Remove credential; `?deleteData=true` purges GitHub-derived data |
| GET | `/api/github/profile` | Connected GitHub profile + local stats |
| GET | `/api/github/repositories` | List with `search`, `language`, `sort`, `page`, `limit` |
| GET | `/api/github/repositories/:id` | Full detail incl. commits/issues/PRs/releases/branches/contributors |

Every endpoint requires DevDNA auth (cookies) and scopes all queries to the
authenticated user — cross-user access is impossible by construction (§40).

## Sync pipeline (§25, §26, §51)

```
POST /sync → job QUEUED → (fire-and-forget) RUNNING
  profile (5%) → repositories (15%) → per repository [sequential]:
     upsert repo → languages (10%) → metadata: README + branches (10%)
     → commits (25%) → issues (10%) → pull requests (10%)
     → releases + contributors (5%) → finalizing (10%)
  → COMPLETED (100%)  |  FAILED (error stored on the job)
```

- Sequential per-repository processing keeps API usage predictable — no
  N× parallel request storms.
- Bounded pages: repos ≤10 pages, commits ≤4 (200 recent per repo), issues/PRs
  ≤2, releases/contributors ≤1.
- Everything upserts on stable GitHub IDs/SHAs — re-syncs never duplicate (§27).

### Incremental commits (§17)

If a repository was synced within the last 90 days, only commits pushed after
`lastSyncedAt` are fetched (GitHub `since` parameter). First sync imports the
most recent ~200 commits per repository; full-history backfill is deferred to
Phase 4 to protect the rate budget.

## Real-time progress (§28, §29)

Socket.IO rooms (`user:<id>`) join automatically from the HTTP-only cookie on
the websocket handshake — the browser never touches a token. Events:
`github:sync:started`, `github:sync:progress` (`{jobId,progress,step}`),
`github:sync:completed`, `github:sync:failed`. The UI also polls
`/sync/:jobId` every 2.5s as a fallback. Jobs stuck by a server restart are
marked FAILED on boot (`recoverStaleSyncJobs`).

## Rate limits & retries (§30, §31)

- 403/429 or `x-ratelimit-remaining: 0` → `GITHUB_RATE_LIMITED` error carrying
  `rateLimitReset`; **never retried**; surfaced as
  "GitHub API rate limit reached. Please try synchronization again later."
- 401/404/422 → single attempt, no retry.
- Network errors and 5xx → up to 3 attempts with 500ms/1s/2s exponential
  backoff.
- Per-repository fetch failures are logged and skipped; the job continues.

## Security (§41)

OAuth state cookie (CSRF) · AES-256-GCM token at rest · requireAuth on every
data route · user-scoped queries (IDOR-safe; covered by tests) · auth rate
limiter on `/sync` · Helmet/CORS unchanged · no secrets in logs (validated by
grep in tests: no `gho_`, no `accessTokenEncrypted` in any response).

## Data quality (§44, §45, §46)

`fork`, `archived`, `private`, `disabled` are stored on every repository so
later phases can weight original vs forked or archived projects. Missing
descriptions, languages, and READMEs are handled explicitly
(`readmeExists: false`); renamed repos re-upsert under the same `githubId`;
deleted repos simply stop updating.

## Data retention (§32, §47)

Disconnect always removes the credential (the encrypted token is destroyed).
GitHub-derived data is kept by default so re-connecting is cheap, and purged
completely when the user chooses "Delete data too" — the UI asks explicitly.

## Testing (§48, §49)

Backend (`backend/tests/github.test.ts`): the GitHub API is mocked at the
`fetch` boundary — deterministic, no live calls. Covers OAuth state rejection,
full sync with normalization, duplicate-free re-syncs, incremental strategy,
rate-limit failure semantics, retry/backoff, pagination Link-following, IDOR
ownership guards, disconnect with/without data purge. Frontend
(`frontend/tests/github.test.tsx`): connection states, sync progress,
repository list/filter/empty/error states, detail rendering, disconnect flow.
