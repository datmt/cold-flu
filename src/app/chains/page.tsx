"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { apiFetch, formatDateTime } from "@/lib/client";
import type { ChainDetail, ChainSummary } from "@/lib/types";

const PAGE_SIZE = 10;

export default function ChainsPage() {
  const router = useRouter();
  const [chains, setChains] = useState<ChainSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadChains = async () => {
      try {
        setLoading(true);
        const data = await apiFetch<ChainSummary[]>("/api/chains");
        // Sort by updated_at descending
        data.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        setChains(data);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load chains");
      } finally {
        setLoading(false);
      }
    };

    void loadChains();
  }, []);

  const deleteChain = async (chainId: string) => {
    if (!window.confirm("Delete this chain?")) {
      return;
    }

    try {
      setActiveId(chainId);
      await apiFetch<{ success: boolean }>(`/api/chains/${chainId}`, { method: "DELETE" });
      setChains((current) => current.filter((chain) => chain.id !== chainId));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete chain");
    } finally {
      setActiveId(null);
    }
  };

  const duplicateChain = async (chainId: string) => {
    try {
      setActiveId(chainId);
      const created = await apiFetch<ChainDetail>(`/api/chains/${chainId}/duplicate`, { method: "POST" });
      setChains((current) => {
        const updated = [
          ...current,
          {
            id: created.id,
            name: created.name,
            description: created.description,
            environment_id: created.environment_id,
            created_at: created.created_at,
            updated_at: created.updated_at,
            step_count: created.steps.length,
          } satisfies ChainSummary,
        ];
        updated.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        return updated;
      });
    } catch (dupError) {
      setError(dupError instanceof Error ? dupError.message : "Unable to duplicate chain");
    } finally {
      setActiveId(null);
    }
  };

  const runChain = async (chainId: string) => {
    try {
      setActiveId(chainId);
      const result = await apiFetch<{ runId: string }>(`/api/chains/${chainId}/run`, { method: "POST" });
      router.push(`/chains/${chainId}?tab=runs&runId=${result.runId}`);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Unable to run chain");
    } finally {
      setActiveId(null);
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError(null);

    try {
      const text = await file.text();
      const json: unknown = JSON.parse(text);
      const created = await apiFetch<ChainDetail>("/api/chains/import", {
        method: "POST",
        body: JSON.stringify(json),
      });
      router.push(`/chains/${created.id}`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Unable to import chain");
      setImporting(false);
    }

    // Reset input so the same file can be re-imported if needed.
    if (importInputRef.current) {
      importInputRef.current.value = "";
    }
  };

  const filtered = chains.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-gray-500">Chains</p>
          <h1 className="mt-2 text-3xl font-semibold text-gray-100">Build request step machines</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => void handleImportFile(e)}
          />
          <button
            type="button"
            disabled={importing}
            onClick={() => importInputRef.current?.click()}
            className="rounded-xl border border-gray-700 px-4 py-3 text-sm font-medium text-gray-100 transition hover:border-indigo-500 disabled:opacity-60"
          >
            {importing ? "Importing…" : "↑ Import"}
          </button>
          <Link
            href="/chains/new"
            className="rounded-xl bg-indigo-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-400"
          >
            New Chain
          </Link>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}

      {loading ? (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 text-sm text-gray-400">Loading chains...</div>
      ) : chains.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-800 bg-gray-900/60 p-10 text-center">
          <h2 className="text-xl font-semibold text-gray-100">No chains yet</h2>
          <p className="mt-2 text-sm text-gray-400">Start with a named flow of curl steps and attach an environment later.</p>
          <Link
            href="/chains/new"
            className="mt-6 inline-flex rounded-xl bg-indigo-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-400"
          >
            Create your first chain
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Search */}
          <input
            type="search"
            placeholder="Search by title…"
            value={search}
            onChange={handleSearchChange}
            className="w-full max-w-sm rounded-xl border border-gray-700 bg-gray-900 px-4 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-indigo-500"
          />

          {/* Table */}
          <div className="overflow-x-auto rounded-2xl border border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/80 text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Steps</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 bg-gray-900">
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      No chains match your search.
                    </td>
                  </tr>
                ) : (
                  paginated.map((chain) => {
                    const busy = activeId === chain.id;
                    return (
                      <tr key={chain.id} className="transition hover:bg-gray-800/40">
                        <td className="px-4 py-3 font-medium text-gray-100">
                          {chain.name}
                          {chain.description ? (
                            <p className="mt-0.5 text-xs font-normal text-gray-500">{chain.description}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-gray-400">
                          {chain.step_count} step{chain.step_count === 1 ? "" : "s"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-400">
                          {formatDateTime(chain.updated_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void runChain(chain.id)}
                              className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-400 disabled:opacity-60"
                            >
                              {busy ? "Running…" : "Run"}
                            </button>
                            <Link
                              href={`/chains/${chain.id}`}
                              className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-100 transition hover:border-indigo-500"
                            >
                              Edit
                            </Link>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void duplicateChain(chain.id)}
                              className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-100 transition hover:border-indigo-500 disabled:opacity-60"
                            >
                              Duplicate
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void deleteChain(chain.id)}
                              className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/10 disabled:opacity-60"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-400">
              <span>
                {filtered.length} chain{filtered.length === 1 ? "" : "s"}
                {search ? ` matching "${search}"` : ""}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs transition hover:border-indigo-500 disabled:opacity-40"
                >
                  ← Prev
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                      p === currentPage
                        ? "border-indigo-500 bg-indigo-500/20 text-indigo-300"
                        : "border-gray-700 hover:border-indigo-500"
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs transition hover:border-indigo-500 disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
