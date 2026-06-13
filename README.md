# ⚡ ColdFlu

A lightweight HTTP request chaining tool. Build flows of curl steps connected as a DAG, reuse outputs between steps, and inspect every run in one dark workspace.

## Features

- **Chains** — group steps into a named flow, assign an environment, run on demand
- **Step types** — `curl` (HTTP request) or `transform` (JavaScript that produces a value)
- **Variable interpolation** — reference env vars and prior step outputs with `{{…}}` syntax
- **DAG execution** — steps with no pending dependencies run in parallel (wave-based)
- **Environments** — named variable sets (base URLs, tokens) swappable per chain
- **Global functions** — JS helpers available in all transform steps within an environment
- **Response caching** — skip repeat HTTP calls; TTL-based, keyed by resolved request
- **Load tests** — run a chain N times with configurable concurrency
- **Run history** — every run stored with full request/response per step
- **Import / export** — share chains as JSON

## Quick start

### Docker (recommended)

```bash
docker compose up --build
```

App runs at http://localhost:3000. Data persists in a named Docker volume.

### Local dev

```bash
npm install
npm run dev
```

Requires Node 18+. SQLite databases are created automatically in `./data/` on first run.

## Variable interpolation

Use `{{expression}}` anywhere in a curl step's URL, headers, or body, and inside transform step code.

| Expression | Resolves to |
|---|---|
| `{{env.BASE_URL}}` | Environment variable `BASE_URL` |
| `{{steps.Login.body}}` | Raw response body of the `Login` step |
| `{{steps.Login.body.token}}` | Parsed JSON field `token` |
| `{{steps.Search.body.results[0].id}}` | Array index access |
| `{{steps.Login.status}}` | HTTP status code (string) |
| `{{steps.Login.headers.content-type}}` | Response header (lowercased) |
| `{{$uuid}}` | Random UUID v4 |
| `{{$timestamp}}` | Unix timestamp (ms) |
| `{{$isoDate}}` | ISO 8601 date string |
| `{{$random}}` | Random float 0–1 |
| `{{= Date.now() }}` | Any inline JS expression |

Unresolved expressions resolve to empty string — never throw.

## Transform steps

Write a JS function body. Return value becomes the step's output.

```js
const items = context.steps.GetList.bodyParsed.items;
return {
  count: items.length,
  firstId: items[0]?.id,
  names: items.map(i => i.name),
};
```

`context` object:

| Property | Type | Description |
|---|---|---|
| `context.env` | `Record<string, string>` | Active environment variables |
| `context.steps.Name.body` | `string` | Raw response body |
| `context.steps.Name.bodyParsed` | `unknown` | JSON-parsed body, or `null` |
| `context.steps.Name.status` | `number` | HTTP status code |
| `context.steps.Name.headers` | `Record<string, string>` | Response headers |

## DAG execution

Draw an arrow from step A to step B → B depends on A. Steps with no pending dependencies run in the same wave (parallel via `Promise.all`).

```
Wave 0:  [Login]
Wave 1:  [GetUser]  [GetOrg]   ← parallel
Wave 2:  [Summary]             ← waits for both
```

If a dependency fails, all downstream steps are marked `failed` without running.

## Data

SQLite databases stored in `./data/`:

| File | Contents |
|---|---|
| `app.db` | Chains, steps, environments, settings |
| `history.db` | Run history, per-step results, load tests |

Back up this directory to preserve all data.

## Tech stack

- [Next.js](https://nextjs.org) 16 · React 19
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (embedded SQLite)
- [@xyflow/react](https://reactflow.dev) (DAG canvas)
- Tailwind CSS 4
