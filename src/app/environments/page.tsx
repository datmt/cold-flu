"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiFetch, formatDateTime } from "@/lib/client";
import type { Environment } from "@/lib/types";

export default function EnvironmentsPage() {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const loadEnvironments = async () => {
      try {
        setLoading(true);
        setEnvironments(await apiFetch<Environment[]>("/api/environments"));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load environments");
      } finally {
        setLoading(false);
      }
    };

    void loadEnvironments();
  }, []);

  const deleteEnvironment = async (environmentId: string) => {
    if (!window.confirm("Delete this environment?")) {
      return;
    }

    try {
      setActiveId(environmentId);
      await apiFetch<{ success: boolean }>(`/api/environments/${environmentId}`, { method: "DELETE" });
      setEnvironments((current) => current.filter((environment) => environment.id !== environmentId));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete environment");
    } finally {
      setActiveId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-gray-500">Environments</p>
          <h1 className="mt-2 text-3xl font-semibold text-gray-100">Manage shared variables</h1>
        </div>
        <Link
          href="/environments/new"
          className="rounded-xl bg-indigo-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-400"
        >
          New Environment
        </Link>
      </div>

      {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}

      {loading ? (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 text-sm text-gray-400">Loading environments...</div>
      ) : environments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-800 bg-gray-900/60 p-10 text-center">
          <h2 className="text-xl font-semibold text-gray-100">No environments yet</h2>
          <p className="mt-2 text-sm text-gray-400">Create a reusable set of variables like API URLs and keys.</p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {environments.map((environment) => {
            const busy = activeId === environment.id;
            return (
              <div key={environment.id} className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-100">{environment.name}</h2>
                    <p className="mt-2 text-sm text-gray-400">{Object.keys(environment.variables).length} variable(s)</p>
                  </div>
                  <span className="text-xs text-gray-500">Updated {formatDateTime(environment.updated_at)}</span>
                </div>
                <div className="mt-4 rounded-xl border border-gray-800 bg-gray-950/70 p-3 font-mono text-xs text-gray-300">
                  {Object.entries(environment.variables).length > 0 ? (
                    Object.entries(environment.variables).map(([key, value]) => (
                      <div key={key} className="flex items-start justify-between gap-3 py-1">
                        <span className="text-indigo-300">{key}</span>
                        <span className="truncate text-gray-400">{value}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-gray-500">No variables defined.</span>
                  )}
                </div>
                <div className="mt-5 flex gap-3">
                  <Link
                    href={`/environments/${environment.id}`}
                    className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-medium text-gray-100 transition hover:border-indigo-500"
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void deleteEnvironment(environment.id)}
                    className="rounded-xl border border-red-500/30 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/10 disabled:opacity-60"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
