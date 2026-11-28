import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Crosshair,
  Hand,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  X,
} from 'lucide-react';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  buildConnectorPath,
  FLOW_EDGES,
  FLOW_NODES,
  FLOW_SECTIONS,
  FlowLaneId,
  FlowNodeSpec,
  FlowTone,
  getPortPoint,
  MAX_ZOOM,
  MIN_ZOOM,
  MiniPreviewKind,
} from './endToEndFlowsModel';

function toneCssColor(tone: FlowTone): string {
  switch (tone) {
    case 'mint':
      return 'var(--color-accent-primary)';
    case 'copper':
      return 'var(--color-coach-accent)';
    case 'amber':
      return 'var(--color-status-warning)';
    case 'info':
    default:
      return 'var(--color-status-info)';
  }
}

function toneSoftBg(tone: FlowTone): string {
  switch (tone) {
    case 'mint':
      return 'var(--color-status-positive-soft)';
    case 'copper':
      return 'rgb(var(--color-coach-accent-rgb) / 0.16)';
    case 'amber':
      return 'var(--color-status-warning-soft)';
    case 'info':
    default:
      return 'var(--color-status-info-soft)';
  }
}

/** Miniature realistic UI screen schematic inside each Figma node frame. */
const NodeMiniWireframe: React.FC<{ kind: MiniPreviewKind; tone: FlowTone }> = ({ kind, tone }) => {
  const accent = toneCssColor(tone);
  if (kind === 'set-table') {
    return (
      <div
        className="rounded-[var(--radius-inset)] p-2 space-y-1"
        style={{ background: 'var(--color-bg-canvas)', border: '1px solid var(--color-border-subtle)' }}
      >
        <div className="flex items-center justify-between">
          <span className="wk-caption">SET · PREV · KG · REPS · RIR</span>
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ background: 'var(--color-accent-primary)' }}
          />
        </div>
        <div className="grid grid-cols-5 gap-1">
          <span className="h-2 rounded-[var(--radius-badge)]" style={{ background: 'var(--color-bg-surface-raised)' }} />
          <span className="h-2 rounded-[var(--radius-badge)]" style={{ background: 'var(--color-bg-surface-raised)' }} />
          <span className="h-2 rounded-[var(--radius-badge)]" style={{ background: 'var(--color-text-primary)', opacity: 0.85 }} />
          <span className="h-2 rounded-[var(--radius-badge)]" style={{ background: 'var(--color-text-primary)', opacity: 0.85 }} />
          <span className="h-2 rounded-[var(--radius-badge)]" style={{ background: 'var(--color-status-positive-soft)' }} />
        </div>
      </div>
    );
  }

  if (kind === 'goal-ring' || kind === 'sphere-plan') {
    return (
      <div
        className="rounded-[var(--radius-inset)] p-2 flex items-center gap-3"
        style={{ background: 'var(--color-bg-canvas)', border: '1px solid var(--color-border-subtle)' }}
      >
        <span
          className="w-7 h-7 rounded-full shrink-0 inline-flex items-center justify-center"
          style={{ border: `2px solid ${accent}` }}
        >
          <span className="w-2 h-2 rounded-full" style={{ background: accent }} />
        </span>
        <div className="flex-1 space-y-1">
          <div className="h-2 w-3/4 rounded-[var(--radius-badge)]" style={{ background: 'var(--color-text-primary)', opacity: 0.8 }} />
          <div className="h-2 w-1/2 rounded-[var(--radius-badge)]" style={{ background: 'var(--color-bg-surface-raised)' }} />
        </div>
      </div>
    );
  }

  if (kind === 'swap-card' || kind === 'coach-diff') {
    return (
      <div
        className="rounded-[var(--radius-inset)] p-2 flex items-center justify-between gap-2"
        style={{ background: 'var(--color-bg-canvas)', border: `1px solid ${accent}` }}
      >
        <span className="h-2 w-2/5 rounded-[var(--radius-badge)]" style={{ background: 'var(--color-bg-surface-raised)' }} />
        <ArrowRight className="w-3 h-3 shrink-0" style={{ color: accent }} aria-hidden="true" />
        <span className="h-2 w-2/5 rounded-[var(--radius-badge)]" style={{ background: accent }} />
      </div>
    );
  }

  if (kind === 'detail-chart' || kind === 'volume-bars' || kind === 'radar-balance') {
    return (
      <div
        className="rounded-[var(--radius-inset)] p-2 flex items-end gap-1 h-9"
        style={{ background: 'var(--color-bg-canvas)', border: '1px solid var(--color-border-subtle)' }}
      >
        {[40, 58, 52, 74, 88, 100].map((pct, idx) => (
          <span
            key={idx}
            className="flex-1 rounded-[var(--radius-badge)]"
            style={{
              height: `${pct}%`,
              background: idx >= 4 ? accent : 'var(--color-bg-surface-raised)',
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className="rounded-[var(--radius-inset)] p-2 flex items-center justify-between gap-2"
      style={{ background: 'var(--color-bg-canvas)', border: '1px solid var(--color-border-subtle)' }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} />
        <span className="h-2 w-20 rounded-[var(--radius-badge)]" style={{ background: 'var(--color-text-primary)', opacity: 0.78 }} />
      </div>
      <span
        className="px-2 py-1 rounded-[var(--radius-badge)]"
        style={{ background: toneSoftBg(tone) }}
      >
        <span className="block w-6 h-1 rounded-full" style={{ background: accent }} />
      </span>
    </div>
  );
};

export const EndToEndFlowsBoard: React.FC = () => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    active: boolean;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originPanX: number;
    originPanY: number;
    moved: boolean;
  } | null>(null);

  const [zoom, setZoom] = useState<number>(0.52);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 32, y: 24 });
  const [isDragging, setIsDragging] = useState(false);
  const [activeLaneFilter, setActiveLaneFilter] = useState<FlowLaneId | 'all'>('all');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('n-2-logging');
  const [showMinimap, setShowMinimap] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const nodeById = useMemo(() => {
    const map = new Map<string, FlowNodeSpec>();
    for (const n of FLOW_NODES) map.set(n.id, n);
    return map;
  }, []);

  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null;

  const connectedSummary = useMemo(() => {
    if (!selectedNode) return { incoming: [] as FlowNodeSpec[], outgoing: [] as FlowNodeSpec[] };
    const incoming = FLOW_EDGES.filter((e) => e.to === selectedNode.id)
      .map((e) => nodeById.get(e.from))
      .filter((n): n is FlowNodeSpec => Boolean(n));
    const outgoing = FLOW_EDGES.filter((e) => e.from === selectedNode.id)
      .map((e) => nodeById.get(e.to))
      .filter((n): n is FlowNodeSpec => Boolean(n));
    return { incoming, outgoing };
  }, [selectedNode, nodeById]);

  const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(z * 100) / 100));

  const fitEntireBoard = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) {
      setZoom(0.45);
      setPan({ x: 24, y: 20 });
      return;
    }
    const rect = vp.getBoundingClientRect();
    const usableW = Math.max(320, rect.width - (selectedNodeId ? 360 : 48));
    const usableH = Math.max(320, rect.height - 120);
    const nextZoom = clampZoom(Math.min(usableW / BOARD_WIDTH, usableH / BOARD_HEIGHT));
    const centeredX = Math.round((usableW - BOARD_WIDTH * nextZoom) / 2) + 16;
    const centeredY = Math.max(56, Math.round((rect.height - BOARD_HEIGHT * nextZoom) / 2));
    setZoom(nextZoom);
    setPan({ x: centeredX, y: centeredY });
  }, [selectedNodeId]);

  const focusSection = useCallback(
    (laneId: FlowLaneId) => {
      const sec = FLOW_SECTIONS.find((s) => s.id === laneId);
      const vp = viewportRef.current;
      if (!sec || !vp) return;
      const rect = vp.getBoundingClientRect();
      const usableW = Math.max(320, rect.width - (selectedNodeId ? 368 : 48));
      const targetZoom = clampZoom(Math.min(0.85, (usableW - 48) / sec.width));
      const nextX = Math.round(24 - sec.x * targetZoom);
      const nextY = Math.round(Math.max(68, (rect.height - sec.height * targetZoom) / 2) - sec.y * targetZoom);
      setZoom(targetZoom);
      setPan({ x: nextX, y: nextY });
    },
    [selectedNodeId]
  );

  const focusNode = useCallback((node: FlowNodeSpec) => {
    const vp = viewportRef.current;
    setSelectedNodeId(node.id);
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const usableW = Math.max(320, rect.width - 368);
    const targetZoom = clampZoom(Math.max(zoom, 0.78));
    const centerX = node.x + node.width / 2;
    const centerY = node.y + node.height / 2;
    setZoom(targetZoom);
    setPan({
      x: Math.round(usableW / 2 - centerX * targetZoom),
      y: Math.round(rect.height / 2 - centerY * targetZoom),
    });
  }, [zoom]);

  const zoomAtViewportCenter = useCallback(
    (delta: number, resetToOne = false) => {
      const vp = viewportRef.current;
      const nextZoom = resetToOne ? 1 : clampZoom(zoom + delta);
      if (!vp || nextZoom === zoom) {
        if (resetToOne) setZoom(1);
        return;
      }
      const rect = vp.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const scaleRatio = nextZoom / zoom;
      setPan((prev) => ({
        x: Math.round(cx - (cx - prev.x) * scaleRatio),
        y: Math.round(cy - (cy - prev.y) * scaleRatio),
      }));
      setZoom(nextZoom);
    },
    [zoom]
  );

  // Native non-passive wheel listener for smooth Figma cursor-anchored zoom + two-finger pan
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      // Trackpad pinch (ctrlKey/metaKey) OR vertical mouse wheel zooms around cursor;
      // pure horizontal trackpad swipe pans horizontally.
      if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.2) {
        setPan((prev) => ({
          x: Math.round(prev.x - e.deltaX),
          y: Math.round(prev.y - e.deltaY),
        }));
        return;
      }

      const factor = e.ctrlKey || e.metaKey ? -e.deltaY * 0.008 : -e.deltaY * 0.0016;
      setZoom((prevZoom) => {
        const nextZoom = clampZoom(prevZoom * (1 + Math.max(-0.28, Math.min(0.28, factor))));
        if (nextZoom === prevZoom) return prevZoom;
        const ratio = nextZoom / prevZoom;
        setPan((prevPan) => ({
          x: Math.round(cursorX - (cursorX - prevPan.x) * ratio),
          y: Math.round(cursorY - (cursorY - prevPan.y) * ratio),
        }));
        return nextZoom;
      });
    };

    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-flow-ui-overlay="true"]')) return;
    if (e.button !== 0 && e.button !== 1) return;

    dragStateRef.current = {
      active: true,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originPanX: pan.x,
      originPanY: pan.y,
      moved: false,
    };
    setIsDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragStateRef.current;
    if (!st || !st.active) return;
    const dx = e.clientX - st.startClientX;
    const dy = e.clientY - st.startClientY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      st.moved = true;
    }
    setPan({
      x: Math.round(st.originPanX + dx),
      y: Math.round(st.originPanY + dy),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragStateRef.current;
    if (!st) return;
    const wasClickWithoutDrag = !st.moved;
    dragStateRef.current = null;
    setIsDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);

    if (wasClickWithoutDrag) {
      const target = e.target as HTMLElement;
      const nodeEl = target.closest('[data-flow-node-id]') as HTMLElement | null;
      if (nodeEl) {
        const nid = nodeEl.getAttribute('data-flow-node-id');
        if (nid) setSelectedNodeId(nid);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const panStep = 64;
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomAtViewportCenter(0.12);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomAtViewportCenter(-0.12);
    } else if (e.key === '0') {
      e.preventDefault();
      zoomAtViewportCenter(0, true);
    } else if (e.key === '1') {
      e.preventDefault();
      fitEntireBoard();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setPan((p) => ({ x: p.x + panStep, y: p.y }));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setPan((p) => ({ x: p.x - panStep, y: p.y }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setPan((p) => ({ x: p.x, y: p.y + panStep }));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setPan((p) => ({ x: p.x, y: p.y - panStep }));
    }
  };

  const handleMinimapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const svgRect = e.currentTarget.getBoundingClientRect();
    const clickRatioX = (e.clientX - svgRect.left) / svgRect.width;
    const clickRatioY = (e.clientY - svgRect.top) / svgRect.height;
    const worldX = clickRatioX * BOARD_WIDTH;
    const worldY = clickRatioY * BOARD_HEIGHT;
    const vpRect = vp.getBoundingClientRect();
    setPan({
      x: Math.round(vpRect.width / 2 - worldX * zoom),
      y: Math.round(vpRect.height / 2 - worldY * zoom),
    });
  };

  const gridSpacing = Math.max(12, Math.round(24 * zoom));
  const zoomPct = Math.round(zoom * 100);

  return (
    <section
      id="flows"
      aria-label="End-to-end product flows Figma canvas"
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 flex flex-col'
          : 'w-full flex flex-col'
      }
      style={{
        background: 'var(--color-bg-canvas)',
        height: isFullscreen ? '100vh' : 'calc(100vh - 108px)',
        minHeight: '680px',
      }}
    >
      {/* Interactive Figma Canvas Viewport */}
      <div
        ref={viewportRef}
        tabIndex={0}
        role="application"
        aria-label="Interactive end-to-end user flow board. Drag to pan, scroll or pinch to zoom, click any screen frame to inspect."
        data-flow-viewport="true"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        className="relative flex-1 w-full overflow-hidden outline-none select-none"
        style={{
          cursor: isDragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          backgroundColor: 'var(--color-bg-canvas)',
          backgroundImage: 'radial-gradient(circle, rgba(224, 234, 242, 0.16) 1px, transparent 1px)',
          backgroundSize: `${gridSpacing}px ${gridSpacing}px`,
          backgroundPosition: `${pan.x % gridSpacing}px ${pan.y % gridSpacing}px`,
        }}
      >
        {/* Top Floating Flow-Lane Jump & Path Filter Bar */}
        <div
          data-flow-ui-overlay="true"
          className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none"
        >
          <div
            className="pointer-events-auto flex items-center gap-1 p-1 rounded-[var(--radius-tray)] overflow-x-auto no-scrollbar max-w-full"
            style={{
              background: 'rgb(var(--color-bg-surface-rgb) / 0.92)',
              border: '1px solid var(--color-border-strong)',
              boxShadow: 'var(--shadow-floating-bar)',
              backdropFilter: 'blur(16px)',
            }}
          >
            <button
              type="button"
              data-flow-filter="all"
              onClick={() => {
                setActiveLaneFilter('all');
                fitEntireBoard();
              }}
              className={`wk-segment px-3 min-h-[44px] shrink-0 ${activeLaneFilter === 'all' ? 'is-active' : ''}`}
              style={{
                borderRadius: 'var(--radius-control)',
                background: activeLaneFilter === 'all' ? 'var(--color-action-secondary-bg)' : 'transparent',
                color: activeLaneFilter === 'all' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              }}
            >
              All 6 flows ({FLOW_NODES.length} screens)
            </button>

            {FLOW_SECTIONS.map((sec) => {
              const active = activeLaneFilter === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  data-flow-jump={sec.id}
                  data-sec-x={sec.x}
                  data-sec-y={sec.y}
                  data-sec-w={sec.width}
                  data-sec-h={sec.height}
                  onClick={() => {
                    setActiveLaneFilter(sec.id);
                    focusSection(sec.id);
                  }}
                  className={`wk-segment px-3 min-h-[44px] shrink-0 inline-flex items-center gap-2 ${active ? 'is-active' : ''}`}
                  style={{
                    borderRadius: 'var(--radius-control)',
                    background: active ? 'var(--color-action-secondary-bg)' : 'transparent',
                    color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: toneCssColor(sec.tone) }}
                    aria-hidden="true"
                  />
                  <span>{sec.code.replace('FLOW ', '')} · {sec.id === 'onboarding' ? 'Onboarding' : sec.id === 'workout' ? 'Workout' : sec.id === 'program' ? 'Program' : sec.id === 'coach' ? 'AI Coach' : sec.id === 'progress' ? 'Progress' : 'Wearables & Data'}</span>
                </button>
              );
            })}
          </div>

          <div
            className="pointer-events-auto hidden xl:flex items-center gap-2 px-3 py-2 rounded-[var(--radius-control)]"
            style={{
              background: 'rgb(var(--color-bg-surface-rgb) / 0.90)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <Hand className="w-4 h-4" style={{ color: 'var(--color-accent-primary)' }} aria-hidden="true" />
            <span className="wk-caption" style={{ color: 'var(--color-text-secondary)' }}>
              Drag canvas to pan · Scroll/pinch to zoom · Click frame for specs
            </span>
          </div>
        </div>

        {/* Transformed Infinite Figma Artboard Stage */}
        <div
          data-flow-stage="true"
          style={{
            width: `${BOARD_WIDTH}px`,
            height: `${BOARD_HEIGHT}px`,
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
            transformOrigin: '0 0',
            willChange: 'transform',
            position: 'relative',
          }}
        >
          {/* 1. Figma Section Swimlane Containers */}
          {FLOW_SECTIONS.map((sec) => {
            const dimmed = activeLaneFilter !== 'all' && activeLaneFilter !== sec.id;
            const accent = toneCssColor(sec.tone);
            return (
              <div
                key={sec.id}
                data-flow-section={sec.id}
                style={{
                  position: 'absolute',
                  left: `${sec.x}px`,
                  top: `${sec.y}px`,
                  width: `${sec.width}px`,
                  height: `${sec.height}px`,
                  borderRadius: 'var(--radius-card)',
                  background: 'rgb(var(--color-bg-surface-rgb) / 0.34)',
                  border: `1px solid ${activeLaneFilter === sec.id ? accent : 'var(--color-border-strong)'}`,
                  opacity: dimmed ? 0.32 : 1,
                  transition: 'opacity 180ms ease, border-color 180ms ease',
                }}
              >
                {/* Figma Section Header Pill */}
                <div
                  className="flex items-center justify-between gap-4 px-5 py-3 border-b"
                  style={{
                    borderColor: 'var(--color-border-subtle)',
                    background: 'rgb(var(--color-bg-surface-rgb) / 0.65)',
                    borderTopLeftRadius: 'var(--radius-card)',
                    borderTopRightRadius: 'var(--radius-card)',
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="wk-pill"
                      style={{
                        background: toneSoftBg(sec.tone),
                        color: accent,
                      }}
                    >
                      {sec.code}
                    </span>
                    <h3 className="wk-title truncate">{sec.title}</h3>
                  </div>
                  <span className="wk-caption shrink-0">{sec.subtitle}</span>
                </div>
              </div>
            );
          })}

          {/* 2. SVG Orthogonal / Cubic Bezier Connectors & Arrowheads */}
          <svg
            width={BOARD_WIDTH}
            height={BOARD_HEIGHT}
            viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
            className="absolute inset-0 pointer-events-none"
            aria-hidden="true"
          >
            <defs>
              {(['info', 'mint', 'copper', 'amber'] as const).map((tone) => (
                <marker
                  key={tone}
                  id={`flow-arrow-${tone}`}
                  viewBox="0 0 12 12"
                  refX="10"
                  refY="6"
                  markerWidth="8"
                  markerHeight="8"
                  orient="auto-start-reverse"
                >
                  <path d="M 1 2 L 10 6 L 1 10 z" fill={toneCssColor(tone)} />
                </marker>
              ))}
            </defs>

            {FLOW_EDGES.map((edge) => {
              const fromNode = nodeById.get(edge.from);
              const toNode = nodeById.get(edge.to);
              if (!fromNode || !toNode) return null;

              const p1 = getPortPoint(fromNode, edge.fromPort);
              const p2 = getPortPoint(toNode, edge.toPort);
              const { d, midX, midY } = buildConnectorPath(p1, edge.fromPort, p2, edge.toPort);

              const isSelectedEdge =
                selectedNodeId != null && (edge.from === selectedNodeId || edge.to === selectedNodeId);
              const dimmed =
                activeLaneFilter !== 'all' &&
                edge.laneId !== activeLaneFilter &&
                fromNode.laneId !== activeLaneFilter &&
                toNode.laneId !== activeLaneFilter;
              const strokeColor = toneCssColor(edge.tone);

              return (
                <g
                  key={edge.id}
                  data-flow-edge={edge.laneId}
                  style={{ opacity: dimmed ? 0.18 : 1, transition: 'opacity 180ms ease' }}
                >
                  {isSelectedEdge && (
                    <path
                      d={d}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={7}
                      strokeOpacity={0.22}
                      strokeLinecap="round"
                    />
                  )}
                  <path
                    d={d}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={isSelectedEdge ? 3 : 2}
                    strokeOpacity={isSelectedEdge ? 1 : 0.78}
                    strokeDasharray={edge.dashed ? '8 6' : undefined}
                    markerEnd={`url(#flow-arrow-${edge.tone})`}
                  />
                  <circle cx={p1.x} cy={p1.y} r={4} fill={strokeColor} />

                  {edge.label && (
                    <g transform={`translate(${midX}, ${midY})`}>
                      <rect
                        x={-68}
                        y={-12}
                        width={136}
                        height={24}
                        rx={12}
                        fill="var(--color-bg-canvas)"
                        stroke={isSelectedEdge ? strokeColor : 'var(--color-border-strong)'}
                        strokeWidth={1}
                      />
                      <text
                        x={0}
                        y={4}
                        textAnchor="middle"
                        fill="var(--color-text-secondary)"
                        style={{
                          fontFamily: 'Inter, sans-serif',
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                      >
                        {edge.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>

          {/* 3. Figma Screen Frame Nodes */}
          {FLOW_NODES.map((node) => {
            const isSelected = selectedNodeId === node.id;
            const dimmed = activeLaneFilter !== 'all' && activeLaneFilter !== node.laneId;
            const accent = toneCssColor(node.tone);

            return (
              <article
                key={node.id}
                data-flow-node-id={node.id}
                data-flow-node-lane={node.laneId}
                data-flow-node-step={node.stepCode}
                data-flow-node-title={node.title}
                data-flow-node-surface={node.surfaceTag}
                data-flow-node-summary={node.summary}
                data-flow-node-module={node.sourceModule}
                data-flow-node-rule={node.engineRule}
                data-flow-node-telemetry={node.telemetryEvents.join(', ')}
                style={{
                  position: 'absolute',
                  left: `${node.x}px`,
                  top: `${node.y}px`,
                  width: `${node.width}px`,
                  height: `${node.height}px`,
                  borderRadius: 'var(--radius-tray)',
                  background: 'var(--color-bg-surface)',
                  border: isSelected
                    ? `2px solid ${accent}`
                    : '1px solid var(--color-border-strong)',
                  boxShadow: isSelected
                    ? '0 0 0 4px rgba(245, 248, 251, 0.08), var(--shadow-floating-bar)'
                    : '0 8px 24px rgba(0, 0, 0, 0.36)',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  opacity: dimmed ? 0.32 : 1,
                  cursor: 'pointer',
                  transition: 'opacity 180ms ease, border-color 150ms ease, box-shadow 150ms ease',
                }}
              >
                {/* Frame Top Eyebrow */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="wk-pill tabular-nums"
                      style={{
                        background: toneSoftBg(node.tone),
                        color: accent,
                      }}
                    >
                      {node.stepCode}
                    </span>
                    <span className="wk-caption truncate">{node.surfaceTag}</span>
                  </div>

                  <h4 className="wk-subhead truncate" style={{ color: 'var(--color-text-primary)' }}>
                    {node.title}
                  </h4>

                  <p
                    className="wk-caption line-clamp-2"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {node.summary}
                  </p>
                </div>

                {/* Miniature Realistic App UI Schematic */}
                <div className="space-y-2">
                  <NodeMiniWireframe kind={node.preview} tone={node.tone} />

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <code
                      className="wk-caption truncate"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {node.telemetryEvents[0]}
                    </code>
                    <span className="wk-caption shrink-0" style={{ color: accent }}>
                      Inspect →
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {/* Right-Hand Figma Node Spec Inspector Drawer */}
        {selectedNode && (
          <aside
            data-flow-ui-overlay="true"
            data-flow-inspector="true"
            aria-label="Selected screen flow specification"
            className="absolute top-16 right-3 bottom-20 z-20 w-80 max-w-[calc(100vw-24px)] overflow-y-auto rounded-[var(--radius-card)] p-4 space-y-4"
            style={{
              background: 'rgb(var(--color-bg-surface-rgb) / 0.96)',
              border: '1px solid var(--color-border-strong)',
              boxShadow: 'var(--shadow-floating-bar)',
              backdropFilter: 'blur(20px)',
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    data-inspector-step="true"
                    className="wk-pill tabular-nums"
                    style={{
                      background: toneSoftBg(selectedNode.tone),
                      color: toneCssColor(selectedNode.tone),
                    }}
                  >
                    Step {selectedNode.stepCode}
                  </span>
                  <span data-inspector-surface="true" className="wk-pill">{selectedNode.surfaceTag}</span>
                </div>
                <h3 data-inspector-title="true" className="wk-title">{selectedNode.title}</h3>
              </div>
              <button
                type="button"
                data-inspector-close="true"
                onClick={() => setSelectedNodeId(null)}
                aria-label="Close frame inspector"
                className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: 'var(--color-bg-surface-raised)',
                  border: '1px solid var(--color-border-subtle)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <p data-inspector-summary="true" className="wk-body">{selectedNode.summary}</p>

            <div className="wk-raised space-y-1">
              <div className="wk-label">Canonical module owner</div>
              <code data-inspector-module="true" className="wk-caption block break-words" style={{ color: 'var(--color-text-primary)' }}>
                {selectedNode.sourceModule}
              </code>
            </div>

            <div className="wk-raised space-y-1">
              <div className="wk-label">Architecture &amp; science invariant</div>
              <p data-inspector-rule="true" className="wk-caption" style={{ color: 'var(--color-text-secondary)' }}>
                {selectedNode.engineRule}
              </p>
            </div>

            <div className="space-y-2">
              <div className="wk-label">GSM telemetry signals</div>
              <div data-inspector-telemetry="true" className="flex flex-wrap gap-1">
                {selectedNode.telemetryEvents.map((ev) => (
                  <span
                    key={ev}
                    className="wk-pill"
                    style={{
                      background: 'var(--color-status-info-soft)',
                      color: 'var(--color-status-info)',
                    }}
                  >
                    {ev}
                  </span>
                ))}
              </div>
            </div>

            {connectedSummary.incoming.length > 0 && (
              <div className="space-y-2">
                <div className="wk-label">Upstream entry paths</div>
                <div className="space-y-1">
                  {connectedSummary.incoming.map((prev) => (
                    <button
                      key={prev.id}
                      type="button"
                      onClick={() => focusNode(prev)}
                      className="wk-btn-secondary w-full min-h-[44px] justify-between px-3 text-left"
                    >
                      <span className="truncate">← {prev.stepCode} {prev.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {connectedSummary.outgoing.length > 0 && (
              <div className="space-y-2">
                <div className="wk-label">Next transitions</div>
                <div className="space-y-1">
                  {connectedSummary.outgoing.map((nxt) => (
                    <button
                      key={nxt.id}
                      type="button"
                      onClick={() => focusNode(nxt)}
                      className="wk-btn-secondary w-full min-h-[44px] justify-between px-3 text-left"
                    >
                      <span className="truncate">{nxt.stepCode} {nxt.title} →</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>
        )}

        {/* Bottom-Left Live Minimap */}
        {showMinimap && (
          <div
            data-flow-ui-overlay="true"
            className="hidden md:block absolute bottom-4 left-4 z-20 rounded-[var(--radius-control)] p-2"
            style={{
              background: 'rgb(var(--color-bg-surface-rgb) / 0.92)',
              border: '1px solid var(--color-border-strong)',
              boxShadow: 'var(--shadow-floating-bar)',
            }}
          >
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="wk-label">Board map</span>
              <span className="wk-caption tabular-nums">{zoomPct}%</span>
            </div>
            <svg
              width={176}
              height={220}
              viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
              onClick={handleMinimapClick}
              className="rounded-[var(--radius-inset)] cursor-crosshair block"
              style={{ background: 'var(--color-bg-canvas)' }}
              aria-label="Canvas minimap — click anywhere to jump camera"
            >
              {FLOW_SECTIONS.map((sec) => (
                <rect
                  key={sec.id}
                  x={sec.x}
                  y={sec.y}
                  width={sec.width}
                  height={sec.height}
                  rx={40}
                  fill="var(--color-bg-surface)"
                  stroke={toneCssColor(sec.tone)}
                  strokeWidth={18}
                  opacity={activeLaneFilter === 'all' || activeLaneFilter === sec.id ? 0.85 : 0.25}
                />
              ))}
              {FLOW_NODES.map((n) => (
                <rect
                  key={n.id}
                  x={n.x}
                  y={n.y}
                  width={n.width}
                  height={n.height}
                  rx={24}
                  fill={selectedNodeId === n.id ? toneCssColor(n.tone) : 'var(--color-bg-surface-raised)'}
                />
              ))}
              {/* Approximate Viewport Camera Lens */}
              <rect
                x={Math.max(0, Math.round(-pan.x / zoom))}
                y={Math.max(0, Math.round(-pan.y / zoom))}
                width={Math.min(BOARD_WIDTH, Math.round(1200 / zoom))}
                height={Math.min(BOARD_HEIGHT, Math.round(760 / zoom))}
                rx={28}
                fill="rgba(245, 248, 251, 0.08)"
                stroke="var(--color-action-primary-bg)"
                strokeWidth={24}
              />
            </svg>
          </div>
        )}

        {/* Bottom-Center Floating Figma Zoom & Canvas Dock */}
        <div
          data-flow-ui-overlay="true"
          role="toolbar"
          aria-label="Canvas zoom and navigation controls"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 p-1 rounded-[var(--radius-tray)]"
          style={{
            background: 'rgb(var(--color-bg-surface-rgb) / 0.94)',
            border: '1px solid var(--color-border-strong)',
            boxShadow: 'var(--shadow-floating-bar)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <button
            type="button"
            data-flow-zoom-out="true"
            onClick={() => zoomAtViewportCenter(-0.12)}
            aria-label="Zoom out"
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-[var(--radius-control)] flex items-center justify-center"
            style={{ color: 'var(--color-text-primary)', background: 'var(--color-bg-surface-raised)' }}
          >
            <Minus className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            data-flow-zoom-reset="true"
            onClick={() => zoomAtViewportCenter(0, true)}
            aria-label="Reset zoom to 100 percent"
            className="px-3 min-h-[44px] rounded-[var(--radius-control)] wk-subhead tabular-nums"
            style={{ color: 'var(--color-text-primary)' }}
          >
            <span data-flow-zoom-label="true">{zoomPct}%</span>
          </button>

          <button
            type="button"
            data-flow-zoom-in="true"
            onClick={() => zoomAtViewportCenter(0.12)}
            aria-label="Zoom in"
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-[var(--radius-control)] flex items-center justify-center"
            style={{ color: 'var(--color-text-primary)', background: 'var(--color-bg-surface-raised)' }}
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
          </button>

          <div className="w-px h-6 mx-1" style={{ background: 'var(--color-border-strong)' }} aria-hidden="true" />

          <button
            type="button"
            data-flow-zoom-fit="true"
            onClick={fitEntireBoard}
            className="px-3 min-h-[44px] rounded-[var(--radius-control)] inline-flex items-center gap-2 wk-caption"
            style={{ color: 'var(--color-text-primary)', background: 'var(--color-bg-surface-raised)' }}
          >
            <Crosshair className="w-4 h-4" aria-hidden="true" />
            <span>Fit board</span>
          </button>

          <button
            type="button"
            onClick={() => setShowMinimap((v) => !v)}
            aria-pressed={showMinimap}
            aria-label="Toggle canvas minimap"
            className="hidden md:flex w-11 h-11 min-w-[44px] min-h-[44px] rounded-[var(--radius-control)] items-center justify-center"
            style={{
              color: showMinimap ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
              background: 'var(--color-bg-surface-raised)',
            }}
          >
            <MapIcon className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setIsFullscreen((v) => !v)}
            aria-pressed={isFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen canvas' : 'Expand canvas fullscreen'}
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-[var(--radius-control)] flex items-center justify-center"
            style={{ color: 'var(--color-text-primary)', background: 'var(--color-bg-surface-raised)' }}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Maximize2 className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </section>
  );
};
