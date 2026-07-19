# Simple Mode + Collection Tree — Spec

## Goal

Add bruno/postman-style single-request workflow alongside existing chain (DAG) builder. User picks mode per-request-item: **Simple** (one-shot request, flat form) or **Chain** (current canvas). Reuse chain execution engine — no parallel logic path.

## Non-goals

- No new execution engine. A "simple request" IS a chain with one curl step, zero deps.
- No multi-protocol (GraphQL/gRPC/WS), no OAuth flow UI, no test-assertions tab, no workspaces/cloud sync/mocking/doc-gen.

---

## 1. Data model changes

### 1.1 `chains` table — add `mode` column

```sql
ALTER TABLE chains ADD COLUMN mode TEXT NOT NULL DEFAULT 'chain';
-- 'simple' | 'chain'
```

- `'simple'` → opened in flat request editor.
- `'chain'` → opened in existing `FlowEditor` canvas.
- Set at creation time based on which "New" button user clicked. Never inferred from step count (explicit, not implicit — user can have a 1-step chain intentionally left in chain mode).

### 1.2 New `folders` table

```sql
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### 1.3 `chains` table — add `folder_id`

```sql
ALTER TABLE chains ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL;
```

- `NULL` folder_id = root-level item in tree.
- No `chain_id` on folders — folders only nest folders + hold chains as children. Pure tree, chains are always leaves.

### 1.4 Types (`src/lib/types.ts`)

```ts
export type ChainMode = 'simple' | 'chain';

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  order_index: number;
  created_at: number;
  updated_at: number;
}

// Chain, ChainSummary, ChainDetail gain:
//   mode: ChainMode;
//   folder_id: string | null;

