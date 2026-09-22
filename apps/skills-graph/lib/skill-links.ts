/**
 * Link extraction: turn a set of skills into a directed graph of the mentions
 * they make of each other.
 *
 * A skill "links" to another when its instructions name it — as a slash
 * command (`/notis-cli`), in a bundle path (`.agents/skills/notis-cli`), in
 * backticks, or next to the word "skill". Every one of those signals carries a
 * different confidence, and every link keeps the lines it was found on so the
 * reader can judge it instead of trusting the parser.
 */

export type LinkKind = 'path' | 'command' | 'code' | 'description' | 'explicit' | 'plain';

export type LinkOrigin = 'body' | 'description';

export interface SkillSummary {
  id: string;
  name: string;
  description?: string | null;
  source?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  curated_skill_id?: string | null;
}

export interface SkillDetail extends SkillSummary {
  skill_md?: string | null;
}

export interface LinkEvidence {
  kind: LinkKind;
  confidence: number;
  origin: LinkOrigin;
  /** The full source line the mention was found on, trimmed. */
  snippet: string;
}

export interface SkillLink {
  sourceId: string;
  targetId: string;
  /** Highest-confidence evidence for this link, 0-1. */
  confidence: number;
  mentions: number;
  evidence: LinkEvidence[];
}

export interface SkillNode {
  id: string;
  name: string;
  description: string;
  source: string;
  isCurated: boolean;
  outgoing: number;
  incoming: number;
  /** Index of the connected component this skill belongs to, or -1 when isolated. */
  cluster: number;
}

export interface SkillGraph {
  nodes: SkillNode[];
  links: SkillLink[];
  clusterCount: number;
}

export const LINK_CONFIDENCE: Record<LinkKind, number> = {
  path: 1,
  command: 0.9,
  code: 0.8,
  description: 0.75,
  explicit: 0.7,
  plain: 0.35,
};

export const LINK_KIND_LABEL: Record<LinkKind, string> = {
  path: 'Bundle path',
  command: 'Slash command',
  code: 'Named in code',
  description: 'Named in description',
  explicit: 'Called a skill',
  plain: 'Name appears',
};

/** Links at or above this confidence are shown by default. */
export const STRONG_LINK_THRESHOLD = 0.7;

const MAX_EVIDENCE_PER_LINK = 6;

/** A name with no separator ("cli", "design") is an ordinary word too. */
function isGenericName(name: string): boolean {
  return !name.includes('-') && !name.includes(' ') && !name.includes('_');
}

function nameVariants(name: string): string[] {
  const variants = new Set<string>([name]);
  if (name.includes('-')) variants.add(name.replace(/-/g, ' '));
  return [...variants].filter((variant) => variant.length >= 3);
}

function toPattern(variant: string, caseSensitive: boolean): RegExp {
  const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[\\s-]+');
  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, caseSensitive ? 'g' : 'gi');
}

/** Frontmatter is metadata, not instructions; descriptions are scanned separately. */
export function stripFrontmatter(markdown: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(markdown);
  return match ? markdown.slice(match[0].length) : markdown;
}

/** Character ranges covered by fenced code blocks, where a name is usually an import, not a reference. */
export function fencedRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const fence = /^[ \t]*(```|~~~)/gm;
  let open: number | null = null;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(text)) !== null) {
    if (open === null) open = match.index;
    else {
      ranges.push([open, fence.lastIndex]);
      open = null;
    }
  }
  if (open !== null) ranges.push([open, text.length]);
  return ranges;
}

function inRanges(ranges: Array<[number, number]>, index: number): boolean {
  return ranges.some(([start, end]) => index >= start && index < end);
}

function classify(text: string, start: number, end: number): LinkKind {
  const before = text.slice(Math.max(0, start - 80), start);
  const after = text.slice(end, end + 80);

  if (/(?:^|[\s(`"'])(?:[\w.-]*\/)*skills\/$/.test(before) || after.startsWith('/SKILL.md')) return 'path';
  if (before.endsWith('/') && !/[\w.-]\/$/.test(before)) return 'command';
  if (before.endsWith('`') && after.startsWith('`')) return 'code';
  if (/\bskills?\b[\s\W]{0,24}$/i.test(before) || /^[\s\W]{0,4}\bskills?\b/i.test(after)) return 'explicit';
  return 'plain';
}

function lineAt(text: string, start: number, end: number): string {
  const lineStart = text.lastIndexOf('\n', start) + 1;
  const lineEnd = text.indexOf('\n', end);
  return text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd).trim();
}

