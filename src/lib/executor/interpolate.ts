export interface StepResult {
  status: number;
  headers: Record<string, string>;
  body: string;
  bodyParsed?: unknown;
}

export interface ExecutionContext {
  env: Record<string, string>;
  steps: Record<string, StepResult>;
  /** Combined global + environment function source, prepended when evaluating JS. */
  fns: string;
}

function getValueAtPath(value: unknown, path: string) {
  if (!path) {
    return value;
  }

  const normalizedPath = path.replace(/\[(\d+)\]/g, ".$1");
  const parts = normalizedPath.split(".").filter(Boolean);

  let current: unknown = value;
  for (const part of parts) {
    if (current === null || current === undefined) {
      return "";
    }

    if (Array.isArray(current)) {
      const index = Number(part);
      current = Number.isInteger(index) ? current[index] : undefined;
      continue;
    }

    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
      continue;
    }

    return "";
  }

  return current;
}

function stringifyResolved(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

// Built-in $ helper variables
const HELPERS: Record<string, () => string> = {
  $timestamp: () => String(Date.now()),
  $isoDate: () => new Date().toISOString(),
  $random: () => String(Math.random()),
  $uuid: () => {
    // RFC 4122 v4 UUID without external deps
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  },
};

function resolveExpression(expression: string, context: ExecutionContext) {
  // Unwrap $(expr) or $(expr  (Insomnia-style response tag syntax)
  if (expression.startsWith("$(")) {
    const inner = expression.slice(2).replace(/\)$/, "").trim();
    return resolveExpression(inner, context);
  }

  // {{= expr }} — evaluate arbitrary JS expression with access to context
  if (expression.startsWith("=")) {
    const code = expression.slice(1).trim();
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const result = new Function("context", `"use strict";\n${context.fns}\nreturn (${code})`)(context) as unknown;
      return stringifyResolved(result);
    } catch {
      return "";
    }
  }

  // $helper variables
  if (expression in HELPERS) {
    return HELPERS[expression]();
  }

  if (expression.startsWith("env.")) {
    return context.env[expression.slice(4)] ?? "";
  }

  const stepMatch = expression.match(/^steps\.(.+?)\.(status|headers|body)(?:\.(.+))?$/);
  if (!stepMatch) {
    return "";
  }

  const [, stepName, section, path] = stepMatch;
  const step = context.steps[stepName];
  if (!step) {
    return "";
  }

  if (section === "status") {
    return String(step.status);
  }

  if (section === "headers") {
    return path ? step.headers[path.toLowerCase()] ?? "" : "";
  }

  if (!path) {
    return step.body;
  }

  return stringifyResolved(getValueAtPath(step.bodyParsed, path));
}

export function interpolate(template: string, context: ExecutionContext) {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, expression: string) =>
    resolveExpression(expression.trim(), context),
  );
}
