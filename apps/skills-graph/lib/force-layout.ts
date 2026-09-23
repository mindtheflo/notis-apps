/**
 * A small deterministic force-directed layout.
 *
 * Deterministic matters twice: the same skills always land in the same shape,
 * so the map stays recognisable between visits, and listing screenshots are
 * reproducible.
 */

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Repulsion scales with connectivity so hubs claim room. */
  weight: number;
  cluster: number;
  pinned: boolean;
}

export interface LayoutEdge {
  sourceId: string;
  targetId: string;
  strength: number;
}

export interface LayoutOptions {
  width: number;
  height: number;
  /** Preferred distance between two linked skills. */
  linkDistance?: number;
  repulsion?: number;
}

const DEFAULTS = { linkDistance: 90, repulsion: 2600 };

/** Small, fast, seedable PRNG (mulberry32). */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(values: string[]): number {
  let hash = 2166136261;
  for (const value of values) {
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

export function initialLayout(
  nodes: Array<{ id: string; cluster: number; degree: number }>,
  options: LayoutOptions,
): LayoutNode[] {
  const random = createRandom(hashSeed(nodes.map((node) => node.id)));
  const centerX = options.width / 2;
  const centerY = options.height / 2;
  const clusters = [...new Set(nodes.map((node) => node.cluster))].sort((a, b) => a - b);
  const radius = Math.min(options.width, options.height) * 0.36;

  return nodes.map((node) => {
    // Seed each component on its own arc so the simulation starts untangled.
    const clusterIndex = Math.max(0, clusters.indexOf(node.cluster));
    const clusterAngle = (clusterIndex / Math.max(1, clusters.length)) * Math.PI * 2;
    const spread = node.cluster < 0 ? radius * 1.15 : radius * (0.35 + random() * 0.5);
    const angle = clusterAngle + (random() - 0.5) * 1.6;

    return {
      id: node.id,
      x: centerX + Math.cos(angle) * spread,
      y: centerY + Math.sin(angle) * spread,
      vx: 0,
      vy: 0,
      weight: 1 + Math.min(node.degree, 8) * 0.35,
      cluster: node.cluster,
      pinned: false,
    };
  });
}

/**
 * Advances the simulation one tick in place. `alpha` cools from 1 to 0 and
 * scales every displacement, so callers can decide when motion stops.
 */
export function stepLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options: LayoutOptions,
  alpha: number,
): void {
  const linkDistance = options.linkDistance ?? DEFAULTS.linkDistance;
  const repulsion = options.repulsion ?? DEFAULTS.repulsion;
  const centerX = options.width / 2;
  const centerY = options.height / 2;
  const byId = new Map(nodes.map((node) => [node.id, node]));

  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < 1) {
        // Perfectly overlapping nodes have no direction to separate along.
        dx = (i % 7) - 3 + 0.5;
        dy = (j % 5) - 2 + 0.5;
        distanceSquared = dx * dx + dy * dy;
      }
      const distance = Math.sqrt(distanceSquared);
      const force = (repulsion * a.weight * b.weight) / distanceSquared;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      a.vx -= fx;
      a.vy -= fy;
      b.vx += fx;
      b.vy += fy;
    }
  }

  for (const edge of edges) {
    const source = byId.get(edge.sourceId);
    const target = byId.get(edge.targetId);
    if (!source || !target) continue;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const force = (distance - linkDistance) * 0.06 * edge.strength;
    const fx = (dx / distance) * force;
    const fy = (dy / distance) * force;
    source.vx += fx;
    source.vy += fy;
    target.vx -= fx;
    target.vy -= fy;
  }

  // Unconnected skills settle on a ring around the linked ones, so the middle
  // of the map is always the part with structure.
  const ringRadius = Math.min(options.width, options.height) * 0.42;

  for (const node of nodes) {
    if (node.cluster < 0) {
      const dx = node.x - centerX;
      const dy = node.y - centerY;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const pull = (ringRadius - distance) * 0.02;
      node.vx += (dx / distance) * pull;
      node.vy += (dy / distance) * pull;
    } else {
      node.vx += (centerX - node.x) * 0.012;
      node.vy += (centerY - node.y) * 0.012;
    }

    if (node.pinned) {
      node.vx = 0;
      node.vy = 0;
      continue;
    }

    node.vx *= 0.82;
    node.vy *= 0.82;
    node.x += clamp(node.vx * alpha, -40, 40);
    node.y += clamp(node.vy * alpha, -40, 40);
    node.x = clamp(node.x, 24, options.width - 24);
    node.y = clamp(node.y, 24, options.height - 24);
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function layoutBounds(nodes: LayoutNode[], padding = 60): Bounds {
  if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  return {
    minX: Math.min(...xs) - padding,
    minY: Math.min(...ys) - padding,
    maxX: Math.max(...xs) + padding,
    maxY: Math.max(...ys) + padding,
  };
}

/** Runs the simulation to a steady state without animating — used for tests and snapshots. */
export function settleLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options: LayoutOptions,
  ticks = 300,
): LayoutNode[] {
  for (let tick = 0; tick < ticks; tick += 1) {
    stepLayout(nodes, edges, options, Math.max(0.05, 1 - tick / ticks));
  }
  return nodes;
}
