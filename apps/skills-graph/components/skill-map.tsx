'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SkillGraph, SkillNode } from '@/lib/skill-links';
import { clusterColor, matchesQuery, neighbourhood, nodeRadius } from '@/lib/graph-view';
import {
  clamp,
  initialLayout,
  layoutBounds,
  stepLayout,
  type LayoutEdge,
  type LayoutNode,
} from '@/lib/force-layout';
import { cn } from '@/lib/utils';

const CANVAS = { width: 1000, height: 680 };
const MIN_SCALE = 0.4;
const MAX_SCALE = 3;

interface SkillMapProps {
  graph: SkillGraph;
  selectedId: string | null;
  onSelect: (skillId: string | null) => void;
  query: string;
  className?: string;
}

interface View {
  x: number;
  y: number;
  scale: number;
}

const IDENTITY: View = { x: 0, y: 0, scale: 1 };

function modifierLabel(): string {
  const platform = typeof navigator === 'undefined' ? '' : navigator.platform || '';
  return /mac|iphone|ipad/i.test(platform) ? '⌘' : 'Ctrl';
}

export function SkillMap({ graph, selectedId, onSelect, query, className }: SkillMapProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const nodesRef = useRef<LayoutNode[]>([]);
  const frameRef = useRef<number | null>(null);
  const alphaRef = useRef(1);
  const dragRef = useRef<{ id: string; pointerId: number } | null>(null);
  const panRef = useRef<{ pointerId: number; startX: number; startY: number; origin: View } | null>(null);

  const [, forceRender] = useState(0);
  const [view, setView] = useState<View>(IDENTITY);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [adjusted, setAdjusted] = useState(false);
  const adjustedRef = useRef(false);

  /** Once the reader pans, zooms, or drags, the map stops re-framing itself. */
  const markAdjusted = useCallback(() => {
    if (adjustedRef.current) return;
    adjustedRef.current = true;
    setAdjusted(true);
  }, []);

  const edges: LayoutEdge[] = useMemo(
    () => graph.links.map((link) => ({
      sourceId: link.sourceId,
      targetId: link.targetId,
      strength: link.confidence,
    })),
    [graph.links],
  );

  // Re-seed only when the set of skills or links actually changes, so toggling
  // selection or typing in search never reshuffles the map.
  const layoutKey = useMemo(
    () => [
      graph.nodes.map((node) => node.id).join('|'),
      graph.links.map((link) => `${link.sourceId}>${link.targetId}`).join('|'),
    ].join('#'),
    [graph.nodes, graph.links],
  );

  /** Frames the settled layout so the drawing fills the card. */
  const fitView = useCallback(() => {
    if (adjustedRef.current || nodesRef.current.length === 0) return;
    const bounds = layoutBounds(nodesRef.current, 48);
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const scale = clamp(Math.min(CANVAS.width / width, CANVAS.height / height), MIN_SCALE, 1.8);
    setView({
      scale,
      x: (CANVAS.width - width * scale) / 2 - bounds.minX * scale,
      y: (CANVAS.height - height * scale) / 2 - bounds.minY * scale,
    });
  }, []);

  const runSimulation = useCallback(() => {
    if (frameRef.current !== null) return;
    let tickCount = 0;
    const tick = () => {
      stepLayout(nodesRef.current, edges, CANVAS, alphaRef.current);
      alphaRef.current = Math.max(0, alphaRef.current - 0.015);
      tickCount += 1;
      // Re-frame while it settles so the drawing never drifts off the card.
      if (tickCount % 6 === 0) fitView();
      forceRender((count) => count + 1);
      frameRef.current = null;
      if (alphaRef.current > 0.02) frameRef.current = requestAnimationFrame(tick);
      else fitView();
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [edges, fitView]);

  useEffect(() => {
    nodesRef.current = initialLayout(
      graph.nodes.map((node) => ({
        id: node.id,
        cluster: node.cluster,
        degree: node.incoming + node.outgoing,
      })),
      CANVAS,
    );
    alphaRef.current = 1;
    adjustedRef.current = false;
    setAdjusted(false);
    runSimulation();

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
    // graph.nodes is rebuilt on every render of the parent; layoutKey is the
    // identity that actually decides whether the map has to be re-seeded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, runSimulation]);

  const reheat = useCallback(() => {
    alphaRef.current = Math.max(alphaRef.current, 0.35);
    runSimulation();
  }, [runSimulation]);

  const positions = new Map(nodesRef.current.map((node) => [node.id, node]));
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

  // A skill selected from the standalone list is not drawn here; focusing it
  // would dim the whole map for no reason.
  const requestedFocusId = hoveredId ?? selectedId;
  const focusId = requestedFocusId && nodesById.has(requestedFocusId) ? requestedFocusId : null;
  const focus = useMemo(() => neighbourhood(graph, focusId), [graph, focusId]);
  const matches = useMemo(
    () => new Set(graph.nodes.filter((node) => matchesQuery(node, query)).map((node) => node.id)),
    [graph.nodes, query],
  );

  const toCanvas = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const scaleX = CANVAS.width / rect.width;
    const scaleY = CANVAS.height / rect.height;
    return {
      x: ((clientX - rect.left) * scaleX - view.x) / view.scale,
      y: ((clientY - rect.top) * scaleY - view.y) / view.scale,
    };
  }, [view]);

  const onNodePointerDown = useCallback((event: React.PointerEvent, skillId: string) => {
    event.stopPropagation();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    dragRef.current = { id: skillId, pointerId: event.pointerId };
    markAdjusted();
    const node = nodesRef.current.find((item) => item.id === skillId);
    if (node) node.pinned = true;
  }, [markAdjusted]);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      const node = nodesRef.current.find((item) => item.id === drag.id);
      if (node) {
        const point = toCanvas(event.clientX, event.clientY);
        node.x = point.x;
        node.y = point.y;
        forceRender((count) => count + 1);
      }
      return;
    }

    const pan = panRef.current;
    if (pan && pan.pointerId === event.pointerId) {
      markAdjusted();
      setView({
        ...pan.origin,
        x: pan.origin.x + (event.clientX - pan.startX),
        y: pan.origin.y + (event.clientY - pan.startY),
      });
    }
  }, [markAdjusted, toCanvas]);

  const endPointer = useCallback((event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      const node = nodesRef.current.find((item) => item.id === drag.id);
      if (node) node.pinned = false;
      dragRef.current = null;
      reheat();
    }
    if (panRef.current && panRef.current.pointerId === event.pointerId) panRef.current = null;
  }, [reheat]);

  const onBackgroundPointerDown = useCallback((event: React.PointerEvent) => {
    panRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: view };
  }, [view]);

  /** Zooms around a point given in canvas coordinates. */
  const zoomAround = useCallback((factor: number, canvasX: number, canvasY: number) => {
    markAdjusted();
    setView((current) => {
      const scale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
      return {
        scale,
        x: canvasX - ((canvasX - current.x) / current.scale) * scale,
        y: canvasY - ((canvasY - current.y) / current.scale) * scale,
      };
    });
  }, [markAdjusted]);

  const zoomButton = useCallback((factor: number) => {
    zoomAround(factor, CANVAS.width / 2, CANVAS.height / 2);
  }, [zoomAround]);

  // The wheel belongs to the page. Only a modifier-held wheel zooms the map,
  // so scrolling past the map never traps the reader inside it. The listener
  // is native and non-passive because that is the only place preventDefault
  // still works for wheel events.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      zoomAround(
        Math.exp(-event.deltaY * 0.002),
        (event.clientX - rect.left) * (CANVAS.width / rect.width),
        (event.clientY - rect.top) * (CANVAS.height / rect.height),
      );
    };

    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoomAround]);

  const dim = (skillId: string): boolean => {
    if (query.trim() && !matches.has(skillId)) return true;
    if (focusId) return !focus.ids.has(skillId);
    return false;
  };

  return (
    <div className={cn('relative h-full w-full', className)} data-store-screenshot="map">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`}
        className="h-full w-full select-none"
        // Vertical gestures keep scrolling the page; the map only claims
        // horizontal drags and the mouse pointer.
        style={{ touchAction: 'pan-y' }}
        role="img"
        aria-label="Map of how your skills reference each other"
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onClick={() => {
          if (!dragRef.current) onSelect(null);
        }}
      >
        <defs>
          <marker id="skill-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
          </marker>
        </defs>

        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          {graph.links.map((link) => {
            const source = positions.get(link.sourceId);
            const target = positions.get(link.targetId);
            if (!source || !target) return null;

            const active = focusId ? focus.ids.has(link.sourceId) && focus.ids.has(link.targetId) : false;
            const faded = dim(link.sourceId) || dim(link.targetId);
            const targetNode = nodesById.get(link.targetId);
            const radius = targetNode ? nodeRadius(targetNode) + 4 : 10;
            const angle = Math.atan2(target.y - source.y, target.x - source.x);

            return (
              <line
                key={`${link.sourceId}->${link.targetId}`}
                x1={source.x}
                y1={source.y}
                x2={target.x - Math.cos(angle) * radius}
                y2={target.y - Math.sin(angle) * radius}
                className="stroke-muted-foreground"
                strokeWidth={active ? 2 : 1}
                strokeOpacity={faded ? 0.08 : active ? 0.85 : 0.28 + link.confidence * 0.2}
                strokeDasharray={link.confidence < 0.7 ? '4 4' : undefined}
                markerEnd="url(#skill-arrow)"
              />
            );
          })}

          {graph.nodes.map((node) => {
            const position = positions.get(node.id);
            if (!position) return null;
            const radius = nodeRadius(node);
            const faded = dim(node.id);
            const isSelected = node.id === selectedId;
            const showLabel =
              !faded &&
              (node.incoming + node.outgoing > 0 ||
                isSelected ||
                node.id === hoveredId ||
                matches.has(node.id) ||
                view.scale > 1.15);

            return (
              <g
                key={node.id}
                transform={`translate(${position.x} ${position.y})`}
                opacity={faded ? 0.2 : 1}
                className="cursor-pointer"
                onPointerDown={(event) => onNodePointerDown(event, node.id)}
                onPointerEnter={() => setHoveredId(node.id)}
                onPointerLeave={() => setHoveredId((current) => (current === node.id ? null : current))}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(node.id === selectedId ? null : node.id);
                }}
              >
                {isSelected && (
                  <circle r={radius + 6} fill="none" stroke={clusterColor(node.cluster)} strokeWidth={1.5} strokeOpacity={0.5} />
                )}
                <circle
                  r={radius}
                  fill={clusterColor(node.cluster)}
                  fillOpacity={node.cluster < 0 ? 0.35 : 0.85}
                  className="stroke-background"
                  strokeWidth={2}
                />
                {showLabel && (
                  <text
                    y={radius + 13}
                    textAnchor="middle"
                    className="pointer-events-none fill-foreground text-xs"
                    style={{ paintOrder: 'stroke', stroke: 'var(--background, transparent)', strokeWidth: 3 }}
                  >
                    {node.name.length > 28 ? `${node.name.slice(0, 27)}…` : node.name}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {graph.nodes.length === 0 && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-muted-foreground">
          No skill references another one yet. Name one skill inside another&apos;s instructions and it
          appears here.
        </p>
      )}

      <div className="pointer-events-none absolute bottom-3 left-3 text-xs text-muted-foreground">
        Drag to pan · {modifierLabel()}-scroll to zoom · drag a skill to move it
      </div>

      <div className="absolute bottom-2 right-3 flex items-center gap-1">
        {adjusted && (
          <button
            type="button"
            onClick={() => {
              adjustedRef.current = false;
              setAdjusted(false);
              fitView();
            }}
            className="rounded-md bg-background/80 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          >
            Reset view
          </button>
        )}
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => zoomButton(1 / 1.25)}
          className="flex h-6 w-6 items-center justify-center rounded-md bg-background/80 text-xs leading-none text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        >
          −
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => zoomButton(1.25)}
          className="flex h-6 w-6 items-center justify-center rounded-md bg-background/80 text-xs leading-none text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function nodeById(graph: SkillGraph, skillId: string | null): SkillNode | null {
  if (!skillId) return null;
  return graph.nodes.find((node) => node.id === skillId) ?? null;
}