function collectEvidence(
  text: string,
  targetName: string,
  origin: LinkOrigin,
  skipRanges: Array<[number, number]>,
): LinkEvidence[] {
  const generic = isGenericName(targetName);
  const found: LinkEvidence[] = [];

  for (const variant of nameVariants(targetName)) {
    const pattern = toPattern(variant, generic);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (inRanges(skipRanges, match.index)) continue;

      const kind = origin === 'description' ? 'description' : classify(text, match.index, pattern.lastIndex);
      // An ordinary word only counts when the surrounding text marks it as a
      // skill reference, so "the CLI" never links to the `cli` skill.
      if (generic && (kind === 'plain' || kind === 'description')) continue;

      found.push({
        kind,
        confidence: LINK_CONFIDENCE[kind],
        origin,
        snippet: lineAt(text, match.index, pattern.lastIndex).slice(0, 240),
      });
    }
  }

  return found;
}

export function extractLinks(skills: SkillDetail[]): SkillLink[] {
  const targets = skills.filter((skill) => skill.name.trim().length >= 3);
  const links: SkillLink[] = [];

  for (const source of skills) {
    const body = stripFrontmatter(source.skill_md || '');
    const description = (source.description || '').trim();
    const skipRanges = fencedRanges(body);

    for (const target of targets) {
      if (target.id === source.id || target.name === source.name) continue;

      const evidence = [
        ...collectEvidence(body, target.name, 'body', skipRanges),
        ...collectEvidence(description, target.name, 'description', []),
      ];
      if (evidence.length === 0) continue;

      evidence.sort((a, b) => b.confidence - a.confidence);
      links.push({
        sourceId: source.id,
        targetId: target.id,
        confidence: evidence[0].confidence,
        mentions: evidence.length,
        evidence: dedupeEvidence(evidence).slice(0, MAX_EVIDENCE_PER_LINK),
      });
    }
  }

  return links.sort((a, b) => b.confidence - a.confidence || b.mentions - a.mentions);
}

function dedupeEvidence(evidence: LinkEvidence[]): LinkEvidence[] {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = `${item.kind}:${item.snippet}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Connected components over the undirected projection of `links`. */
function assignClusters(nodeIds: string[], links: SkillLink[]): Map<string, number> {
  const parent = new Map<string, string>(nodeIds.map((id) => [id, id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    let cursor = id;
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor) as string;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };

  for (const link of links) {
    if (!parent.has(link.sourceId) || !parent.has(link.targetId)) continue;
    const a = find(link.sourceId);
    const b = find(link.targetId);
    if (a !== b) parent.set(a, b);
  }

  const members = new Map<string, string[]>();
  for (const id of nodeIds) {
    const root = find(id);
    const group = members.get(root);
    if (group) group.push(id);
    else members.set(root, [id]);
  }

  const groups = [...members.values()]
    .filter((group) => group.length > 1)
    .sort((a, b) => b.length - a.length);

  const clusterOf = new Map<string, number>(nodeIds.map((id) => [id, -1]));
  groups.forEach((group, index) => group.forEach((id) => clusterOf.set(id, index)));
  return clusterOf;
}

export function buildGraph(skills: SkillDetail[], links: SkillLink[], minConfidence: number): SkillGraph {
  const visible = links.filter((link) => link.confidence >= minConfidence);
  const known = new Set(skills.map((skill) => skill.id));
  const kept = visible.filter((link) => known.has(link.sourceId) && known.has(link.targetId));
  const clusterOf = assignClusters([...known], kept);

  const outgoing = new Map<string, number>();
  const incoming = new Map<string, number>();
  for (const link of kept) {
    outgoing.set(link.sourceId, (outgoing.get(link.sourceId) || 0) + 1);
    incoming.set(link.targetId, (incoming.get(link.targetId) || 0) + 1);
  }

  const nodes: SkillNode[] = skills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description || '',
    source: skill.source || 'custom',
    isCurated: Boolean(skill.curated_skill_id) || skill.source === 'curated',
    outgoing: outgoing.get(skill.id) || 0,
    incoming: incoming.get(skill.id) || 0,
    cluster: clusterOf.get(skill.id) ?? -1,
  }));

  return {
    nodes,
    links: kept,
    clusterCount: new Set(nodes.map((node) => node.cluster).filter((cluster) => cluster >= 0)).size,
  };
}

export interface GraphStats {
  skills: number;
  links: number;
  connected: number;
  isolated: number;
  clusters: number;
  mostReferenced: SkillNode | null;
  mostReferencing: SkillNode | null;
}

export function graphStats(graph: SkillGraph): GraphStats {
  const connected = graph.nodes.filter((node) => node.incoming + node.outgoing > 0);
  const byIncoming = [...connected].sort((a, b) => b.incoming - a.incoming || a.name.localeCompare(b.name));
  const byOutgoing = [...connected].sort((a, b) => b.outgoing - a.outgoing || a.name.localeCompare(b.name));

  return {
    skills: graph.nodes.length,
    links: graph.links.length,
    connected: connected.length,
    isolated: graph.nodes.length - connected.length,
    clusters: graph.clusterCount,
    mostReferenced: byIncoming[0]?.incoming ? byIncoming[0] : null,
    mostReferencing: byOutgoing[0]?.outgoing ? byOutgoing[0] : null,
  };
}
