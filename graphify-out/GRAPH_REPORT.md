# Graph Report - cold-flu  (2026-10-26)

## Corpus Check
- Corpus is ~34,004 words - fits in a single context window. You may not need a graph.

## Summary
- 497 nodes · 1036 edges · 28 communities (22 shown, 6 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Chain Page UI
- Next Config & Load Test API
- Load Test Engine
- Steps API & Flow
- ESLint & Dev Tooling
- CodeMirror Editors
- SQLite DB Layer
- Opencode Agents
- TypeScript Config
- Graph & Dependency API
- Step Item API
- Runtime Dependencies
- Import & Chains API
- Loop Governance
- Folders API
- Product Overview & Execution
- Sidebar & Layout
- Docs Page
- Chain Item API
- Duplicate & Export API
- Environments API
- Foundry Harness
- PostCSS Config
- Brand Logos
- File Icon
- Globe Icon
- Window Icon

## God Nodes (most connected - your core abstractions)
1. `jsonError()` - 26 edges
2. `next` - 24 edges
3. `getChain()` - 20 edges
4. `react` - 16 edges
5. `apiFetch()` - 16 edges
6. `compilerOptions` - 16 edges
7. `executeStepsWithDependencies()` - 14 edges
8. `zod` - 13 edges
9. `RunResults()` - 12 edges
10. `parseCurl()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `GET()` --calls--> `getChain()`  [EXTRACTED]
  src/app/api/chains/[id]/route.ts → src/lib/db/index.ts
- `Loop constraints (binding rules)` --semantically_similar_to--> `Safety rules (denylist paths, worktree, max 3 attempts)`  [INFERRED] [semantically similar]
  loop-constraints.md → AGENTS.md
- `Worktree per fix attempt` --semantically_similar_to--> `Safety rules (denylist paths, worktree, max 3 attempts)`  [INFERRED] [semantically similar]
  LOOP.md → AGENTS.md
- `Daily Triage loop (L1 report-only)` --references--> `loop-triage skill`  [EXTRACTED]
  LOOP.md → skills/loop-triage/SKILL.md
- `loop-triage skill` --shares_data_with--> `STATE.md loop state file`  [EXTRACTED]
  skills/loop-triage/SKILL.md → STATE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Loop guardrail skills and their config files** — skills_loop_triage_skill_triage, skills_loop_budget_skill_budget, skills_loop_constraints_skill_constraints, state_loop_state [INFERRED 0.85]
- **Simple mode data model and API** — spec_simple_mode_simple_mode, spec_simple_mode_folders_table, spec_simple_mode_chain_mode_column, spec_simple_mode_tree_api [EXTRACTED 1.00]

## Communities (28 total, 6 thin omitted)

### Community 0 - "Chain Page UI"
Cohesion: 0.08
Nodes (49): react, ChainPage(), ChainPageProps, FlowEditor, formatRunDate(), LoadTestModal(), LoadTestProgress(), OlderRunsModal() (+41 more)

### Community 1 - "Next Config & Load Test API"
Cohesion: 0.08
Nodes (34): nextConfig, next, POST(), GET(), POST(), GET(), DELETE(), environmentUpdateSchema (+26 more)

### Community 2 - "Load Test Engine"
Cohesion: 0.09
Nodes (40): RFC-4122, uuid, cancelLoadTest(), createLoadTest(), finalizeLoadTest(), getGlobalFunctions(), incrementLoadTestProgress(), buildCacheKey() (+32 more)

### Community 3 - "Steps API & Flow"
Cohesion: 0.09
Nodes (33): @xyflow/react, cacheEnabledSchema, createStepSchema, normalizeCacheEnabled(), POST(), FlowEditor(), FlowEditorProps, FlowNode (+25 more)

### Community 4 - "ESLint & Dev Tooling"
Cohesion: 0.06
Nodes (35): eslintConfig, devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/better-sqlite3, @types/node (+27 more)

### Community 5 - "CodeMirror Editors"
Cohesion: 0.10
Nodes (27): @codemirror/lang-javascript, @codemirror/lang-json, @codemirror/theme-one-dark, @uiw/react-codemirror, EnvironmentEditorPage(), rowsFromEnvironment(), VariableRow, buildCurlFromParts() (+19 more)

### Community 6 - "SQLite DB Layer"
Cohesion: 0.09
Nodes (23): ChainRow, ChainRunRow, ChainWithCountRow, CONFIG_DB_PATH, CONFIG_SCHEMA_PATH, configAlterStatements, DATA_DIR, ensureDataDir() (+15 more)

### Community 7 - "Opencode Agents"
Cohesion: 0.10
Nodes (22): agent, implementer, loop-triage, verifier, description, mode, name, permission (+14 more)

### Community 8 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 9 - "Graph & Dependency API"
Cohesion: 0.19
Nodes (15): graphSchema, PUT(), DELETE(), dependencySchema, GET(), POST(), addStepDependency(), assertAcyclic() (+7 more)

### Community 10 - "Step Item API"
Cohesion: 0.21
Nodes (15): cacheEnabledSchema, DELETE(), GET(), normalizeCacheEnabled(), PUT(), updateStepSchema, createStep(), deleteStep() (+7 more)

### Community 11 - "Runtime Dependencies"
Cohesion: 0.13
Nodes (15): dependencies, better-sqlite3, @codemirror/lang-javascript, @codemirror/lang-json, @codemirror/theme-one-dark, next, prismjs, react (+7 more)

### Community 12 - "Import & Chains API"
Cohesion: 0.18
Nodes (12): zod, importSchema, POST(), stepSchema, createChainSchema, GET(), POST(), GET() (+4 more)

### Community 13 - "Loop Governance"
Cohesion: 0.19
Nodes (10): CLAUDE.md (imports AGENTS.md), Loop daily budget limits (100k tokens, 2 runs), loop-pause-all kill switch, Loop constraints (binding rules), Daily Triage loop (L1 report-only), Loop run log entry format, loop-budget skill, loop-constraints skill (+2 more)

### Community 14 - "Folders API"
Cohesion: 0.21
Nodes (12): DELETE(), PUT(), updateFolderSchema, createFolderSchema, GET(), POST(), createFolder(), deleteFolder() (+4 more)

### Community 15 - "Product Overview & Execution"
Cohesion: 0.18
Nodes (13): docker-compose app service (port 3000, app_data volume), pnpm allowBuilds (native builds disabled), Chains and steps (curl/transform), ColdFlu (HTTP request chaining tool), DAG wave-based execution, Environments and global functions, Run history, load tests, response caching, SQLite storage (app.db, history.db) (+5 more)

### Community 16 - "Sidebar & Layout"
Cohesion: 0.31
Nodes (9): ChainsLayout(), clamp(), DragPayload, nodeMatchesSearch(), RowMenu(), Sidebar(), TreeRow(), TreeRowProps (+1 more)

### Community 17 - "Docs Page"
Cohesion: 0.33
Nodes (9): Block(), Code(), DocsPage(), metadata, Note(), Section(), Sub(), Table() (+1 more)

### Community 18 - "Chain Item API"
Cohesion: 0.32
Nodes (7): DELETE(), GET(), PUT(), updateChainSchema, deleteChain(), normalizeChainMode(), updateChain()

### Community 19 - "Duplicate & Export API"
Cohesion: 0.47
Nodes (4): POST(), GET(), duplicateChain(), exportChain()

### Community 20 - "Environments API"
Cohesion: 0.47
Nodes (5): createEnvironmentSchema, GET(), POST(), createEnvironment(), listEnvironments()

### Community 21 - "Foundry Harness"
Cohesion: 0.67
Nodes (3): outerloop hook (disabled, emits on session.end), Harness stack (loop-engineering -> harness-foundry -> outerloop), Foundry stack.yaml (cold-flu minimal harness)

## Knowledge Gaps
- **26 isolated node(s):** `@types/prismjs`, `prismjs`, `react-simple-code-editor`, `@tailwindcss/postcss`, `@types/better-sqlite3` (+21 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 162 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `Next Config & Load Test API` to `Chain Page UI`, `ESLint & Dev Tooling`, `CodeMirror Editors`, `Sidebar & Layout`, `Docs Page`?**
  _High betweenness centrality (0.102) - this node is a cross-community bridge._
- **What connects `@types/prismjs`, `prismjs`, `react-simple-code-editor` to the rest of the system?**
  _26 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Chain Page UI` be split into smaller, more focused modules?**
  _Cohesion score 0.07704918032786885 - nodes in this community are weakly interconnected._
- **Why does `dependencies` connect `Runtime Dependencies` to `ESLint & Dev Tooling`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Should `Next Config & Load Test API` be split into smaller, more focused modules?**
  _Cohesion score 0.08295625942684766 - nodes in this community are weakly interconnected._
- **Why does `react` connect `Chain Page UI` to `Sidebar & Layout`, `Steps API & Flow`, `ESLint & Dev Tooling`, `CodeMirror Editors`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Should `Load Test Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.09292929292929293 - nodes in this community are weakly interconnected._