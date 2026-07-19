'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { apiFetch } from '@/lib/client';
import { methodColor } from '@/lib/formatters';
import type { ChainDetail, TreeNode } from '@/lib/types';

interface DragPayload {
  kind: 'folder' | 'chain';
  id: string;
}

function nodeMatchesSearch(node: TreeNode, trimmedSearch: string): boolean {
  if (!trimmedSearch) return true;
  if (node.type === 'chain') return node.name.toLowerCase().includes(trimmedSearch);
  return (node.children ?? []).some((child) => nodeMatchesSearch(child, trimmedSearch));
}

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null | 'root'>(null);
  const [busy, setBusy] = useState(false);

  const activeChainId = pathname?.startsWith('/chains/') ? pathname.split('/')[2] : null;

  const loadTree = useCallback(async () => {
    try {
      const data = await apiFetch<TreeNode[]>('/api/tree');
      setTree(data);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load tree');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const run = async () => {
      await loadTree();
    };
    void run();
  }, [loadTree]);

  // Close any open row menu on outside click.
  useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openMenuId]);

  const trimmedSearch = search.trim().toLowerCase();

  // When searching, figure out which folder ids contain a match so we can auto-expand them.
  const autoExpandIds = useMemo(() => {
    if (!trimmedSearch) return null;
    const ids = new Set<string>();

    const matches = (node: TreeNode): boolean => {
      const selfMatch = node.type === 'chain' && node.name.toLowerCase().includes(trimmedSearch);
      const childMatch = (node.children ?? []).some((child) => matches(child));
      if ((selfMatch || childMatch) && node.type === 'folder') {
        ids.add(node.id);
      }
      return selfMatch || childMatch;
    };

    tree.forEach((node) => matches(node));
    return ids;
  }, [tree, trimmedSearch]);

  const toggleExpanded = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isExpanded = (id: string) => (autoExpandIds ? autoExpandIds.has(id) : expanded.has(id));

  const createRequest = async () => {
    const name = window.prompt('Request name', 'New Request');
    if (!name) return;
    setBusy(true);
    try {
      const chain = await apiFetch<ChainDetail>('/api/chains', {
        method: 'POST',
        body: JSON.stringify({ name, mode: 'simple' }),
      });
      await apiFetch('/api/chains/' + chain.id + '/steps', {
        method: 'POST',
        body: JSON.stringify({ name: 'Request', type: 'curl', curl_template: "curl -X GET ''" }),
      });
      await loadTree();
      router.push(`/chains/${chain.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create request');
    } finally {
      setBusy(false);
    }
  };

  const createChain = async () => {
    const name = window.prompt('Chain name', 'New Chain');
    if (!name) return;
    setBusy(true);
    try {
      const chain = await apiFetch<ChainDetail>('/api/chains', {
        method: 'POST',
        body: JSON.stringify({ name, mode: 'chain' }),
      });
      await loadTree();
      router.push(`/chains/${chain.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create chain');
    } finally {
      setBusy(false);
    }
  };

  const createFolder = async () => {
    const name = window.prompt('Folder name', 'New Folder');
    if (!name) return;
    setBusy(true);
    try {
      await apiFetch('/api/folders', {
        method: 'POST',
        body: JSON.stringify({ name, parent_id: null }),
      });
      await loadTree();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create folder');
    } finally {
      setBusy(false);
    }
  };

  const renameChain = async (id: string, currentName: string) => {
    const name = window.prompt('Rename request', currentName);
    if (!name || name === currentName) return;
    await apiFetch(`/api/chains/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
    await loadTree();
  };

  const renameFolder = async (id: string, currentName: string) => {
    const name = window.prompt('Rename folder', currentName);
    if (!name || name === currentName) return;
    await apiFetch(`/api/folders/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
    await loadTree();
  };

  const deleteChainRow = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    await apiFetch(`/api/chains/${id}`, { method: 'DELETE' });
    if (activeChainId === id) router.push('/chains');
    await loadTree();
  };

  const deleteFolderRow = async (node: TreeNode) => {
    const childCount = (node.children ?? []).filter((c) => c.type === 'chain').length;
    const message =
      childCount > 0
        ? `Delete "${node.name}"? ${childCount} request${childCount === 1 ? '' : 's'} will move to root.`
        : `Delete "${node.name}"?`;
    if (!window.confirm(message)) return;
    await apiFetch(`/api/folders/${node.id}`, { method: 'DELETE' });
    await loadTree();
  };

  const duplicateChainRow = async (id: string) => {
    setBusy(true);
    try {
      await apiFetch(`/api/chains/${id}/duplicate`, { method: 'POST' });
      await loadTree();
    } catch (dupError) {
      setError(dupError instanceof Error ? dupError.message : 'Failed to duplicate');
    } finally {
      setBusy(false);
    }
  };

  const moveChain = async (id: string, folderId: string | null) => {
    await apiFetch(`/api/chains/${id}`, { method: 'PUT', body: JSON.stringify({ folder_id: folderId }) });
    await loadTree();
  };

  const moveFolder = async (id: string, parentId: string | null) => {
    if (id === parentId) return;
    await apiFetch(`/api/folders/${id}`, { method: 'PUT', body: JSON.stringify({ parent_id: parentId }) });
    await loadTree();
  };

  const handleDrop = async (target: string | null) => {
    setDropTargetId(null);
    const raw = dragDataRef.current;
    dragDataRef.current = null;
    if (!raw) return;

    if (raw.kind === 'chain') {
      await moveChain(raw.id, target);
    } else {
      await moveFolder(raw.id, target);
    }
  };

  const dragDataRef = useRef<DragPayload | null>(null);

  const startDrag = (payload: DragPayload) => (event: React.DragEvent) => {
    dragDataRef.current = payload;
    event.dataTransfer.effectAllowed = 'move';
  };

  const filterVisible = useCallback(
    (node: TreeNode): boolean => nodeMatchesSearch(node, trimmedSearch),
    [trimmedSearch],
  );

  return (
    <div className="flex h-full flex-col border-r border-gray-800 bg-gray-950/60">
      <div className="space-y-3 border-b border-gray-800 p-3">
        <input
          type="search"
          placeholder="Search requests…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs text-gray-100 outline-none focus:border-indigo-500"
        />
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => void createFolder()}
            className="flex-1 rounded-lg border border-gray-700 px-2 py-1.5 text-xs text-gray-200 transition hover:border-indigo-500 disabled:opacity-50"
          >
            + Folder
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void createRequest()}
            className="flex-1 rounded-lg border border-gray-700 px-2 py-1.5 text-xs text-gray-200 transition hover:border-indigo-500 disabled:opacity-50"
          >
            + Request
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void createChain()}
            className="flex-1 rounded-lg border border-gray-700 px-2 py-1.5 text-xs text-gray-200 transition hover:border-indigo-500 disabled:opacity-50"
          >
            + Chain
          </button>
        </div>
      </div>

      <div
        className={`flex-1 overflow-y-auto p-2 text-sm ${dropTargetId === 'root' ? 'bg-indigo-950/30' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDropTargetId('root');
        }}
        onDragLeave={() => setDropTargetId((current) => (current === 'root' ? null : current))}
        onDrop={(e) => {
          e.preventDefault();
          void handleDrop(null);
        }}
      >
        {loading ? (
          <p className="p-2 text-xs text-gray-500">Loading…</p>
        ) : error ? (
          <p className="p-2 text-xs text-red-400">{error}</p>
        ) : tree.length === 0 ? (
          <p className="p-2 text-xs text-gray-500">Nothing here yet. Create a request or chain to get started.</p>
        ) : (
          tree
            .filter(filterVisible)
            .map((node) => (
              <TreeRow
                key={node.id}
                node={node}
                depth={0}
                activeChainId={activeChainId}
                trimmedSearch={trimmedSearch}
                isExpanded={isExpanded}
                onToggle={toggleExpanded}
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
                dropTargetId={dropTargetId}
                setDropTargetId={setDropTargetId}
                startDrag={startDrag}
                handleDrop={handleDrop}
                filterVisible={filterVisible}
                onRenameChain={renameChain}
                onRenameFolder={renameFolder}
                onDeleteChain={deleteChainRow}
                onDeleteFolder={deleteFolderRow}
                onDuplicateChain={duplicateChainRow}
              />
            ))
        )}
      </div>
    </div>
  );
}

interface TreeRowProps {
  node: TreeNode;
  depth: number;
  activeChainId: string | null;
  trimmedSearch: string;
  isExpanded: (id: string) => boolean;
  onToggle: (id: string) => void;
  openMenuId: string | null;
  setOpenMenuId: (id: string | null) => void;
  dropTargetId: string | null | 'root';
  setDropTargetId: (id: string | null | 'root') => void;
  startDrag: (payload: DragPayload) => (event: React.DragEvent) => void;
  handleDrop: (target: string | null) => Promise<void>;
  filterVisible: (node: TreeNode) => boolean;
  onRenameChain: (id: string, name: string) => Promise<void>;
  onRenameFolder: (id: string, name: string) => Promise<void>;
  onDeleteChain: (id: string, name: string) => Promise<void>;
  onDeleteFolder: (node: TreeNode) => Promise<void>;
  onDuplicateChain: (id: string) => Promise<void>;
}

function TreeRow({
  node,
  depth,
  activeChainId,
  trimmedSearch,
  isExpanded,
  onToggle,
  openMenuId,
  setOpenMenuId,
  dropTargetId,
  setDropTargetId,
  startDrag,
  handleDrop,
  filterVisible,
  onRenameChain,
  onRenameFolder,
  onDeleteChain,
  onDeleteFolder,
  onDuplicateChain,
}: TreeRowProps) {
  const indent = { paddingLeft: `${depth * 14 + 8}px` };
  const menuOpen = openMenuId === node.id;
  const dimmed = trimmedSearch && node.type === 'chain' && !node.name.toLowerCase().includes(trimmedSearch);

  if (node.type === 'folder') {
    const expanded = isExpanded(node.id);
    const isDropTarget = dropTargetId === node.id;

    return (
      <div>
        <div
          draggable
          onDragStart={startDrag({ kind: 'folder', id: node.id })}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDropTargetId(node.id);
          }}
          onDragLeave={() => { if (dropTargetId === node.id) setDropTargetId(null); }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void handleDrop(node.id);
          }}
          style={indent}
          className={`group flex items-center gap-1.5 rounded-lg py-1.5 pr-1.5 transition ${isDropTarget ? 'bg-indigo-950/50' : 'hover:bg-gray-900'}`}
        >
          <button type="button" onClick={() => onToggle(node.id)} className="text-xs text-gray-500 hover:text-gray-300">
            {expanded ? '▾' : '▸'}
          </button>
          <span className="text-sm">📁</span>
          <button type="button" onClick={() => onToggle(node.id)} className="flex-1 truncate text-left text-gray-200">
            {node.name}
          </button>
          <RowMenu
            open={menuOpen}
            onOpen={() => setOpenMenuId(menuOpen ? null : node.id)}
            items={[
              { label: 'Rename', onClick: () => void onRenameFolder(node.id, node.name) },
              { label: 'Delete', onClick: () => void onDeleteFolder(node), danger: true },
            ]}
          />
        </div>
        {expanded && (
          <div>
            {(node.children ?? [])
              .filter(filterVisible)
              .map((child) => (
                <TreeRow
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  activeChainId={activeChainId}
                  trimmedSearch={trimmedSearch}
                  isExpanded={isExpanded}
                  onToggle={onToggle}
                  openMenuId={openMenuId}
                  setOpenMenuId={setOpenMenuId}
                  dropTargetId={dropTargetId}
                  setDropTargetId={setDropTargetId}
                  startDrag={startDrag}
                  handleDrop={handleDrop}
                  filterVisible={filterVisible}
                  onRenameChain={onRenameChain}
                  onRenameFolder={onRenameFolder}
                  onDeleteChain={onDeleteChain}
                  onDeleteFolder={onDeleteFolder}
                  onDuplicateChain={onDuplicateChain}
                />
              ))}
          </div>
        )}
      </div>
    );
  }

  const active = activeChainId === node.id;

  return (
    <div
      draggable
      onDragStart={startDrag({ kind: 'chain', id: node.id })}
      style={indent}
      className={`group flex items-center gap-1.5 rounded-lg py-1.5 pr-1.5 transition ${active ? 'bg-indigo-600/20' : 'hover:bg-gray-900'} ${dimmed ? 'opacity-40' : ''}`}
    >
      <Link href={`/chains/${node.id}`} className="flex min-w-0 flex-1 items-center gap-1.5">
        {node.mode === 'chain' ? (
          <span className="shrink-0 text-xs" title="Chain">🔗</span>
        ) : (
          <span className={`shrink-0 rounded px-1 py-0.5 font-mono text-[10px] ${methodColor(node.method ?? 'GET')}`}>
            {node.method ?? 'GET'}
          </span>
        )}
        <span className={`truncate text-sm ${active ? 'text-indigo-200' : 'text-gray-300'}`}>{node.name}</span>
      </Link>
      <RowMenu
        open={menuOpen}
        onOpen={() => setOpenMenuId(menuOpen ? null : node.id)}
        items={[
          { label: 'Rename', onClick: () => void onRenameChain(node.id, node.name) },
          { label: 'Duplicate', onClick: () => void onDuplicateChain(node.id) },
          { label: 'Delete', onClick: () => void onDeleteChain(node.id, node.name), danger: true },
        ]}
      />
    </div>
  );
}

function RowMenu({
  open,
  onOpen,
  items,
}: {
  open: boolean;
  onOpen: () => void;
  items: { label: string; onClick: () => void; danger?: boolean }[];
}) {
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onOpen();
        }}
        className="rounded px-1 text-xs text-gray-600 opacity-0 transition hover:bg-gray-800 hover:text-gray-300 group-hover:opacity-100"
      >
        ⋯
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-6 z-10 w-32 rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-xl"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              className={`block w-full px-3 py-1.5 text-left text-xs transition hover:bg-gray-800 ${item.danger ? 'text-red-300' : 'text-gray-200'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
