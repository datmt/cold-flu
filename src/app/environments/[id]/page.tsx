"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { lineNumbers } from "@codemirror/view";
import { bracketMatching } from "@codemirror/language";

import { apiFetch } from "@/lib/client";
import type { Environment } from "@/lib/types";

interface VariableRow {
  id: string;
  key: string;
  value: string;
}

function rowsFromEnvironment(environment: Environment | null): VariableRow[] {
  if (!environment) {
    return [{ id: crypto.randomUUID(), key: "", value: "" }];
  }

  const entries = Object.entries(environment.variables);
  if (entries.length === 0) {
    return [{ id: crypto.randomUUID(), key: "", value: "" }];
  }

  return entries.map(([key, value]) => ({
    id: crypto.randomUUID(),
    key,
    value,
  }));
}

export default function EnvironmentEditorPage() {
  const params = useParams<{ id: string }>();
  const environmentId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [rows, setRows] = useState<VariableRow[]>([]);
  const [functions, setFunctions] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEnvironment = useCallback(async () => {
    if (!environmentId) {
      return;
    }

    const data = await apiFetch<Environment>(`/api/environments/${environmentId}`);
    setEnvironment(data);
    setRows(rowsFromEnvironment(data));
    setFunctions(data.functions ?? "");
  }, [environmentId]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        await loadEnvironment();
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load environment");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [loadEnvironment]);

  const variables = useMemo(
    () => Object.fromEntries(rows.filter((row) => row.key.trim()).map((row) => [row.key.trim(), row.value])),
    [rows],
  );

  const updateRow = (rowId: string, field: keyof Omit<VariableRow, "id">, value: string) => {
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)));
  };

  const save = async () => {
    if (!environment) {
      return;
    }

    try {
      setSaving(true);
      const updated = await apiFetch<Environment>(`/api/environments/${environment.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: environment.name,
          variables,
          functions,
        }),
      });
      setEnvironment(updated);
      setRows(rowsFromEnvironment(updated));
      setFunctions(updated.functions ?? "");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save environment");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 text-sm text-gray-400">Loading environment...</div>;
  }

  if (!environment) {
    return <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-200">Environment not found.</div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/environments" className="text-sm text-indigo-300 transition hover:text-indigo-200">
          ← Back to environments
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-gray-100">Edit environment</h1>
      </div>

      {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}

      <div className="space-y-5 rounded-2xl border border-gray-800 bg-gray-900 p-6">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-200">Name</label>
          <input
            value={environment.name}
            onChange={(event) => setEnvironment((current) => (current ? { ...current, name: event.target.value } : current))}
            className="w-full rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-gray-100 outline-none transition focus:border-indigo-500"
          />
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4">
          <div className="mb-4 grid grid-cols-[1fr_1fr_auto] gap-3 text-xs uppercase tracking-[0.3em] text-gray-500">
            <span>Key</span>
            <span>Value</span>
            <span />
          </div>
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] gap-3">
                <input
                  value={row.key}
                  onChange={(event) => updateRow(row.id, "key", event.target.value)}
                  className="rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-gray-100 outline-none transition focus:border-indigo-500"
                  placeholder="API_KEY"
                />
                <input
                  value={row.value}
                  onChange={(event) => updateRow(row.id, "value", event.target.value)}
                  className="rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-gray-100 outline-none transition focus:border-indigo-500"
                  placeholder="sk-..."
                />
                <button
                  type="button"
                  onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
                  className="rounded-xl border border-red-500/30 px-4 py-3 text-sm text-red-300 transition hover:bg-red-500/10"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setRows((current) => [...current, { id: crypto.randomUUID(), key: "", value: "" }])}
            className="mt-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-sm font-medium text-indigo-100 transition hover:bg-indigo-500/20"
          >
            + Add Variable
          </button>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-200">Environment Functions</label>
          <p className="mb-3 text-xs text-gray-500">
            JS helper functions available in all steps for this environment. These override global functions with the
            same name. Use <code className="rounded bg-gray-800 px-1 text-indigo-300">function</code> declarations.
          </p>
          <div className="overflow-hidden rounded-xl border border-gray-700 bg-gray-950">
            <CodeMirror
              value={functions}
              onChange={setFunctions}
              extensions={[javascript(), bracketMatching(), lineNumbers()]}
              theme={oneDark}
              placeholder={"// function myHelper(x) { return x; }"}
              basicSetup={{ lineNumbers: false }}
              className="min-h-[160px] text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-xl bg-indigo-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Environment"}
          </button>
        </div>
      </div>
    </div>
  );
}
