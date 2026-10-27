export type Dictionary = Record<string, string>;

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed';
export type RunStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'stale';
export type StepType = 'curl' | 'transform' | 'condition';
export type ChainMode = 'simple' | 'chain';

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  order_index: number;
  created_at: number;
  updated_at: number;
}

export interface TreeNode {
  type: 'folder' | 'chain';
  id: string;
  name: string;
  children?: TreeNode[];
  mode?: ChainMode;
  method?: string;
  step_count?: number;
  updated_at: number;
}

export interface Environment {
  id: string;
  name: string;
  variables: Dictionary;
  /** JS function declarations available in all steps for this environment. */
  functions: string;
  created_at: number;
  updated_at: number;
}

export interface ChainSummary {
  id: string;
  name: string;
  description: string;
  environment_id: string | null;
  mode: ChainMode;
  folder_id: string | null;
  created_at: number;
  updated_at: number;
  step_count: number;
}

export interface Step {
  id: string;
  chain_id: string;
  name: string;
  order_index: number;
  type: StepType;
  curl_template: string;
  transform_code: string;
  cache_enabled: number;
  cache_ttl: number;
  position_x: number;
  position_y: number;
  created_at: number;
  updated_at: number;
  depends_on?: string[];
  /** Maps each dependency step ID to the source handle used (null for regular deps). */
  dependency_handles?: Record<string, string | null>;
}

export interface StepDependency {
  step_id: string;
  depends_on_step_id: string;
  source_handle?: string | null;
}

export interface Chain {
  id: string;
  name: string;
  description: string;
  environment_id: string | null;
  mode: ChainMode;
  folder_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface ChainDetail extends Chain {
  steps: Step[];
  environment: Environment | null;
}

export interface ChainRun {
  id: string;
  chain_id: string;
  load_test_id: string | null;
  status: RunStatus;
  started_at: number;
  finished_at: number | null;
  error: string | null;
  total_steps: number;
  completed_steps: number;
  failed_steps: number;
}

export interface RunStep {
  id: string;
  run_id: string;
  step_id: string;
  step_name: string;
  order_index: number;
  wave_index: number;
  status: RunStepStatus;
  resolved_curl: string | null;
  request_method: string | null;
  request_url: string | null;
  request_headers: string | null;
  request_body: string | null;
  response_status: number | null;
  response_headers: string | null;
  response_body: string | null;
  from_cache: boolean;
  /** Request or response body was cut to the retention byte limit before storing. */
  body_truncated: boolean;
  /** Time spent executing the step itself (request, cache lookup, or script), excluding run-history writes. */
  duration_ms: number | null;
  /** UTF-8 byte length of the full (untruncated) decoded response body. */
  response_size: number | null;
  error: string | null;
  started_at: number | null;
  finished_at: number | null;
}

export interface ChainRunDetail extends ChainRun {
  steps: RunStep[];
}

export type LoadTestStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface LoadTest {
  id: string;
  chain_id: string;
  total: number;
  concurrency: number;
  status: LoadTestStatus;
  completed: number;
  failed: number;
  started_at: number;
  finished_at: number | null;
}

export interface ApiErrorResponse {
  error: string;
}

export interface ChainExportStep {
  /** Original step id — used only as a local reference key for `depends_on`. */
  ref: string;
  name: string;
  type: StepType;
  curl_template: string;
  transform_code: string;
  cache_enabled: number;
  cache_ttl: number;
  position_x: number;
  position_y: number;
  /** `handle` is the source handle on the dependency ('true'/'false' for condition branches, null otherwise). */
  depends_on: ChainExportDependency[];
}

export interface ChainExportDependency {
  ref: string;
  handle: string | null;
}

/** v2 adds condition steps and branch handles. Import also accepts v1 (`depends_on: string[]`). */
export interface ChainExport {
  version: 2;
  name: string;
  description: string;
  mode: ChainMode;
  steps: ChainExportStep[];
}
