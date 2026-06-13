'use client';

import {
  addEdge,
  Background,
  Controls,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';

import type { RunStepStatus } from '@/lib/types';

import { apiFetch } from '@/lib/client';
import { DEFAULT_CONDITION_CODE, DEFAULT_TRANSFORM_CODE, extractMethodFromCurl, getNodeType } from '@/lib/steps';
import type { Environment, Step, StepType } from '@/lib/types';

import { CurlNode } from './nodes/CurlNode';
import { ConditionNode } from './nodes/ConditionNode';
import { TransformNode } from './nodes/TransformNode';
import StepEditPanel from './StepEditPanel';

interface FlowEditorProps {
  chainId: string;
  initialNodes: Node[];
  initialEdges: Edge[];
  environments: Environment[];
  selectedEnvironmentId: string | null;
  onRunComplete: (runId: string) => void;
  onRun?: () => Promise<void>;
  onRunStep?: (stepId: string) => Promise<void>;
  running?: boolean;
  runStepStatuses?: Record<string, RunStepStatus>;
}

type FlowNodeData = {
  label: string;
  method?: string;
  cacheEnabled?: boolean;
  step: Step;
  executing?: boolean;
  runStatus?: RunStepStatus | null;
};

type FlowNode = Node<FlowNodeData>;

const nodeTypes = {
  curlNode: CurlNode,
  transformNode: TransformNode,
  conditionNode: ConditionNode,
};

function stepToNode(step: Step): FlowNode {
  return {
    id: step.id,
    type: getNodeType(step.type),
    position: { x: step.position_x, y: step.position_y },
    data: {
      label: step.name,
      method: extractMethodFromCurl(step.curl_template),
      cacheEnabled: step.cache_enabled === 1,
      step,
    },
  };
}

export default function FlowEditor({
  chainId,
  initialNodes,
  initialEdges,
  environments,
  selectedEnvironmentId,
  onRun,
  onRunStep,
  running = false,
  runStepStatuses,
}: FlowEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(initialNodes as FlowNode[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [graphStatus, setGraphStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [graphError, setGraphError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const didHydrate = useRef(false);

  useEffect(() => {
    setNodes(initialNodes as FlowNode[]);
    setEdges(initialEdges);
    didHydrate.current = false;
  }, [initialEdges, initialNodes, setEdges, setNodes]);

  // When a new run starts, clear all per-node statuses so old results don't linger.
  useEffect(() => {
    if (!running) return;
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        data: { ...node.data, executing: false, runStatus: null },
      })),
    );
  }, [running, setNodes]);

  useEffect(() => {
    if (!runStepStatuses) return;
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        data: {
          ...node.data,
          runStatus: runStepStatuses[node.id] ?? null,
          executing: runStepStatuses[node.id] === 'running',
        },
      })),
    );
  }, [runStepStatuses, setNodes]);

  useEffect(() => {
    if (!didHydrate.current) {
      didHydrate.current = true;
      return;
    }

    const timeout = window.setTimeout(async () => {
      setGraphStatus('saving');
      setGraphError(null);

      try {
        await apiFetch(`/api/chains/${chainId}/graph`, {
          method: 'PUT',
          body: JSON.stringify({
            nodes: nodes.map((node) => ({
              id: node.id,
              position: node.position,
            })),
            edges: edges.map((edge) => ({
              source: edge.source,
              target: edge.target,
              sourceHandle: edge.sourceHandle ?? null,
            })),
          }),
        });
        setGraphStatus('saved');
      } catch (error) {
        setGraphStatus('error');
        setGraphError(error instanceof Error ? error.message : 'Failed to save graph');
      }
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [chainId, edges, nodes]);

  const envVariables = useMemo(() => {
    const environment = environments.find((item) => item.id === selectedEnvironmentId);
    return environment ? Object.keys(environment.variables) : [];
  }, [environments, selectedEnvironmentId]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const selectedStep = selectedNode?.data.step ?? null;

  const availableStepRefs = useMemo(() => {
    const names = nodes
      .filter((node) => node.id !== selectedNodeId)
      .map((node) => node.data.step.name)
      .filter(Boolean);

    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }, [nodes, selectedNodeId]);

  const upsertNode = useCallback(
    (updatedStep: Step) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) => (node.id === updatedStep.id ? stepToNode(updatedStep) : node)),
      );
    },
    [setNodes],
  );

  const handleSaveStep = useCallback(
    async (
      stepId: string,
      updates: {
        name?: string;
        curl_template?: string;
        transform_code?: string;
        type?: StepType;
        cache_enabled?: number;
        cache_ttl?: number;
        position_x?: number;
        position_y?: number;
      },
    ) => {
      const updatedStep = await apiFetch<Step>(`/api/steps/${stepId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      upsertNode(updatedStep);
      return updatedStep;
    },
    [upsertNode],
  );

  const handleDeleteStep = useCallback(
    async (stepId: string) => {
      await apiFetch(`/api/steps/${stepId}`, { method: 'DELETE' });
      setNodes((currentNodes) => currentNodes.filter((node) => node.id !== stepId));
      setEdges((currentEdges) =>
        currentEdges.filter((edge) => edge.source !== stepId && edge.target !== stepId),
      );
      setSelectedNodeId((currentSelected) => (currentSelected === stepId ? null : currentSelected));
    },
    [setEdges, setNodes],
  );

  // Fired by React Flow when nodes are removed via keyboard (Delete/Backspace).
  // onNodesChange already updates local state; we just need to sync with the API.
  const handleNodesDelete = useCallback(
    async (deletedNodes: FlowNode[]) => {
      await Promise.all(
        deletedNodes.map((node) => apiFetch(`/api/steps/${node.id}`, { method: 'DELETE' })),
      );
      setSelectedNodeId((current) =>
        deletedNodes.some((n) => n.id === current) ? null : current,
      );
    },
    [],
  );

  const handleConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target || connection.source === connection.target) {
        return;
      }

      if (edges.some((edge) => edge.source === connection.source && edge.target === connection.target && edge.sourceHandle === connection.sourceHandle)) {
        return;
      }

      setBusy(true);
      setGraphError(null);

      try {
        await apiFetch(`/api/steps/${connection.target}/dependencies`, {
          method: 'POST',
          body: JSON.stringify({
            depends_on_step_id: connection.source,
            source_handle: connection.sourceHandle ?? null,
          }),
        });

        const edgeStyle =
          connection.sourceHandle === 'true'
            ? { stroke: '#22c55e' }
            : connection.sourceHandle === 'false'
              ? { stroke: '#ef4444' }
              : { stroke: '#6366f1' };

        const edgeLabel =
          connection.sourceHandle === 'true'
            ? 'true'
            : connection.sourceHandle === 'false'
              ? 'false'
              : undefined;

        setEdges((currentEdges) =>
          addEdge(
            {
              ...connection,
              id: `${connection.source}:${connection.sourceHandle ?? 'default'}->${connection.target}`,
              animated: true,
              style: edgeStyle,
              label: edgeLabel,
              labelStyle: { fill: edgeStyle.stroke, fontWeight: 600, fontSize: 11 },
              labelBgStyle: { fill: '#111827', fillOpacity: 0.85 },
            },
            currentEdges,
          ),
        );
      } catch (error) {
        setGraphStatus('error');
        setGraphError(error instanceof Error ? error.message : 'Failed to create dependency');
      } finally {
        setBusy(false);
      }
    },
    [edges, setEdges],
  );

  const handleEdgesDelete = useCallback(
    async (deletedEdges: Edge[]) => {
      if (deletedEdges.length === 0) {
        return;
      }

      setBusy(true);
      setGraphError(null);

      try {
        await Promise.all(
          deletedEdges
            .filter((edge) => edge.source && edge.target)
            .map((edge) =>
              apiFetch(`/api/steps/${edge.target}/dependencies`, {
                method: 'DELETE',
                body: JSON.stringify({ depends_on_step_id: edge.source }),
              }),
            ),
        );
      } catch (error) {
        setGraphStatus('error');
        setGraphError(error instanceof Error ? error.message : 'Failed to delete dependency');
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const handleNodeDragStop = useCallback(
    async (_event: ReactMouseEvent | globalThis.MouseEvent, node: FlowNode) => {
      const nextPosition = { x: node.position.x, y: node.position.y };
      setNodes((currentNodes) =>
        currentNodes.map((currentNode) =>
          currentNode.id === node.id
            ? {
                ...currentNode,
                position: nextPosition,
                data: {
                  ...currentNode.data,
                  step: {
                    ...currentNode.data.step,
                    position_x: nextPosition.x,
                    position_y: nextPosition.y,
                  },
                },
              }
            : currentNode,
        ),
      );

      try {
        await handleSaveStep(node.id, {
          position_x: nextPosition.x,
          position_y: nextPosition.y,
        });
      } catch (error) {
        setGraphStatus('error');
        setGraphError(error instanceof Error ? error.message : 'Failed to save node position');
      }
    },
    [handleSaveStep, setNodes],
  );

  const handleDuplicateStep = useCallback(
    async (stepId: string) => {
      const sourceNode = nodes.find((n) => n.id === stepId);
      if (!sourceNode) return;
      const source = sourceNode.data.step;

      setBusy(true);
      setGraphError(null);
      try {
        const duplicated = await apiFetch<Step>(`/api/chains/${chainId}/steps`, {
          method: 'POST',
          body: JSON.stringify({
            name: `${source.name} (copy)`,
            type: source.type,
            curl_template: source.curl_template,
            transform_code: source.transform_code,
            cache_enabled: source.cache_enabled,
            cache_ttl: source.cache_ttl,
            position_x: source.position_x + 40,
            position_y: source.position_y + 40,
          }),
        });
        setNodes((current) => [...current, stepToNode(duplicated)]);
        setSelectedNodeId(duplicated.id);
      } catch (error) {
        setGraphError(error instanceof Error ? error.message : 'Failed to duplicate step');
      } finally {
        setBusy(false);
      }
    },
    [chainId, nodes, setNodes],
  );

  const [curlModalOpen, setCurlModalOpen] = useState(false);
  const [curlModalName, setCurlModalName] = useState('');
  const [curlModalTemplate, setCurlModalTemplate] = useState('');
  const [curlModalError, setCurlModalError] = useState<string | null>(null);

  const openCurlModal = useCallback(() => {
    setCurlModalName('');
    setCurlModalTemplate('');
    setCurlModalError(null);
    setCurlModalOpen(true);
  }, []);

  const handleAddFromCurl = useCallback(async () => {
    if (!curlModalTemplate.trim()) {
      setCurlModalError('Paste a curl command first.');
      return;
    }

    setBusy(true);
    setCurlModalError(null);

    const position_x = 80 + (nodes.length % 4) * 220 + Math.round(Math.random() * 40);
    const position_y = 80 + Math.floor(nodes.length / 4) * 140 + Math.round(Math.random() * 40);

    try {
      const createdStep = await apiFetch<Step>(`/api/chains/${chainId}/steps`, {
        method: 'POST',
        body: JSON.stringify({
          name: curlModalName.trim() || `Step ${nodes.length + 1}`,
          type: 'curl',
          curl_template: curlModalTemplate.trim(),
          cache_enabled: 0,
          cache_ttl: 3600,
          position_x,
          position_y,
        }),
      });

      setNodes((currentNodes) => [...currentNodes, stepToNode(createdStep)]);
      setSelectedNodeId(createdStep.id);
      setCurlModalOpen(false);
    } catch (error) {
      setCurlModalError(error instanceof Error ? error.message : 'Failed to create step');
    } finally {
      setBusy(false);
    }
  }, [chainId, curlModalName, curlModalTemplate, nodes.length, setNodes]);

  const addStep = useCallback(
    async (type: StepType) => {
      setBusy(true);
      setGraphError(null);
      const position_x = 80 + (nodes.length % 4) * 220 + Math.round(Math.random() * 40);
      const position_y = 80 + Math.floor(nodes.length / 4) * 140 + Math.round(Math.random() * 40);

      try {
        const createdStep = await apiFetch<Step>(`/api/chains/${chainId}/steps`, {
          method: 'POST',
          body: JSON.stringify({
            name:
              type === 'transform'
                ? `Transform ${nodes.length + 1}`
                : type === 'condition'
                  ? `Condition ${nodes.length + 1}`
                  : `Step ${nodes.length + 1}`,
            type,
            curl_template: type === 'curl' ? 'curl https://api.example.com' : '',
            transform_code:
              type === 'transform'
                ? DEFAULT_TRANSFORM_CODE
                : type === 'condition'
                  ? DEFAULT_CONDITION_CODE
                  : '',
            cache_enabled: 0,
            cache_ttl: 3600,
            position_x,
            position_y,
          }),
        });

        setNodes((currentNodes) => [...currentNodes, stepToNode(createdStep)]);
        setSelectedNodeId(createdStep.id);
      } catch (error) {
        setGraphStatus('error');
        setGraphError(error instanceof Error ? error.message : 'Failed to create step');
      } finally {
        setBusy(false);
      }
    },
    [chainId, nodes.length, setNodes],
  );

  return (
    <div className="grid h-[72vh] grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] overflow-hidden rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl shadow-black/20">
      <div className="flex min-h-0 flex-col border-r border-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void addStep('curl')}
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Curl Step
            </button>
            <button
              type="button"
              onClick={() => void addStep('transform')}
              disabled={busy}
              className="rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Transform Step
            </button>
            <button
              type="button"
              onClick={() => void addStep('condition')}
              disabled={busy}
              className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Condition
            </button>
            <button
              type="button"
              onClick={openCurlModal}
              disabled={busy}
              className="rounded-lg border border-gray-600 px-3 py-2 text-sm font-medium text-gray-200 transition hover:border-indigo-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              From cURL…
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              {graphStatus === 'saving' && 'Saving graph…'}
              {graphStatus === 'saved' && 'Graph saved'}
              {graphStatus === 'error' && 'Graph save failed'}
            </span>
            {onRun && (
              <button
                type="button"
                onClick={() => void onRun()}
                disabled={running || busy}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {running ? '⏳ Running…' : '▶ Run Chain'}
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodesDelete={(deletedNodes) => void handleNodesDelete(deletedNodes as FlowNode[])}
            onConnect={(connection) => void handleConnect(connection)}
            onEdgesDelete={(deletedEdges) => void handleEdgesDelete(deletedEdges)}
            onNodeDragStop={(event, node) => void handleNodeDragStop(event, node as FlowNode)}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            fitView
            deleteKeyCode={['Backspace', 'Delete']}
            defaultEdgeOptions={{ animated: true, style: { stroke: '#6366f1' } }}
            className="bg-gray-950"
          >
            <Background color="#1f2937" gap={20} />
            <Controls />
          </ReactFlow>
        </div>
      </div>

      <div className="min-h-0 p-4">
        <StepEditPanel
          step={selectedStep}
          envVariables={envVariables}
          availableStepRefs={availableStepRefs}
          onSave={handleSaveStep}
          onDelete={handleDeleteStep}
          onDuplicate={handleDuplicateStep}
          onRunStep={onRunStep}
          running={running}
          busy={busy}
        />
        {graphError && <p className="mt-3 text-sm text-red-400">{graphError}</p>}
      </div>

      {curlModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
            <h2 className="mb-4 text-lg font-semibold text-white">Add step from cURL command</h2>

            <label className="mb-3 block space-y-1">
              <span className="text-sm font-medium text-gray-300">Step name (optional)</span>
              <input
                type="text"
                value={curlModalName}
                onChange={(e) => setCurlModalName(e.target.value)}
                placeholder="e.g. Get Token"
                className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none transition focus:border-indigo-500"
              />
            </label>

            <label className="mb-4 block space-y-1">
              <span className="text-sm font-medium text-gray-300">cURL command</span>
              <textarea
                rows={8}
                value={curlModalTemplate}
                onChange={(e) => setCurlModalTemplate(e.target.value)}
                placeholder={'curl -X POST https://api.example.com/token \\\n  -H "Content-Type: application/json" \\\n  -d \'{"user":"alice"}\''}
                className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 font-mono text-sm text-white outline-none transition focus:border-indigo-500"
              />
            </label>

            {curlModalError && (
              <p className="mb-3 text-sm text-red-400">{curlModalError}</p>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCurlModalOpen(false)}
                className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 transition hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleAddFromCurl()}
                disabled={busy}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
              >
                {busy ? 'Adding…' : 'Add Step'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
