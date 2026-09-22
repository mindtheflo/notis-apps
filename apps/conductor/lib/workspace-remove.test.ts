import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const exec = promisify(execFile);
const workspaceScript = fileURLToPath(new URL('../skills/workspaces-shared/scripts/workspace.sh', import.meta.url));

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'conductor-remove-'));
  const repositories = join(root, 'repositories');
  const workspaces = join(root, 'workspaces');
  const repository = join(repositories, 'demo');
  const rowsLog = join(root, 'rows.log');
  const rows = join(root, 'rows.sh');
  await mkdir(repository, { recursive: true });
  await mkdir(workspaces, { recursive: true });
  await exec('git', ['init', '-q', repository]);
  await exec('git', ['-C', repository, 'config', 'user.email', 'test@example.com']);
  await exec('git', ['-C', repository, 'config', 'user.name', 'Conductor Test']);
  await writeFile(join(repository, 'README.md'), 'fixture\n');
  await exec('git', ['-C', repository, 'add', 'README.md']);
  await exec('git', ['-C', repository, 'commit', '-qm', 'fixture']);
  await writeFile(rows, `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$NOTIS_ROWS_LOG"
if [ "$1" = "get" ]; then
  printf '{"document_id":"repo-row"}\\n'
fi
`);
  await chmod(rows, 0o700);
  return {
    repository,
    workspaces,
    rowsLog,
    env: {
      ...process.env,
      NOTIS_REPOS_ROOT: repositories,
      NOTIS_TREES_ROOT: workspaces,
      NOTIS_ROWS_COMMAND: rows,
      NOTIS_ROWS_LOG: rowsLog,
    },
  };
}

test('remove archives a stale row whose checkout is already gone', async () => {
  const state = await fixture();
  const result = await exec('bash', [workspaceScript, 'remove', 'demo', 'stale'], { env: state.env });

  assert.match(result.stdout, /removed .*\/demo\/stale \(branch kept\)/);
  assert.match(await readFile(state.rowsLog, 'utf8'), /set workspaces --name stale .*Status=Archived/);
});

test('remove deletes a registered worktree, keeps its branch, then archives its row', async () => {
  const state = await fixture();
  const target = join(state.workspaces, 'demo', 'live');
  await mkdir(dirname(target), { recursive: true });
  await exec('git', ['-C', state.repository, 'worktree', 'add', '-q', '-b', 'notis/live', target]);

  await exec('bash', [workspaceScript, 'remove', 'demo', 'live'], { env: state.env });

  await assert.rejects(access(target));
  await exec('git', ['-C', state.repository, 'show-ref', '--verify', '--quiet', 'refs/heads/notis/live']);
  assert.match(await readFile(state.rowsLog, 'utf8'), /set workspaces --name live .*Status=Archived/);
});

test('remove archives the exact row it was given without looking a repository up', async () => {
  const state = await fixture();
  const target = join(state.workspaces, 'demo', 'live');
  await mkdir(dirname(target), { recursive: true });
  await exec('git', ['-C', state.repository, 'worktree', 'add', '-q', '-b', 'notis/live', target]);

  await exec('bash', [
    workspaceScript, 'remove', 'demo', 'live',
    '--repo-id', '00000000-0000-4000-8000-0000000000aa',
    '--row-id', '00000000-0000-4000-8000-0000000000bb',
  ], { env: state.env });

  await assert.rejects(access(target));
  const log = await readFile(state.rowsLog, 'utf8');
  assert.match(log, /set workspaces --id 00000000-0000-4000-8000-0000000000bb .*Status=Archived/);
  assert.doesNotMatch(log, /get repositories/);
});

test('remove refuses an identifier that is not a row id', async () => {
  const state = await fixture();

  await assert.rejects(
    exec('bash', [workspaceScript, 'remove', 'demo', 'stale', '--row-id', 'x; rm -rf /'], { env: state.env }),
    (error: { stderr?: string }) => /invalid workspace row id/.test(error.stderr ?? ''),
  );
});

test('checkout-only removes a real tree and preserves its branch without nested database calls', async () => {
  const state = await fixture();
  const target = join(state.workspaces, 'demo', 'only');
  await mkdir(dirname(target), { recursive: true });
  await exec('git', ['-C', state.repository, 'worktree', 'add', '-q', '-b', 'notis/only', target]);
  await exec('bash', [workspaceScript, 'remove', 'demo', 'only', '--checkout-only'], { env: state.env });
  await assert.rejects(access(target));
  await assert.rejects(access(state.rowsLog));
  await exec('git', ['-C', state.repository, 'show-ref', '--verify', '--quiet', 'refs/heads/notis/only']);
});
