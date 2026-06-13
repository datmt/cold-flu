import { v4 as uuid } from 'uuid';

import db from '@/lib/db';
import { getGlobalFunctions } from '@/lib/db';

import { buildCacheKey, getCache, setCache } from './cache';
import { parseCurl } from './curl-parser';
import { interpolate, type ExecutionContext, type StepResult } from './interpolate';

type ChainRow = {
  id: string;
  environment_id: string | null;
};

type StepRow = {
  id: string;
  chain_id: string;
  name: string;
  order_index: number;
  type: 'curl' | 'transform' | 'condition';
  curl_template: string;
  transform_code: string;
  cache_enabled: number;
  cache_ttl: number;
};

type StepDependencyRow = {
  step_id: string;
  depends_on_step_id: string;
  source_handle: string | null;
};

function getChainRow(chainId: string): ChainRow {
  const chain = db.prepare('SELECT * FROM chains WHERE id = ?').get(chainId) as ChainRow | undefined;
  if (!chain) {
    throw new Error('Chain not found');
  }
  return chain;
}

function loadChainEnvironment(chain: ChainRow): { env: Record<string, string>; fns: string } {
  const env: Record<string, string> = {};
  let envFns = '';
  if (chain.environment_id) {
    const envRow = db
      .prepare('SELECT variables, functions FROM environments WHERE id = ?')
      .get(chain.environment_id) as { variables: string; functions: string } | undefined;
    if (envRow) {
      Object.assign(env, JSON.parse(envRow.variables || '{}') as Record<string, string>);
      envFns = envRow.functions ?? '';
    }
  }
  const globalFns = getGlobalFunctions();
  // Global functions come first; env functions can override same-named declarations.
  const fns = [globalFns, envFns].filter(Boolean).join('\n');
  return { env, fns };
}

