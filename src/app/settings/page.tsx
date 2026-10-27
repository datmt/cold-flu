"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/client";

type Retention = {
  maxRunsPerChain: number;
  maxLoadTestsPerChain: number;
  maxAgeDays: number;
  maxBodyBytes: number;
};

const FIELDS: { key: keyof Retention; label: string; hint: string }[] = [
  { key: "maxRunsPerChain", label: "Max runs per chain", hint: "Oldest runs beyond this are deleted after each run." },
  { key: "maxLoadTestsPerChain", label: "Max load tests per chain", hint: "Whole load tests (with all their runs) beyond this are deleted." },
  { key: "maxAgeDays", label: "Max age (days)", hint: "Runs and load tests older than this are deleted." },
  { key: "maxBodyBytes", label: "Max stored body (bytes)", hint: "Request/response bodies are cut to this size in history." },
];

const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;

export default function SettingsPage() {
  const [form, setForm] = useState<Retention | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<Retention>("/api/settings/history")
      .then(setForm)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load settings"));
  }, []);

  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      setStatus(await fn());
    } catch (err) {
      setError(err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run("Save", async () => {
      await apiFetch("/api/settings/history", { method: "PUT", body: JSON.stringify(form) });
      return "Saved ✓";
    });

  const compact = () =>
    run("Compact", async () => {
      const r = await apiFetch<{ deleted: number; bytesBefore: number; bytesAfter: number }>(
        "/api/settings/history/compact",
        { method: "POST" },
      );
      return `Deleted ${r.deleted} runs · ${mb(r.bytesBefore)} → ${mb(r.bytesAfter)}`;
    });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-gray-100">Settings</h1>
        <p className="mt-2 text-sm text-gray-400">
          History retention. Use <strong className="text-gray-200">0</strong> for unlimited.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
      ) : null}

      <div className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        {!form ? (
          <div className="text-sm text-gray-400">Loading…</div>
        ) : (
          FIELDS.map(({ key, label, hint }) => (
            <label key={key} className="block">
              <span className="text-sm font-medium text-gray-200">{label}</span>
              <input
                type="number"
                min={0}
                step={1}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
              />
              <span className="mt-1 block text-xs text-gray-500">{hint}</span>
            </label>
          ))
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {status ? <span className="text-sm text-green-400">{status}</span> : null}
        <button
          type="button"
          disabled={busy || !form}
          onClick={() => void compact()}
          title="Apply retention to all chains now, then VACUUM history.db"
          className="rounded-xl border border-gray-700 px-4 py-3 text-sm font-medium text-gray-200 transition hover:border-indigo-500 disabled:opacity-60"
        >
          Compact now
        </button>
        <button
          type="button"
          disabled={busy || !form}
          onClick={() => void save()}
          className="rounded-xl bg-indigo-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-60"
        >
          Save
        </button>
      </div>
    </div>
  );
}
