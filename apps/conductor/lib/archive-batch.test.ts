import assert from 'node:assert/strict';
import test from 'node:test';
import { batchArchiver } from './archive-batch.ts';
import type { ShellOutcome } from './shell.ts';
const targets = ['one', 'two'].map((name) => ({ id: name, name, repositoryName: 'demo', repositoryId: null }));
const receipt = (rows: unknown[]): ShellOutcome => ({ ok: true, stdout: `NOTIS_ARCHIVE_RESULTS=${JSON.stringify(rows)}`, stderr: '', exitCode: 0, error: null });

test('one shell request cleans a selection; only successful exact receipts write rows', async () => {
  let calls = 0;
  const writes: string[] = [];
  const archive = batchArchiver(async () => { calls++; return receipt([{id:'one',ok:true},{id:'two',ok:false,error:'locked'}]); }, targets, async (id) => { writes.push(id); });
  const results = await Promise.all(targets.map((t) => archive(t, new AbortController().signal)));
  assert.equal(calls, 1);
  assert.deepEqual(writes, ['one']);
  assert.deepEqual(results.map((r) => r.ok), [true, false]);
});

test('a missing receipt or rejected write never reports success', async () => {
  const missing = batchArchiver(async () => receipt([]), targets, async () => assert.fail('must not write'));
  assert.equal((await missing(targets[0], new AbortController().signal)).ok, false);
  const rejected = batchArchiver(async () => receipt([{id:'one',ok:true}]), targets, async () => { throw new Error('write refused'); });
  assert.match((await rejected(targets[0], new AbortController().signal)).error!, /write refused/);
});

test('unlinked pathless records archive without guessing or deleting a checkout', async () => {
  const row = {...targets[0], repositoryName: null};
  const writes: string[] = [];
  const archive = batchArchiver(async () => assert.fail('no shell'), [row], async (id) => { writes.push(id); });
  assert.equal((await archive(row, new AbortController().signal)).ok, true);
  assert.deepEqual(writes, ['one']);
  assert.equal((await archive({...row,path:'/some/checkout'}, new AbortController().signal)).ok, false);
});

test('cancel and timeout release hanging single or bulk waits and prevent late writes', async () => {
  for (const cancel of [true, false]) {
    let finish!: (value: ShellOutcome) => void;
    const archive = batchArchiver(async () => new Promise((resolve) => { finish = resolve; }), targets, async () => assert.fail('late write'), cancel ? 60_000 : 5);
    const controller = new AbortController();
    const waiting = archive(targets[0], controller.signal);
    if (cancel) controller.abort();
    const result = await waiting;
    assert.equal(result.ok, false);
    finish(receipt([{id:'one',ok:true}]));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
});
