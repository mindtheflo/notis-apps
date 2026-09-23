/**
 * Loading the app's two databases.
 *
 * `useDatabaseSubscription` queries by slug and re-reads whenever the database
 * changes, so a workspace an agent creates on the cloud computer appears here
 * without anyone pressing anything. The change feed is a signal only: the rows
 * still arrive through the ordinary query path, which is what keeps app
 * scoping and permissions unchanged.
 *
 * Not every host has a change feed -- the dev harness, the screenshot stub and
 * the vite preview do not -- so `live` is reported upward and the views keep a
 * manual reload for exactly those cases.
 */

'use client';

import { useCallback, useMemo } from 'react';
import { getSecretValue, useDatabaseSubscription } from '@notis/sdk';
import type { DocumentRecord } from '@notis/sdk';

import type { Repository, Workspace } from './types';

// Server-side clamps are lower than one board's worth of rows can grow, so the
// query pages on has_more/next_offset instead of hoping one call covers it.
// `fetchAll` is the hook's own loop, so the app no longer carries one.
const PAGE_SIZE = 100;

type Flat = Record<string, unknown>;

function flatten(document: DocumentRecord): Flat {
  return {
    ...document.properties,
    __id: document.id,
    __title: document.title,
  };
}

function text(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() === '' ? null : value;
  if (typeof value === 'number') return String(value);
  return null;
}

function sandboxPath(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  return raw.startsWith('sandbox:') ? `/${raw.slice('sandbox:'.length)}` : raw;
}

function secretsPath(reference: string | null, repositoryName: string): string | null {
  if (reference?.startsWith('sandbox-env-files:')) {
    const slug = reference.slice('sandbox-env-files:'.length).trim();
    return slug
      ? `/vercel/sandbox/.notis/workspaces/secrets/${slug}`
      : null;
  }
  const explicit = sandboxPath(reference);
  if (explicit) return explicit;
  return /^[a-z0-9._-]+$/.test(repositoryName)
    ? `/vercel/sandbox/.notis/workspaces/secrets/${repositoryName}`
    : null;
}

function count(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function firstRelation(value: unknown): string | null {
  if (Array.isArray(value) && value.length > 0) {
    const head = value[0];
    if (typeof head === 'string') return head;
    if (head && typeof head === 'object' && 'id' in head) {
      return String((head as { id?: unknown }).id ?? '') || null;
    }
  }
  return null;
}

/** File names out of a secret property's metadata, ignoring anything else. */
function fileNames(metadata: Record<string, unknown> | null): string[] {
  const files = metadata?.files;
  if (!Array.isArray(files)) return [];
  return files
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
}

function toRepository(flat: Flat): Repository {
  // `Environment files` is a secret property. `getSecretValue` rebuilds the
  // redacted pointer field by field rather than passing the payload through,
  // so nothing outside {present, reference, status, metadata} can reach the UI
  // however the value was stored.
  const secrets = getSecretValue(flat['Environment files']);
  const name = String(flat.__title ?? flat.Name ?? 'Untitled');
  return {
    id: String(flat.__id ?? ''),
    demo: flat.Demo === true,
    name,
    gitUrl: text(flat['Git URL']),
    owner: text(flat.Owner),
    repo: text(flat.Repo),
    defaultBranch: text(flat['Default branch']),
    path: sandboxPath(flat.Path),
    setupCommand: text(flat['Setup command']),
    devCommand: text(flat['Dev command']),
    archiveCommand: text(flat['Archive command']),
    status: text(flat.Status) as Repository['status'],
    secretsStatus: (secrets.status ?? (secrets.present ? null : 'Missing')) as
      Repository['secretsStatus'],
    secretsPath: secretsPath(secrets.reference, name),
    secretFiles: fileNames(secrets.metadata),
    setupVerifiedAt: text(flat['Setup verified at']),
    notes: text(flat.Notes),
  };
}

function toWorkspace(flat: Flat): Workspace {
  return {
    id: String(flat.__id ?? ''),
    demo: flat.Demo === true,
    name: String(flat.__title ?? flat.Name ?? 'Untitled'),
    repositoryId: firstRelation(flat.Repository),
    branch: text(flat.Branch),
    base: text(flat.Base),
    task: text(flat.Task),
    path: text(flat.Path),
    status: text(flat.Status) as Workspace['status'],
    prState: text(flat['PR state']) as Workspace['prState'],
    prNumber: count(flat['PR number']),
    prUrl: text(flat['PR URL']),
    checks: text(flat.Checks),
    ahead: count(flat.Ahead),
    dirtyFiles: count(flat['Dirty files']),
    diskMb: count(flat['Disk MB']),
    thread: text(flat.Thread),
    lastSynced: text(flat['Last synced']),
    notes: text(flat.Notes),
  };
}

export type AppData = {
  repositories: Repository[];
  workspaces: Workspace[];
  /** True until neither database has ever returned a successful result. */
  loading: boolean;
  /**
   * True once both databases have returned at least one successful result.
   * Drives the instant-loading contract: render `ViewSkeleton` only while this
   * is false, and keep rendering cached content afterward even during a
   * background refetch or a refetch error.
   */
  hasData: boolean;
  /** True while either database is fetching, including a silent background refresh. */
  isFetching: boolean;
  error: string | null;
  refresh: () => void;
  /**
   * True when both databases have a change feed attached, so what is on screen
   * follows the cloud computer on its own. False on hosts without one, where
   * the views keep offering a reload.
   */
  live: boolean;
};

export function useWorkspacesData(): AppData {
  const repositoryQuery = useDatabaseSubscription('repositories', {
    pageSize: PAGE_SIZE,
    fetchAll: true,
  });
  const workspaceQuery = useDatabaseSubscription('workspaces', {
    pageSize: PAGE_SIZE,
    fetchAll: true,
  });

  const repositories = useMemo(
    () => repositoryQuery.rows.map((row) => toRepository(flatten(row))),
    [repositoryQuery.rows],
  );
  const workspaces = useMemo(
    () => workspaceQuery.rows.map((row) => toWorkspace(flatten(row))),
    [workspaceQuery.rows],
  );

  const refetchRepositories = repositoryQuery.refetch;
  const refetchWorkspaces = workspaceQuery.refetch;
  const refresh = useCallback(() => {
    refetchRepositories();
    refetchWorkspaces();
  }, [refetchRepositories, refetchWorkspaces]);

  // One failure is enough to make the board wrong, so report the first one
  // rather than rendering half a board as if it were whole.
  const error = repositoryQuery.error ?? workspaceQuery.error ?? null;

  return useMemo(
    () => ({
      repositories,
      workspaces,
      loading: repositoryQuery.loading || workspaceQuery.loading,
      hasData: repositoryQuery.hasData && workspaceQuery.hasData,
      isFetching: repositoryQuery.isFetching || workspaceQuery.isFetching,
      error: error ? error.message : null,
      refresh,
      live: repositoryQuery.live && workspaceQuery.live,
    }),
    [
      repositories,
      workspaces,
      repositoryQuery.loading,
      workspaceQuery.loading,
      repositoryQuery.hasData,
      workspaceQuery.hasData,
      repositoryQuery.isFetching,
      workspaceQuery.isFetching,
      repositoryQuery.live,
      workspaceQuery.live,
      error,
      refresh,
    ],
  );
}

export function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'never';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