export interface TreeNode {
  type: 'folder' | 'chain';
  id: string;
  name: string;
  children?: TreeNode[];      // folders only
  mode?: ChainMode;           // chains only
  method?: string;            // chains only, derived from first curl step (simple mode display)
  step_count?: number;        // chains only
  updated_at: number;
}
```

---

## 2. API changes

### 2.1 Folders CRUD — new routes

| Route | Method | Body | Notes |
|---|---|---|---|
| `/api/folders` | GET | — | flat list, all folders |
| `/api/folders` | POST | `{ name, parent_id }` | create |
| `/api/folders/[id]` | PUT | `{ name?, parent_id?, order_index? }` | rename / move / reorder |
| `/api/folders/[id]` | DELETE | — | cascades to child folders (FK); chains inside get `folder_id = NULL` (reassign, don't delete requests) — do this in a transaction before the folder delete, since the FK is `ON DELETE CASCADE` for folders-in-folders but chains reference folders with `SET NULL` already per 1.3 |

### 2.2 Existing chain routes — extend

- `POST /api/chains` — body gains optional `mode` (default `'chain'`), optional `folder_id`.
- `PUT /api/chains/[id]` — body gains optional `mode`, `folder_id` (for moving in tree / converting mode).
- `GET /api/chains` — response items gain `mode`, `folder_id`.

### 2.3 New tree endpoint

`GET /api/tree` → returns `TreeNode[]` (root-level), nested. Built server-side by joining `folders` + `chains` (with first-step method resolved via existing `extractMethodFromCurl` on cheapest curl step). Used to populate sidebar; avoids client-side tree assembly from two flat lists on every load.

No dedicated "run simple request" endpoint — simple mode reuses:
- `POST /api/steps/[id]/run` (already exists) to execute the lone step.
- `POST /api/chains/[id]/run` also works identically for a 1-step chain (kept as fallback / for "convert to chain" continuity).

---

## 3. UI changes

### 3.1 Layout restructure

Current: `/chains` is a flat table page, `/chains/[id]` is the canvas page.

New: two-pane layout at app root (or under `/chains`):
- **Left**: `Sidebar` — collection tree + search box. Persistent across navigation (like bruno/postman left rail).
- **Right**: either `SimpleRequestView` or `FlowEditor` canvas depending on selected chain's `mode`.

`/chains` list-table page: keep as-is for now (or redirect to first tree item) — not in scope to remove, just no longer the primary nav surface. Decide during implementation whether to fully replace or keep as a fallback "all chains" view.

### 3.2 `Sidebar` component (new)

`src/components/Sidebar.tsx`

- Fetches `/api/tree` on mount.
- Renders nested `<FolderRow>` / `<ChainRow>`, indent per depth, collapse/expand state in local component state (not persisted).
- Search input at top: client-side filter, matches chain name substring (case-insensitive); when searching, auto-expand all folders containing a match, dim/hide non-matches. Mirrors bruno behavior — no server round-trip for search.
- `ChainRow`: method-colored badge (GET=green, POST=amber, PUT=blue, DELETE=red, PATCH=purple — reuse existing color mapping if present in `CurlNode.tsx`/`StepCard.tsx`, else define once in `src/lib/formatters.ts`) + name. Chain-mode items get a small DAG icon instead of method badge (multi-step, method ambiguous).
- Right-click or "..." menu per row: Rename, Delete, Duplicate, Move (drag-and-drop reorder within/between folders — drag handled via simple HTML5 DnD or existing `@xyflow/react` isn't relevant here, use native `draggable`).
- New buttons at top: "+ Folder", "+ Request" (creates `mode: 'simple'` chain with 1 default GET curl step), "+ Chain" (creates `mode: 'chain'` empty chain, opens canvas).

### 3.3 `RequestEditor` component (extracted, new)

`src/components/RequestEditor.tsx` — extract `CurlEditor` + its method/url/headers/body sub-UI out of `StepEditPanel.tsx` (currently private to that file, lines ~90-200+) into a standalone, reusable component:

```ts
interface RequestEditorProps {
  curlTemplate: string;
  onChange: (curlTemplate: string) => void;
  envVariables: string[];       // for VariableHelper autocomplete
}
```

- `StepEditPanel.tsx` (chain-mode node inspector) imports and uses this instead of its inline version — no behavior change there, pure extraction.
- `SimpleRequestView` (3.4) also uses it directly.

### 3.4 `SimpleRequestView` component (new)

`src/components/SimpleRequestView.tsx` — the flat single-request workspace, shown when active chain has `mode === 'simple'`.

Layout (top to bottom):
1. Request name (editable inline, click-to-rename like bruno tabs) + environment selector (reuse existing env dropdown from chain page) + "Convert to Chain" button (sets `mode: 'chain'` via PUT, then navigates same chain id into canvas view).
2. `RequestEditor` (method/url/headers/body tabs).
3. "Send" button — calls `POST /api/steps/[stepId]/run`, polls same way `ChainPage.startRunPolling` does today (reuse that polling logic, extract to a small hook `useRunPolling` if duplicated 3+ places — only extract if actually shared, don't pre-abstract).
4. Response panel below: reuse `RunResults` directly, unmodified. Checked: it groups by `wave_index` and shows a "Wave N · X steps" header — for a 1-step run this renders "Wave 0 · 1 step", cosmetic only, no functional mismatch. No trimmed variant built.
5. Recent sends for this request: reuse existing run-history list pattern from `ChainPage` (`RunHistorySection`), scoped to this chain's runs.

### 3.5 Mode-aware routing

`/chains/[id]` page (existing): on load, branch on `chain.mode`:
- `'simple'` → render `SimpleRequestView`
- `'chain'` → render existing `FlowEditor` + settings form (current behavior, unchanged)

Both share the same URL scheme — no new route needed, just a conditional at the top of the existing page component.

---

## 4. Migration

- `schema.sql` changes are additive (`ALTER TABLE ... ADD COLUMN`, `CREATE TABLE IF NOT EXISTS`) — safe for existing `app.db` per current migration approach (check `src/lib/db/index.ts` for how schema is applied on boot — likely just runs `schema.sql` idempotently; confirm `ALTER TABLE ADD COLUMN` is guarded against re-run errors, e.g. wrapped in a "column exists" check, since SQLite errors on duplicate `ADD COLUMN`).
- Existing chains: default `mode = 'chain'`, `folder_id = NULL` — all current data lands at tree root in chain mode, zero behavior change for existing users until they opt into simple mode / folders.
- Export/import (`ChainExport` type, `/api/chains/import`): decide whether `mode`/`folder_id` are included in export JSON. Recommend: include `mode`, omit `folder_id` (folder structure is local organization, not portable data) — imported chains land at tree root, user re-files them.

---

## 5. Build order (suggested)

1. Schema + types: `mode` column, `folders` table, `folder_id` column.
2. Folders CRUD API + tree endpoint.
3. `Sidebar` component wired to tree endpoint (no drag-drop yet, no search yet) — validates layout restructure first.
4. Extract `RequestEditor` from `StepEditPanel` — pure refactor, verify chain-mode node editing still works identically.
5. `SimpleRequestView` using `RequestEditor` + Send + response panel.
6. Mode-aware branch in `/chains/[id]` page.
7. "+ Request" / "+ Chain" / "+ Folder" creation flows in sidebar.
8. Search filter in sidebar.
9. Drag-and-drop move/reorder.
10. "Convert to Chain" button.

---

## 6. Decisions (resolved)

- `/chains` flat table page: kept as secondary view, not removed/redirected.
- Method badge colors: reuse existing mapping (from `CurlNode.tsx`/`StepCard.tsx`, centralize into `src/lib/formatters.ts` if duplicated).
- `RunResults` reuse: confirmed works as-is for single-step (see §3.4 point 4) — no trimmed variant.
- Folder delete: confirm-dialog warns "N requests will move to root" when non-empty.
