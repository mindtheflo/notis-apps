/**
 * View-model helpers shared by the map and the insights route. Pure functions
 * so the interesting logic stays testable outside React.
 */

import type { SkillGraph, SkillLink, SkillNode } from '@/lib/skill-links';

/** Cluster hues chosen to stay legible on both the light and dark portal surface. */
export const CLUSTER_COLORS = [
  'hsl(217 72% 55%)',
  'hsl(160 60% 42%)',
  'hsl(280 55% 60%)',
  'hsl(28 78% 52%)',
  'hsl(196 68% 46%)',
  'hsl(340 62% 57%)',
];

export const ISOLATED_COLOR = 'hsl(220 9% 60%)';

export function clusterColor(cluster: number): string {
  if (cluster < 0) return ISOLATED_COLOR;
  return CLUSTER_COLORS[cluster % CLUSTER_COLORS.length];
}

export function nodeRadius(node: SkillNode): number {
  return 7 + Math.min(node.incoming, 8) * 1.9 + Math.min(node.outgoing, 8) * 0.7;
}

export interface Neighbourhood {
  /** Ids linked to the focused skill in either direction, plus the skill itself. */
  ids: Set<string>;
  outgoing: SkillLink[];
  incoming: SkillLink[];
}

export function neighbourhood(graph: SkillGraph, skillId: string | null): Neighbourhood {
  const outgoing: SkillLink[] = [];
  const incoming: SkillLink[] = [];
  const ids = new Set<string>();
  if (!skillId) return { ids, outgoing, incoming };

  ids.add(skillId);
  for (const link of graph.links) {
    if (link.sourceId === skillId) {
      outgoing.push(link);
      ids.add(link.targetId);
    } else if (link.targetId === skillId) {
      incoming.push(link);
      ids.add(link.sourceId);
    }
  }

  const byConfidence = (a: SkillLink, b: SkillLink) => b.confidence - a.confidence || b.mentions - a.mentions;
  return { ids, outgoing: outgoing.sort(byConfidence), incoming: incoming.sort(byConfidence) };
}

export function matchesQuery(node: SkillNode, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return false;
  return node.name.toLowerCase().includes(trimmed) || node.description.toLowerCase().includes(trimmed);
}

export function nodeMap(graph: SkillGraph): Map<string, SkillNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

export interface ClusterSummary {
  cluster: number;
  color: string;
  size: number;
  /** The most-referenced skill in the component, used as its label. */
  anchor: SkillNode;
  members: SkillNode[];
}

export function clusterSummaries(graph: SkillGraph): ClusterSummary[] {
  const groups = new Map<number, SkillNode[]>();
  for (const node of graph.nodes) {
    if (node.cluster < 0) continue;
    const group = groups.get(node.cluster);
    if (group) group.push(node);
    else groups.set(node.cluster, [node]);
  }

  return [...groups.entries()]
    .map(([cluster, members]) => {
      const ranked = [...members].sort(
        (a, b) => b.incoming - a.incoming || b.outgoing - a.outgoing || a.name.localeCompare(b.name),
      );
      return { cluster, color: clusterColor(cluster), size: members.length, anchor: ranked[0], members: ranked };
    })
    .sort((a, b) => b.size - a.size || a.cluster - b.cluster);
}

/**
 * The graph without the skills nothing links to. The map draws this: an
 * unconnected skill has no place on a map of references, and a field of
 * loose dots buries the structure that is there.
 */
export function connectedOnly(graph: SkillGraph): SkillGraph {
  return { ...graph, nodes: graph.nodes.filter((node) => node.incoming + node.outgoing > 0) };
}

export function isolatedNodes(graph: SkillGraph): SkillNode[] {
  return graph.nodes
    .filter((node) => node.incoming + node.outgoing === 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function rankedNodes(graph: SkillGraph, by: 'incoming' | 'outgoing', limit = 8): SkillNode[] {
  return graph.nodes
    .filter((node) => node[by] > 0)
    .sort((a, b) => b[by] - a[by] || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Sorted link list for the table view, resolved to names for display. */
export interface LinkRow {
  link: SkillLink;
  source: SkillNode;
  target: SkillNode;
}

export function linkRows(graph: SkillGraph, query = ''): LinkRow[] {
  const nodes = nodeMap(graph);
  const trimmed = query.trim().toLowerCase();

  return graph.links
    .flatMap((link) => {
      const source = nodes.get(link.sourceId);
      const target = nodes.get(link.targetId);
      return source && target ? [{ link, source, target }] : [];
    })
    .filter(({ source, target, link }) => {
      if (!trimmed) return true;
      return (
        source.name.toLowerCase().includes(trimmed) ||
        target.name.toLowerCase().includes(trimmed) ||
        link.evidence.some((item) => item.snippet.toLowerCase().includes(trimmed))
      );
    })
    .sort(
      (a, b) =>
        b.link.confidence - a.link.confidence ||
        a.source.name.localeCompare(b.source.name) ||
        a.target.name.localeCompare(b.target.name),
    );
}
