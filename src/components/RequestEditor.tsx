'use client';

import { useCallback, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { isJsonLike, prettyJsonLike } from '@/lib/formatters';
import { bracketMatching } from '@codemirror/language';
import { lineNumbers } from '@codemirror/view';

import { optionsToFlags, parseCurl, type CurlOptions } from '@/lib/executor/curl-parser';

interface RequestEditorProps {
  curlTemplate: string;
  onChange: (curlTemplate: string) => void;
  envVariables: string[];
}

interface CurlParts {
  method: string;
  url: string;
  headers: { key: string; value: string }[];
  body: string;
  // Transport flags (-L, -k, -m, ...) have no form fields; carried through so edits don't drop them.
  options: CurlOptions;
  warnings: string[];
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

function parseCurlToParts(curlTemplate: string): CurlParts {
  try {
    const parsed = parseCurl(curlTemplate);
    return {
      method: parsed.method,
      url: parsed.url,
      headers: Object.entries(parsed.headers).map(([key, value]) => ({ key, value })),
      body: parsed.body ?? '',
      options: parsed.options,
      warnings: parsed.warnings,
    };
  } catch {
    return { method: 'GET', url: '', headers: [], body: '', options: {}, warnings: [] };
  }
}

function buildCurlFromParts(parts: CurlParts): string {
  const lines: string[] = [`curl -X ${parts.method || 'GET'} '${parts.url || ''}'`];
  for (const flag of optionsToFlags(parts.options)) lines.push(`  ${flag}`);
  for (const h of parts.headers) {
    // JSON.stringify produces a double-quoted, fully-escaped string — safe for any value
    if (h.key) lines.push(`  -H ${JSON.stringify(`${h.key}: ${h.value}`)}`);
  }
  if (parts.body) {
    // Single-quoted like a shell would: newlines stay literal, ' becomes '\''
    lines.push(`  -d '${parts.body.replace(/'/g, "'\\''")}'`);
  }
  return lines.join(' \\\n');
}

export default function RequestEditor({ curlTemplate, onChange, envVariables }: RequestEditorProps) {
  const [parts, setParts] = useState<CurlParts>(() => parseCurlToParts(curlTemplate));
  const [bodyPrettyError, setBodyPrettyError] = useState<string | null>(null);

  const commit = useCallback(
    (next: CurlParts) => {
      setParts(next);
      onChange(buildCurlFromParts(next));
    },
    [onChange],
  );

  const setMethod = (method: string) => commit({ ...parts, method });
  const setUrl = (url: string) => commit({ ...parts, url });
  const setBody = (body: string) => { setBodyPrettyError(null); commit({ ...parts, body }); };

  const addHeader = () => commit({ ...parts, headers: [...parts.headers, { key: '', value: '' }] });
  const removeHeader = (idx: number) =>
    commit({ ...parts, headers: parts.headers.filter((_, i) => i !== idx) });
  const updateHeader = (idx: number, field: 'key' | 'value', val: string) =>
    commit({
      ...parts,
      headers: parts.headers.map((h, i) => (i === idx ? { ...h, [field]: val } : h)),
    });

  const prettifyBody = () => {
    const pretty = prettyJsonLike(parts.body);
    if (pretty === parts.body && !isJsonLike(parts.body)) {
      setBodyPrettyError('Not JSON-like');
      return;
    }
    commit({ ...parts, body: pretty });
    setBodyPrettyError(null);
  };

  const inputCls = 'rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-white outline-none transition focus:border-indigo-500';
  const envVarListId = 'request-editor-env-vars';

  return (
    <div className="space-y-3">
      {parts.warnings.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200">
          {parts.warnings.map((w, i) => (
            <div key={i}>⚠ {w}</div>
          ))}
        </div>
      )}
      {/* Autocomplete source for env var interpolation tokens across URL + header values */}
      <datalist id={envVarListId}>
        {envVariables.map((name) => (
          <option key={name} value={`{{env.${name}}}`} />
        ))}
      </datalist>

      {/* Method + URL */}
      <div>
        <p className="mb-1.5 text-sm font-medium text-gray-200">Method &amp; URL</p>
        <div className="flex gap-2">
          <select
            value={parts.method}
            onChange={(e) => setMethod(e.target.value)}
            className={`w-28 shrink-0 ${inputCls} font-mono`}
          >
            {HTTP_METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <input
            value={parts.url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.example.com/endpoint"
            list={envVarListId}
            className={`flex-1 ${inputCls} font-mono`}
          />
        </div>
      </div>

      {/* Headers */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-sm font-medium text-gray-200">Headers</p>
          <button
            type="button"
            onClick={addHeader}
            className="rounded px-2 py-0.5 text-xs text-indigo-400 hover:bg-gray-800 hover:text-indigo-300"
          >
            + Add
          </button>
        </div>
        {parts.headers.length === 0 ? (
          <p className="text-xs text-gray-600 italic">No headers.</p>
        ) : (
          <div className="space-y-1.5">
            {parts.headers.map((h, idx) => (
              <div key={idx} className="flex gap-1.5 items-center">
                <input
                  value={h.key}
                  onChange={(e) => updateHeader(idx, 'key', e.target.value)}
                  placeholder="Header name"
                  className={`w-36 shrink-0 ${inputCls} font-mono`}
                />
                <span className="text-gray-600 text-xs">:</span>
                <input
                  value={h.value}
                  onChange={(e) => updateHeader(idx, 'value', e.target.value)}
                  placeholder="value"
                  list={envVarListId}
                  className={`flex-1 ${inputCls} font-mono`}
                />
                <button
                  type="button"
                  onClick={() => removeHeader(idx)}
                  className="text-red-500 hover:text-red-400 text-xs px-1"
                  title="Remove header"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Body */}
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-gray-200">Body</p>
          <div className="flex items-center gap-2">
            {bodyPrettyError && <span className="text-xs text-red-400">{bodyPrettyError}</span>}
            <button
              type="button"
              onClick={prettifyBody}
              className="rounded px-2 py-0.5 text-xs text-indigo-400 hover:bg-gray-800 hover:text-indigo-300"
              title="Pretty-print JSON"
            >
              {} Prettify
            </button>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-gray-700 focus-within:border-indigo-500 transition min-h-[140px] [&_.cm-editor]:rounded-lg [&_.cm-editor.cm-focused]:outline-none [&_.cm-scroller]:font-mono [&_.cm-scroller]:text-xs">
          <CodeMirror
            value={parts.body}
            onChange={setBody}
            extensions={[json(), bracketMatching(), lineNumbers()]}
            theme={oneDark}
            basicSetup={{
              lineNumbers: false,
              bracketMatching: false,
              foldGutter: false,
              highlightActiveLine: false,
              highlightSelectionMatches: false,
            }}
            placeholder='{"key": "value"}'
            minHeight="140px"
          />
        </div>
      </div>

      {/* Reconstructed curl preview */}
      <details className="group">
        <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-400">
          ▶ View raw cURL template
        </summary>
        <pre className="mt-1.5 overflow-x-auto rounded-lg bg-gray-950 p-2 text-xs text-gray-400">
          {buildCurlFromParts(parts)}
        </pre>
      </details>
    </div>
  );
}
