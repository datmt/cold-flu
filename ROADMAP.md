# Roadmap — Multi-Session Plan

Storage stays SQLite (robust search is a core differentiator). One session = one row below.

## How to run a session
1. Read `STATE.md` + this file. Pick the first `todo` session.
2. Requires L2 enabled (see `AGENTS.md`). Work in a git worktree: `git worktree add ../cold-flu-sN -b sN-<slug>`.
3. Implement → add one small runnable check (no framework yet) → `npm run lint` + `npm run build`.
4. Dispatch verifier sub-agent. Max 3 fix attempts, then escalate.
5. Update status here + Done Log, update `STATE.md`. Ask human before merge/push.

## Sessions

| # | Phase | Session | Status |
|---|-------|---------|--------|
| S1 | 1 Bugs | Curl flags honored | done — merged |
| S2 | 1 Bugs | History retention | done — merged |
| S3 | 2 Import/Export | Export v2 (condition steps + branch handles) | done — merged |
| S4 | 2 Import/Export | Postman collection + HAR import | todo |
| S5 | 2 Import/Export | OpenAPI import + copy-as-code | todo |
| S6 | 3 Perf | Per-step duration + response size | done — merged |
| S7 | 3 Perf | Load test stats + off UI path | done — merged |
| S8 | 4 Parity | Env write-back + cookie jar + `-F @file` | done — merged |
| S9 | 4 Parity | Auth helpers (OAuth2, SigV4, refresh) | todo |
| S10 | 4 Parity | Scheduled runs + failure alerts | todo |
| S11 | 4 Parity | Mock server | todo |
| S12 | 4 Parity | GraphQL | todo |

### S1 — Curl flags honored
- Where: `src/lib/executor/curl-parser.ts` (`ONE_VALUE_IGNORE_FLAGS`, `NO_VALUE_FLAGS` ~L89-123), `fetchRequest` in `src/lib/executor/index.ts` (30s hardcoded).
- Parser returns `options`: `insecure`, `proxy`, `maxTime`, `connectTimeout`, `followRedirects`, `cert/key/cacert`.
- Executor: `-m` → AbortController timeout; `-L` absent → `redirect: 'manual'` (matches curl; behavior change, note in docs); `-k`/certs/proxy → undici `Agent`/`ProxyAgent` dispatcher (likely needs `undici` dep).
- Flags still unsupported → surface warning in step editor, not silent.
- Done when: check script asserts parser output for each flag; manual run against https self-signed + redirect URL.

### S2 — History retention
- Where: `src/lib/db/schema-history.sql`, `src/lib/db/index.ts`, settings table.
- Settings: max runs per chain, max age days, max stored body bytes (truncate + flag `body_truncated`).
- Prune after each run finish (cheap DELETE); load-test runs pruned as group. Manual "Compact" (VACUUM) in settings.
- Keep search working on retained data.
- Done when: check script inserts N+10 runs → N remain; oversized body truncated.

### S3 — Export v2
- Where: `src/lib/types.ts` `ChainExport*`, `src/app/api/chains/[id]/export/route.ts`, `src/app/api/chains/import/route.ts`, `importChain` in db.
- Add `condition` to type enum; `depends_on: {ref, handle}[]`; `version: 2`. Import accepts v1 + v2.
- Done when: export → import round-trip of chain with condition branches is identical.

### S4 — Postman + HAR import
- Postman v2.1 collection: folders → folders, requests → simple-mode chains, `{{var}}` → `{{env.var}}`, collection vars → new environment.
- HAR: each entry → curl step; option to group as one chain.
- Done when: sample Postman + HAR fixtures import cleanly.

### S5 — OpenAPI import + copy-as-code
- OpenAPI 3.x (JSON/YAML): one simple chain per operation, grouped by tag folder, servers → `env.BASE_URL`, example body from schema.
- Copy-as-code from resolved request: curl, fetch, Python requests, Go.

### S6 — Per-step duration + size
- Add `duration_ms`, `response_size` to `run_steps` (migration). Record in executor. Show in `RunResults.tsx`.

### S7 — Load test stats
- Compute p50/p95/p99, RPS, error breakdown by status from S6 data. Show in load test view.
- Move load test execution off Next request handler path (worker thread) so UI stays responsive.
- Depends on S6.

### S8 — Env write-back, cookie jar, uploads
- Transform step API to set env var (persisted). Per-run cookie jar across steps. Verify/fix `-F name=@file`.

### S9 — Auth helpers
- OAuth2 (client credentials, auth code + PKCE), AWS SigV4, token auto-refresh on 401. Builds on S8 write-back.

### S10 — Scheduled runs + alerts
- Cron per chain, run in-process. Alert on failure via webhook.

### S11 — Mock server
- Serve saved responses from history per route.

### S12 — GraphQL
- Step body editor mode: query + variables → POST JSON. Introspection optional.

## Planned (unscheduled)
- Assertions per step + expected status (negative tests).
- CLI / CI runner, exit code + JUnit (nice to have).
- Data-driven runs (CSV/JSON).
- Security hardening: auth or localhost bind, secret vars, history masking. Quick win anytime: `127.0.0.1:3000:3000` in `docker-compose.yml`.
- Run-to-run diff / snapshots.
- Test framework + CI for this repo.
- WebSocket / SSE / gRPC.

## Done Log
| Date | Session | Branch / commit | Notes |
|------|---------|-----------------|-------|
| 2026-10-27 | S0 | — | Gap analysis + this plan. No code changed. |
| 2026-10-27 | S1 | `s1-curl-flags` 8cfe3b8 | -L/-k/-m/--connect-timeout/-x/--cacert/--cert/--key honored via undici; warnings in editor; flags kept on UI edit; options in cache key. No -L now = no redirect follow (docs §11). Also declared @codemirror/language+view (imported, undeclared). |
| 2026-10-27 | S2 | `s2-history-retention` a357200 | /settings: max runs/chain (500), max load tests/chain (10), max age (off), max body (1 MB); prune on run finish + load-test finalize; body_truncated flag; Compact = prune all + VACUUM. No history search existed to preserve. |
| 2026-10-27 | S3 | `s3-export-v2` 3021c3d | Export v2: `depends_on: {ref, handle}[]`, condition type; import accepts v1+v2. Duplicate now keeps branch handles (was dropping them). |
| 2026-10-27 | merge | master 7d2c1c5 | S1+S2+S3 merged locally (no conflicts), not pushed. Checks/build green on master. |
| 2026-10-27 | S6 | `s6-step-duration-size` | `run_steps.duration_ms` (step exec time; excludes history + cache writes; set on thrown errors too) + `response_size` (UTF-8 bytes of full body, pre-truncation). RunResults shows both; old rows fall back to timestamps. S4/S5 skipped on human request ("phase 6"). |
| 2026-10-27 | merge | master 9987cc0 | S6 merged locally (no conflicts), not pushed. Checks green; build blocked by pre-existing xyflow 12.11.0 typecheck error. |
| 2026-10-27 | S8 | `s8-env-cookies-upload` | `context.setEnv(name, value)` in transform steps persists to the chain's environment. Per-run cookie jar (host + path match; explicit Cookie header wins). `-F name=@file;type=;filename=` and `name=<file` send real multipart. Fetch always via undici. |
