"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { apiFetch } from "@/lib/client";
import type { Environment } from "@/lib/types";

interface VariableRow {
  id: string;
  key: string;
  value: string;
}

export default function NewEnvironmentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [rows, setRows] = useState<VariableRow[]>([{ id: crypto.randomUUID(), key: "", value: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateRow = (rowId: string, field: keyof Omit<VariableRow, "id">, value: string) => {
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)));
  };

  const addRow = () => {
    setRows((current) => [...current, { id: crypto.randomUUID(), key: "", value: "" }]);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const variables = Object.fromEntries(
      rows.filter((row) => row.key.trim().length > 0).map((row) => [row.key.trim(), row.value]),
    );

    try {
      setSaving(true);
      const environment = await apiFetch<Environment>("/api/environments", {
        method: "POST",
        body: JSON.stringify({ name, variables }),
      });
      router.push(`/environments/${environment.id}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to create environment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/environments" className="text-sm text-indigo-300 transition hover:text-indigo-200">
          ← Back to environments
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-gray-100">Create environment</h1>
      </div>

      {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}

      <form onSubmit={submit} className="space-y-5 rounded-2xl border border-gray-800 bg-gray-900 p-6">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-200">Name</label>
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-gray-100 outline-none transition focus:border-indigo-500"
            placeholder="Production API"
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
                  placeholder="API_URL"
                />
                <input
                  value={row.value}
                  onChange={(event) => updateRow(row.id, "value", event.target.value)}
                  className="rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-gray-100 outline-none transition focus:border-indigo-500"
                  placeholder="https://api.example.com"
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
            onClick={addRow}
            className="mt-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-sm font-medium text-indigo-100 transition hover:bg-indigo-500/20"
          >
            + Add Variable
          </button>
        </div>

        <div className="flex justify-end gap-3">
          <Link
            href="/environments"
            className="rounded-xl border border-gray-700 px-4 py-3 text-sm font-medium text-gray-200 transition hover:border-indigo-500"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-indigo-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-60"
          >
            {saving ? "Creating..." : "Create Environment"}
          </button>
        </div>
      </form>
    </div>
  );
}