function loadDependencies(stepIds: string[]): StepDependencyRow[] {
  if (stepIds.length === 0) {
    return [];
  }
  const placeholders = stepIds.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT step_id, depends_on_step_id, source_handle
       FROM step_dependencies
       WHERE step_id IN (${placeholders})
          OR depends_on_step_id IN (${placeholders})`,
    )
    .all(...stepIds, ...stepIds) as StepDependencyRow[];
}

async function executeStepsWithDependencies(
  steps: StepRow[],
  dependencies: StepDependencyRow[],
  env: Record<string, string>,
  fns: string,
  runId: string,
): Promise<string> {
  if (steps.length === 0) {
    throw new Error('No steps to run');
  }

  const context: ExecutionContext = { env, steps: {}, fns };
  const completed = new Set<string>();
  const failed = new Set<string>();
  const skipped = new Set<string>();
  const blocked = new Set<string>();
  const stepMap = new Map(steps.map((step) => [step.id, step]));
  // Stores boolean result of condition steps
  const conditionResults = new Map<string, boolean>();

  // Returns true if all deps for a step are satisfied
  const isDepSatisfied = (dep: { id: string; source_handle: string | null }): boolean => {
    if (dep.source_handle === 'true') {
      return completed.has(dep.id) && conditionResults.get(dep.id) === true;
    }
    if (dep.source_handle === 'false') {
      return completed.has(dep.id) && conditionResults.get(dep.id) === false;
    }
    return completed.has(dep.id);
  };

  // Returns true if this dep causes the step to be skipped (condition went other way, or dep was skipped)
  const isDepSkipping = (dep: { id: string; source_handle: string | null }): boolean => {
    if (dep.source_handle === 'true' && completed.has(dep.id) && conditionResults.get(dep.id) === false) return true;
    if (dep.source_handle === 'false' && completed.has(dep.id) && conditionResults.get(dep.id) === true) return true;
    if (dep.source_handle && skipped.has(dep.id)) return true;
    if (!dep.source_handle && skipped.has(dep.id)) return true;
    return false;
  };

  const dependsOn: Record<string, { id: string; source_handle: string | null }[]> = {};
  for (const step of steps) {
    dependsOn[step.id] = [];
  }
  for (const dependency of dependencies) {
    if (dependsOn[dependency.step_id]) {
      dependsOn[dependency.step_id].push({
        id: dependency.depends_on_step_id,
        source_handle: dependency.source_handle ?? null,
      });
    }
  }

  let waveIndex = 0;
  let madeProgress = true;

  while (completed.size + failed.size + skipped.size < steps.length && madeProgress) {
    madeProgress = false;

    // Propagate failures: steps that depend on a failed step (regular deps only)
    const blockedSteps = steps.filter(
      (step) =>
        !completed.has(step.id) &&
        !failed.has(step.id) &&
        !skipped.has(step.id) &&
        dependsOn[step.id].some((dep) => !dep.source_handle && failed.has(dep.id)),
    );

    for (const step of blockedSteps) {
      if (blocked.has(step.id)) {
        continue;
      }

      blocked.add(step.id);
      failed.add(step.id);
      recordFailedStep(
        runId,
        step,
        waveIndex,
        `Blocked by failed dependencies: ${dependsOn[step.id]
          .filter((dep) => !dep.source_handle && failed.has(dep.id))
          .map((dep) => stepMap.get(dep.id)?.name ?? dep.id)
          .join(', ')}`,
      );
    }

    // Propagate skips: steps whose condition branch wasn't taken, or whose dep was skipped
    const skippableSteps = steps.filter(
      (step) =>
        !completed.has(step.id) &&
        !failed.has(step.id) &&
        !skipped.has(step.id) &&
        dependsOn[step.id].some((dep) => isDepSkipping(dep)),
    );

    for (const step of skippableSteps) {
      skipped.add(step.id);
      madeProgress = true;
      recordSkippedStep(runId, step, waveIndex);
    }

    const ready = steps.filter(
      (step) =>
        !completed.has(step.id) &&
        !failed.has(step.id) &&
        !skipped.has(step.id) &&
        dependsOn[step.id].every((dep) => isDepSatisfied(dep)),
    );

    if (ready.length === 0) {
      break;
    }

    madeProgress = true;

    await Promise.all(
      ready.map(async (step) => {
        const runStepId = uuid();
        const startedAt = Date.now();

        db.prepare(
          `INSERT INTO run_steps (
            id, run_id, step_id, step_name, order_index, status, started_at
          ) VALUES (?, ?, ?, ?, ?, 'running', ?)`,
        ).run(runStepId, runId, step.id, step.name, waveIndex, startedAt);

        let resolvedCurl = '';
        let requestMethod = '';
        let requestUrl = '';
        let requestHeaders = '';
        let requestBody = '';

        try {
          let result: StepResult;
          let fromCache = 0;

          if (step.type === 'condition') {
            const interpolatedCode = interpolate(step.transform_code, context);
            const evaluator = new Function('context', `"use strict";\n${context.fns}\n${interpolatedCode}`) as (
              context: ExecutionContext,
            ) => unknown;
            const output = await Promise.resolve(evaluator(context));
            const conditionResult = Boolean(output);
            conditionResults.set(step.id, conditionResult);
            result = {
              status: 200,
              headers: { 'content-type': 'text/plain' },
              body: String(conditionResult),
              bodyParsed: conditionResult,
            };
          } else if (step.type === 'transform') {
            // Interpolate {{steps.X.body.field}} placeholders inside transform code before executing
            const interpolatedCode = interpolate(step.transform_code, context);
            const transformer = new Function('context', `"use strict";\n${context.fns}\n${interpolatedCode}`) as (
              context: ExecutionContext,
            ) => unknown;
            const output = await Promise.resolve(transformer(context));
            const body = typeof output === 'string' ? output : JSON.stringify(output ?? null);
            result = {
              status: 200,
              headers: { 'content-type': 'application/json' },
              body,
              bodyParsed: typeof output === 'string' ? tryParseJson(output) : output ?? null,
            };
          } else {
            // Parse the template first (before interpolation) so escape sequences in
            // the body (\n, \", etc.) are decoded once. Then interpolate each part
            // separately — this prevents {{...}} values from corrupting shell quoting
            // and stops literal \n sequences from appearing in the sent body.
            const templateParsed = parseCurl(step.curl_template);
            requestMethod = templateParsed.method;
            requestUrl = interpolate(templateParsed.url, context);
            const resolvedHeaders: Record<string, string> = {};
            for (const [k, v] of Object.entries(templateParsed.headers)) {
              resolvedHeaders[k] = interpolate(v, context);
            }
            requestHeaders = JSON.stringify(resolvedHeaders);
            requestBody = templateParsed.body ? interpolate(templateParsed.body, context) : '';

            // resolvedCurl is stored for display only
            resolvedCurl = interpolate(step.curl_template, context);

            const fetchParsed = {
              method: requestMethod,
              url: requestUrl,
              headers: resolvedHeaders,
              body: requestBody || undefined,
            };

            if (step.cache_enabled) {
              const cacheKey = buildCacheKey(fetchParsed.method, fetchParsed.url, fetchParsed.headers, fetchParsed.body);
              const cached = getCache(step.id, cacheKey);

              if (cached) {
                fromCache = 1;
                result = {
                  status: cached.response_status,
                  headers: JSON.parse(cached.response_headers || '{}') as Record<string, string>,
                  body: cached.response_body || '',
                  bodyParsed: tryParseJson(cached.response_body),
                };
              } else {
                result = await fetchRequest(fetchParsed);
                if (result.status < 500) {
                  setCache(step.id, cacheKey, result, step.cache_ttl);
                }
              }
            } else {
              result = await fetchRequest(fetchParsed);
            }
          }

          // Treat HTTP 4xx/5xx as step failures so dependent steps are blocked
          if (step.type === 'curl' && result.status >= 400) {
            failed.add(step.id);
            db.prepare(
              `UPDATE run_steps
               SET status = 'failed',
                   error = ?,
                   resolved_curl = ?,
                   request_method = ?,
                   request_url = ?,
                   request_headers = ?,
                   request_body = ?,
                   response_status = ?,
                   response_headers = ?,
                   response_body = ?,
                   from_cache = ?,
                   finished_at = ?
               WHERE id = ?`,
            ).run(
              `HTTP ${result.status}`,
              resolvedCurl,
              requestMethod,
              requestUrl,
              requestHeaders,
              requestBody,
              result.status,
              JSON.stringify(result.headers ?? {}),
              result.body,
              fromCache,
              Date.now(),
              runStepId,
            );
            return;
          }

          storeStepResult(context, step, result);
          completed.add(step.id);

          db.prepare(
            `UPDATE run_steps
             SET status = 'completed',
                 resolved_curl = ?,
                 request_method = ?,
                 request_url = ?,
                 request_headers = ?,
                 request_body = ?,
                 response_status = ?,
                 response_headers = ?,
                 response_body = ?,
                 from_cache = ?,
                 finished_at = ?
             WHERE id = ?`,
          ).run(
            resolvedCurl,
            requestMethod,
            requestUrl,
            requestHeaders,
            requestBody,
            result.status,
            JSON.stringify(result.headers ?? {}),
            result.body,
            fromCache,
            Date.now(),
            runStepId,
          );
        } catch (error) {
          failed.add(step.id);
          const baseMessage = error instanceof Error ? error.message : String(error);
          const cause =
            error instanceof Error && error.cause instanceof Error ? error.cause.message : null;
          const parts: string[] = [baseMessage];
          if (cause && cause !== baseMessage) parts.push(`Caused by: ${cause}`);
          if (requestUrl) parts.push(`URL: ${requestUrl}`);
          const fullError = parts.join('\n');
          db.prepare(
            `UPDATE run_steps
             SET status = 'failed',
                 error = ?,
                 resolved_curl = ?,
                 request_method = ?,
                 request_url = ?,
                 request_headers = ?,
                 request_body = ?,
                 finished_at = ?
             WHERE id = ?`,
          ).run(
            fullError,
            resolvedCurl || null,
            requestMethod || null,
            requestUrl || null,
            requestHeaders || null,
            requestBody || null,
            Date.now(),
            runStepId,
          );
        }
      }),
    );

    waveIndex += 1;
  }

  const remaining = steps.filter((step) => !completed.has(step.id) && !failed.has(step.id) && !skipped.has(step.id));
  if (remaining.length > 0) {
    for (const step of remaining) {
      failed.add(step.id);
      recordFailedStep(
        runId,
        step,
        waveIndex,
        'Cyclic or unresolved dependencies prevented execution.',
      );
    }
  }

  const finalStatus = failed.size > 0 ? 'failed' : 'completed';
  db.prepare('UPDATE runs SET status = ?, finished_at = ?, error = ? WHERE id = ?').run(
    finalStatus,
    Date.now(),
    failed.size > 0 ? 'One or more steps failed.' : null,
    runId,
  );

  return runId;
}

/**
 * Starts chain execution immediately and returns the runId without waiting for
 * the chain to finish. The execution runs in the background so the caller can
 * poll GET /api/runs/:id for live progress.
 */
export function startChainExecution(chainId: string): string {
  getChainRow(chainId);

  const count = (db.prepare('SELECT COUNT(*) as n FROM steps WHERE chain_id = ?').get(chainId) as { n: number }).n;
  if (count === 0) throw new Error('No steps in chain');

  const runId = uuid();
  db.prepare('INSERT INTO runs (id, chain_id, status, started_at) VALUES (?, ?, ?, ?)').run(
    runId,
    chainId,
    'running',
    Date.now(),
  );

  // Fire-and-forget: execution writes progress to DB; clients poll for updates.
  void executeChain(chainId, runId);
  return runId;
}

export async function executeChain(chainId: string, preCreatedRunId?: string): Promise<string> {
  const chain = getChainRow(chainId);
  const { env, fns } = loadChainEnvironment(chain);

  const steps = db
    .prepare('SELECT * FROM steps WHERE chain_id = ? ORDER BY order_index, created_at')
    .all(chainId) as StepRow[];

  if (steps.length === 0) {
    throw new Error('No steps in chain');
  }

  const stepIds = steps.map((step) => step.id);
  const dependencies = loadDependencies(stepIds);

  const runId = preCreatedRunId ?? uuid();
  if (!preCreatedRunId) {
    db.prepare('INSERT INTO runs (id, chain_id, status, started_at) VALUES (?, ?, ?, ?)').run(
      runId,
      chainId,
      'running',
      Date.now(),
    );
  }

  await executeStepsWithDependencies(steps, dependencies, env, fns, runId);
  return runId;
}

export function startStepExecution(stepId: string): string {
  const step = db.prepare('SELECT * FROM steps WHERE id = ?').get(stepId) as StepRow | undefined;
  if (!step) {
    throw new Error('Step not found');
  }

  const chain = getChainRow(step.chain_id);
  const steps = db
    .prepare('SELECT * FROM steps WHERE chain_id = ? ORDER BY order_index, created_at')
    .all(step.chain_id) as StepRow[];

  if (steps.length === 0) {
    throw new Error('No steps in chain');
  }

  const stepsToRun = [step];

  const runId = uuid();
  db.prepare('INSERT INTO runs (id, chain_id, status, started_at) VALUES (?, ?, ?, ?)').run(
    runId,
    chain.id,
    'running',
    Date.now(),
  );

  const staleRows = steps.filter((item) => item.id !== step.id);
  if (staleRows.length > 0) {
    const insert = db.prepare(
      `INSERT INTO run_steps (
        id, run_id, step_id, step_name, order_index, status
      ) VALUES (?, ?, ?, ?, ?, 'stale')`,
    );
    for (const staleStep of staleRows) {
      insert.run(uuid(), runId, staleStep.id, staleStep.name, staleStep.order_index);
    }
  }

  const { env, fns } = loadChainEnvironment(chain);
  void executeStepsWithDependencies(stepsToRun, [], env, fns, runId);
  return runId;
}

function storeStepResult(context: ExecutionContext, step: StepRow, result: StepResult) {
  context.steps[step.id] = result;
  context.steps[step.name] = result;
}

function recordFailedStep(runId: string, step: StepRow, waveIndex: number, error: string) {
  db.prepare(
    `INSERT INTO run_steps (
      id, run_id, step_id, step_name, order_index, status, error, started_at, finished_at
    ) VALUES (?, ?, ?, ?, ?, 'failed', ?, ?, ?)`,
  ).run(uuid(), runId, step.id, step.name, waveIndex, error, Date.now(), Date.now());
}

function recordSkippedStep(runId: string, step: StepRow, waveIndex: number) {
  db.prepare(
    `INSERT INTO run_steps (
      id, run_id, step_id, step_name, order_index, status, started_at, finished_at
    ) VALUES (?, ?, ?, ?, ?, 'skipped', ?, ?)`,
  ).run(uuid(), runId, step.id, step.name, waveIndex, Date.now(), Date.now());
}

async function fetchRequest(parsed: {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}): Promise<StepResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(parsed.url, {
      method: parsed.method,
      headers: parsed.headers,
      body: parsed.body || undefined,
      signal: controller.signal,
    });
    const bodyText = await response.text();
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      status: response.status,
      headers,
      body: bodyText,
      bodyParsed: tryParseJson(bodyText),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function tryParseJson(value?: string | null): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
