'use client';

import { useCallback } from 'react';
import { useNotisRuntime, useQuery } from '@notis/sdk';
import type { SkillDetail } from '@/lib/skill-links';

export interface ListSkillsResponse {
  status?: string;
  installed_skills?: SkillDetail[];
  error?: string;
  message?: string;
}

export function skillDetailsFromList(listed: ListSkillsResponse): SkillDetail[] {
  if (listed.status === 'error' || (!listed.installed_skills && (listed.error || listed.message))) {
    throw new Error(listed.error || listed.message || 'Could not read your skills.');
  }
  return (listed.installed_skills || []).filter((skill) => skill.status !== 'deleted');
}

const LIST_SKILLS_TOOL = 'LOCAL_NOTIS_LIST_SKILLS';
const LIST_SKILLS_ARGS = { include_disabled: true, include_content: true };

export interface SkillCorpus {
  skills: SkillDetail[];
  /** True only until the first successful read resolves; never true again after that. */
  loading: boolean;
  /** True while any read (initial or background refresh) is in flight. */
  isFetching: boolean;
  /** True once at least one read has resolved successfully. Gate empty states on this. */
  hasData: boolean;
  error: Error | null;
  reload: () => void;
}

/**
 * Loads every skill on the account with its instructions through the declared
 * read-only Notis tool. The runtime enforces that this app requested access to
 * the tool in its manifest; no generic backend endpoint is exposed to the app.
 *
 * Goes through the shared query cache (`useQuery`), so returning to either
 * route, or flipping link mode back, serves the last result synchronously
 * while a background refresh runs, and a failed refresh keeps the last good
 * list instead of clearing it.
 */
export function useSkillCorpus(): SkillCorpus {
  const runtime = useNotisRuntime();
  const query = useQuery<SkillDetail[]>(
    ['tool', LIST_SKILLS_TOOL, LIST_SKILLS_ARGS],
    async () => {
      const listed = await runtime!.callTool<ListSkillsResponse>(LIST_SKILLS_TOOL, LIST_SKILLS_ARGS, {
        readOnly: true,
        dedupe: true,
      });
      return skillDetailsFromList(listed);
    },
    { readOnly: true },
  );

  const reload = useCallback(() => {
    void query.refetch();
  }, [query.refetch]);

  return {
    skills: query.data ?? [],
    loading: query.loading,
    isFetching: query.isFetching,
    hasData: query.hasData,
    error: query.error,
    reload,
  };
}

/**
 * Portal-relative link to a skill's editor. It stays relative on purpose: the
 * desktop app serves the portal from a custom scheme, where an absolute URL
 * built from `window.location.origin` would not resolve.
 */
export function skillEditorUrl(skillId: string): string {
  return `/skills/edit?id=${encodeURIComponent(skillId)}`;
}
