"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { apiFetch } from "@/lib/client";
import type { ChainDetail, Environment } from "@/lib/types";

export default function NewChainPage() {
  const router = useRouter();
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [environmentId, setEnvironmentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadEnvironments = async () => {
      try {
        setEnvironments(await apiFetch<Environment[]>("/api/environments"));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load environments");
      }
    };

    void loadEnvironments();
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setSaving(true);
      const chain = await apiFetch<ChainDetail>("/api/chains", {
        method: "POST",
        body: JSON.stringify({
          name,
          description,
          environment_id: environmentId || null,
        }),
      });
      router.push(`/chains/${chain?.id}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to create chain");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/chains" className="text-sm text-indigo-300 transition hover:text-indigo-200">
          ← Back to chains
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-gray-100">Create a new chain</h1>
        <p className="mt-2 text-sm text-gray-400">Name your flow, attach an environment, and start adding curl steps.</p>
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
            placeholder="Customer sync"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-200">Description</label>
          <textarea
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-gray-100 outline-none transition focus:border-indigo-500"
            placeholder="Briefly describe what this chain does"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-200">Environment</label>
          <select
            value={environmentId}
            onChange={(event) => setEnvironmentId(event.target.value)}
            className="w-full rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-gray-100 outline-none transition focus:border-indigo-500"
          >
            <option value="">No environment</option>
            {environments.map((environment) => (
              <option key={environment.id} value={environment.id}>
                {environment.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-3">
          <Link
            href="/chains"
            className="rounded-xl border border-gray-700 px-4 py-3 text-sm font-medium text-gray-200 transition hover:border-indigo-500"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-indigo-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-60"
          >
            {saving ? "Creating..." : "Create Chain"}
          </button>
        </div>
      </form>
    </div>
  );
}
