import type { ArchiveRunner } from './archive-workspace.ts';
import type { ShellOutcome } from './shell.ts';

export type ArchiveRow = {
  id: string;
  name: string;
  repositoryName: string | null;
  repositoryId: string | null;
  path?: string | null;
};
export type ArchiveWriter = (id: string) => Promise<void>;
const ok: ShellOutcome = { ok: true, stdout: '', stderr: '', exitCode: 0, error: null };
const failure = (error: string): ShellOutcome => ({ ...ok, ok: false, exitCode: -1, error });

// One cloud crossing for the selection, no nested CLI/auth/database calls.
// The shared cleanup script remains the only implementation of removal.
export function cleanupCommand(targets: ArchiveRow[]): string {
  const encoded = JSON.stringify(JSON.stringify(targets));
  return `python3 - <<'NOTIS_ARCHIVE_PY'
import concurrent.futures, json, subprocess
rows = json.loads(${encoded})
def cleanup(row):
    try:
        p = subprocess.run(['bash', '/vercel/sandbox/.notis/skills/workspaces-shared/scripts/workspace.sh', 'remove', row['repositoryName'], row['name'], '--checkout-only'], capture_output=True, text=True, timeout=120)
        return {'id': row['id'], 'ok': p.returncode == 0, 'error': p.stderr[-2000:] if p.returncode else None}
    except Exception as e:
        return {'id': row['id'], 'ok': False, 'error': str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    results = list(pool.map(cleanup, rows))
print('NOTIS_ARCHIVE_RESULTS=' + json.dumps(results))
NOTIS_ARCHIVE_PY`;
}

export function batchArchiver(run: ArchiveRunner, targets: ArchiveRow[], write: ArchiveWriter, timeoutMs = 185_000) {
  let cleanup: Promise<Map<string, ShellOutcome>> | undefined;
  const validPath = (t: ArchiveRow) => !t.path || t.path === `/vercel/sandbox/workspaces/${t.repositoryName}/${t.name}`;
  const linked = targets.filter((t) => t.repositoryName && validPath(t));
  const clean = () => cleanup ??= (async () => {
    const result = await run(cleanupCommand(linked), { timeoutMs: 180_000 });
    if (!result.ok) return new Map(linked.map((t) => [t.id, result]));
    const line = result.stdout.split('\n').find((line) => line.startsWith('NOTIS_ARCHIVE_RESULTS='));
    if (!line) throw new Error('Cleanup returned no receipt. Refresh before retrying.');
    const rows = JSON.parse(line.slice('NOTIS_ARCHIVE_RESULTS='.length));
    if (!Array.isArray(rows)) throw new Error('Invalid cleanup receipt.');
    return new Map<string, ShellOutcome>(rows.map((row) => [row.id, row.ok === true ? ok : failure(row.error || 'Checkout cleanup failed.')]));
  })();

  return async (target: ArchiveRow, signal: AbortSignal): Promise<ShellOutcome> => {
    if (signal.aborted) return failure('Archive cancelled.');
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    // Each wait expires independently; a late cleanup never starts a row write.
    const controller = new AbortController();
    try {
      return await Promise.race([
        (async () => {
          if (!target.repositoryName && target.path) return failure('This workspace has a checkout but no repository. Reconnect its repository before archiving.');
          if (target.repositoryName && !validPath(target)) return failure('The checkout path does not match this repository and workspace. Sync it before archiving.');
          if (target.repositoryName) {
            const result = (await clean()).get(target.id);
            if (!result?.ok) return result ?? failure('No cleanup receipt for this workspace.');
          }
          if (controller.signal.aborted) return failure('Archive wait ended. Refresh before retrying.');
          await write(target.id);
          return ok;
        })(),
        new Promise<ShellOutcome>((resolve) => {
          abort = () => {
            controller.abort();
            resolve(failure('Archive cancelled. Cleanup already started may still finish; refresh before retrying.'));
          };
          signal.addEventListener('abort', abort, { once: true });
          timer = setTimeout(() => {
            controller.abort();
            resolve(failure('Archive timed out. Cleanup may still finish; refresh before retrying.'));
          }, timeoutMs);
        }),
      ]);
    } catch (cause) {
      return failure(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (timer) clearTimeout(timer);
      if (abort) signal.removeEventListener('abort', abort);
    }
  };
}
