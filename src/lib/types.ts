export type Dictionary = Record<string, string>;

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed';
export type RunStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'stale';
export type StepType = 'curl' | 'transform' | 'condition';

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
  depends_on: string[];
}

export interface ChainExport {
  version: 1;
  name: string;
  description: string;
  steps: ChainExportStep[];
}
