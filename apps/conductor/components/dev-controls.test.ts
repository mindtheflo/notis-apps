import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('./dev-controls.tsx', import.meta.url), 'utf8');

test('workspace cards do not start a sandbox status command merely by rendering', () => {
  const effects = [...source.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[[^\]]*\]\);/g)]
    .map((match) => match[1]);

  assert.equal(effects.some((effect) => effect.includes('readStatus()')), false);
});

test('unknown workspace state requires an explicit status check before start', () => {
  assert.match(source, /status === null \? \([\s\S]*?Check dev/);
  assert.match(source, /onClick=\{\(\) => void check\(\)\}/);
  assert.match(source, /if \(next\.state === 'starting'\) await waitForEntry\(generation\)/);
});

test('an open failure refreshes status so idle-stopped servers can restart', () => {
  const openStart = source.indexOf('const open = useCallback');
  const activeStart = source.indexOf('const active =', openStart);
  const openBody = source.slice(openStart, activeStart);

  assert.match(openBody, /const refreshed = await readStatus\(\)/);
  assert.match(openBody, /setStatus\(refreshed \|\|/);
});
