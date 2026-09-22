/** Row shapes for the two databases this app owns. */

export type RepositoryStatus = 'Pending' | 'Cloning' | 'Configuring' | 'Ready' | 'Error';
export type SecretsStatus = 'Missing' | 'Staged' | 'Verified';

export type Repository = {
  id: string;
  demo?: boolean;
  name: string;
  gitUrl: string | null;
  owner: string | null;
  repo: string | null;
  defaultBranch: string | null;
  path: string | null;
  setupCommand: string | null;
  devCommand: string | null;
  archiveCommand: string | null;
  status: RepositoryStatus | null;
  /**
   * Projection of the row's `Environment files` property, which is of the
   * platform's `secret` kind: it stores a pointer, never a value, and the read
   * path redacts even that down to {present, status, reference, metadata}. The
   * app therefore cannot surface an environment file's contents even by
   * mistake -- and `secretsPath` is a location on the cloud computer, not a
   * credential.
   */
  secretsStatus: SecretsStatus | null;
  secretsPath: string | null;
  secretFiles: string[];
  setupVerifiedAt: string | null;
  notes: string | null;
};

export type WorkspaceStatus =
  | 'Creating'
  | 'Setting up'
  | 'Ready'
  | 'Working'
  | 'Archived'
  | 'Error';
export type PullRequestState = 'None' | 'Draft' | 'Open' | 'Merged' | 'Closed';

export type Workspace = {
  id: string;
  demo?: boolean;
  name: string;
  repositoryId: string | null;
  branch: string | null;
  base: string | null;
  task: string | null;
  path: string | null;
  status: WorkspaceStatus | null;
  prState: PullRequestState | null;
  prNumber: number | null;
  prUrl: string | null;
  checks: string | null;
  ahead: number | null;
  dirtyFiles: number | null;
  /** Size of the worktree on the cloud computer, written by `workspace.sh sync`. */
  diskMb: number | null;
  thread: string | null;
  lastSynced: string | null;
  notes: string | null;
};
