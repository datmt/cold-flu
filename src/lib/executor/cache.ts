import { v4 as uuid } from 'uuid';

import { historyDb } from '@/lib/db';

import type { StepResult } from './interpolate';

export type CachedResponseRow = {
  id: string;
  step_id: string;
  cache_key: string;
  response_status: number;
  response_headers: string | null;
  response_body: string | null;
  cached_at: number;
  expires_at: number;
};

export function buildCacheKey(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): string {
  return JSON.stringify({
    method: method.toUpperCase(),
    url,
    headers: Object.entries(headers)
      .sort(([left], [right]) => left.localeCompare(right))
      .reduce<Record<string, string>>((accumulator, [key, value]) => {
        accumulator[key] = value;
        return accumulator;
      }, {}),
    body: body ?? '',
  });
}

export function getCache(stepId: string, cacheKey: string): CachedResponseRow | null {
  const row = historyDb
    .prepare(
      `SELECT *
       FROM step_cache
       WHERE step_id = ?
         AND cache_key = ?
         AND expires_at > ?
       ORDER BY cached_at DESC
       LIMIT 1`,
    )
    .get(stepId, cacheKey, Date.now()) as CachedResponseRow | undefined;

  return row ?? null;
}

export function setCache(
  stepId: string,
  cacheKey: string,
  result: StepResult,
  ttlSeconds: number,
): void {
  const now = Date.now();
  historyDb.prepare(
    `INSERT INTO step_cache (
      id, step_id, cache_key, response_status, response_headers, response_body, cached_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(step_id, cache_key)
    DO UPDATE SET
      response_status = excluded.response_status,
      response_headers = excluded.response_headers,
      response_body = excluded.response_body,
      cached_at = excluded.cached_at,
      expires_at = excluded.expires_at`,
  ).run(
    uuid(),
    stepId,
    cacheKey,
    result.status,
    JSON.stringify(result.headers ?? {}),
    result.body ?? '',
    now,
    now + ttlSeconds * 1000,
  );
}
