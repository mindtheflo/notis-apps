'use client';

import { useMemo } from 'react';
import { buildGraph, extractLinks, STRONG_LINK_THRESHOLD, type SkillGraph } from '@/lib/skill-links';
import { useSkillCorpus, type SkillCorpus } from '@/lib/skills-api';

/**
 * `strong` keeps only links the parser can defend — slash commands, bundle
 * paths, backticked names, or a name next to the word "skill". `all` adds
 * every other plain-prose mention.
 */
export type LinkMode = 'strong' | 'all';

export interface SkillGraphResult extends SkillCorpus {
  graph: SkillGraph;
  /** Links found before the confidence filter, used to show what `all` would add. */
  totalLinks: number;
}

export function useSkillGraph(mode: LinkMode): SkillGraphResult {
  const corpus = useSkillCorpus();

  const links = useMemo(() => extractLinks(corpus.skills), [corpus.skills]);
  const graph = useMemo(
    () => buildGraph(corpus.skills, links, mode === 'strong' ? STRONG_LINK_THRESHOLD : 0),
    [corpus.skills, links, mode],
  );

  return { ...corpus, graph, totalLinks: links.length };
}
