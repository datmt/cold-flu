"use client";

import { useCallback, useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { lineNumbers } from "@codemirror/view";
import { bracketMatching } from "@codemirror/language";

import { apiFetch } from "@/lib/client";

const PLACEHOLDER = `// Define helper functions available in ALL chains and environments.
// Use \`function\` declarations (not const/let) so they can be redeclared per-environment.
//
// Example:
// function encodeBase64(str) {
//   return btoa(str);
// }
//
// function buildAuthHeader(token) {
//   return "Bearer " + token;
// }
//
// Then in any transform/condition step, or in {{ = expr }} placeholders:
//   return buildAuthHeader(context.env.TOKEN);
`;

export default function GlobalFunctionsPage() {
  const [src, setSrc] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ functions: string }>("/api/settings/functions");
      setSrc(data.functions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load global functions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await apiFetch<{ functions: string }>("/api/settings/functions", {
        method: "PUT",
        body: JSON.stringify({ functions: src }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save global functions");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-gray-100">Global Functions</h1>
        <p className="mt-2 text-sm text-gray-400">
          Functions defined here are available in every chain, in every environment. Use{" "}
          <code className="rounded bg-gray-800 px-1 text-indigo-300">function</code> declarations so they can be
          overridden per-environment.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
      ) : null}

      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
        {loading ? (
          <div className="text-sm text-gray-400">Loading…</div>
        ) : (
          <CodeMirror
            value={src}
            onChange={setSrc}
            extensions={[javascript(), bracketMatching(), lineNumbers()]}
            theme={oneDark}
            placeholder={PLACEHOLDER}
            basicSetup={{ lineNumbers: false }}
            className="min-h-[320px] text-sm"
          />
        )}
      </div>

      <div className="flex items-center justify-end gap-3">
        {saved ? <span className="text-sm text-green-400">Saved ✓</span> : null}
        <button
          type="button"
          disabled={saving || loading}
          onClick={() => void save()}
          className="rounded-xl bg-indigo-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save Global Functions"}
        </button>
      </div>
    </div>
  );
}
