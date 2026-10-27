# Loop State — ColdFlu

Last run: 2026-10-27 (L2 for S8 — human: "start s8", "merge s8 to master"; earlier S6 — human: "continue with phase 6"; merge — human: "merge to main")

## High Priority (loop is acting or waiting on human)
- S1, S2, S3, S6 merged into local master (S6: 9987cc0). NOT pushed — needs human approval.
- Worktrees ../cold-flu-s1, -s2, -s3, -s6 and branches still exist; remove once happy.
- S4, S5 still todo (skipped by request). S7 (load test stats) now unblocked.

## Watch List
- Behavior change (S1): steps without `-L` no longer follow redirects; they return the 3xx.
- Behavior change (S2): defaults start pruning on first run per chain (keeps newest 500 runs, 10 load tests; bodies cut at 1 MB).
- Turbopack rejects symlinked node_modules in worktrees; use `cp -al` hardlink copy.
- Fresh-DB `next build` can hit SQLITE_BUSY (parallel workers); rerun passes. Pre-existing.
- Lint baseline: 20 problems (16 errors) on master, all pre-existing.
- Security (planned, unscheduled): server-side `new Function` + no auth + port 3000 on all interfaces. S1 adds server-side file reads for --cert/--key/--cacert paths (same trust level as above).
- Export format now v2 (S3). Old v1 files still import.

- 2026-10-27: S7 merged: load tests run in a worker thread (src/lib/executor/load-test-worker.mjs, loads TS via Node type stripping, needs Node >= 22.18). Dockerfile now copies src/lib; docker image NOT built/tested.

- 2026-10-27: S8 merged: setEnv write-back, per-run cookie jar (host+path only, no Domain/Secure), `-F @file` multipart. Cache key for -F steps uses file path, not contents. Verifier PASS (no blockers). Worktree ../cold-flu-s8 still exists.

## Recent Noise (ignored this run)
- Verifier nits left: `-m5` (attached value) only warns; `-m {{var}}` not interpolated; long run can prune itself if N newer runs started meanwhile; truncated body may end in U+FFFD.

---
Run log: 2026-10-27 — S1 + S2 implemented in worktrees, each verified by sub-agent (PASS; S1: proxy-scheme + cache-key bugs fixed; S2: draining-cancelled-load-test prune bug fixed).
Test evidence: `npm run check` ok in both (checks/curl-parser.check.mjs, checks/retention.check.mjs); `npm run build` green both; lint no new problems.
Live S1 (self-signed HTTPS): no flag → TLS error; -k / --cacert → 200; /redir no -L → 302, -L → 200; -m 1 on 3s endpoint → "Request timed out after 1s"; -m 5 → 200; -x dead proxy → ECONNREFUSED at proxy.
Live S2: limit 3, 6 runs → 3 kept; 500-byte body, limit 50 → 50 bytes + body_truncated; negative setting → 400; compact endpoint ok.
Run log: 2026-10-27 — S3 implemented in worktree, merged S1+S2+S3 to master (clean). Post-merge: export-v2 check needed resolver fix for S2's extensionless import.
Test evidence (master): `npm run check` → curl-parser ok, export-v2 ok, retention ok; `npm run build` green; lint 20 problems (= baseline).
Run log: 2026-10-27 — S6 implemented in worktree; verifier PASS (one minor: cache write counted in duration on miss — fixed).
Test evidence (s6): `npm run check` → curl-parser, export-v2, retention, step-metrics ok; `tsc --noEmit` only pre-existing FlowEditor.tsx:587; lint 20 problems (= baseline). `next build` blocked by that pre-existing xyflow error.
Run log: 2026-10-27 — S6 merged to master 9987cc0 (clean).
Test evidence (master): `npm run check` → 4 ok; `tsc` only pre-existing FlowEditor.tsx:587; lint 20 problems (= baseline).
Run log: 2026-10-27 — S8 implemented in worktree and merged to master.
Test evidence (s8): `npm run check` → 6 ok (incl. s8-parity); `tsc --noEmit` clean; lint 20 problems (= baseline).
