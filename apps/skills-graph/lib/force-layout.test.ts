import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRandom,
  hashSeed,
  initialLayout,
  layoutBounds,
  settleLayout,
  type LayoutEdge,
} from './force-layout';

const OPTIONS = { width: 800, height: 600 };

function nodes(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `skill-${index}`,
    cluster: index < 4 ? 0 : -1,
    degree: index < 4 ? 2 : 0,
  }));
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

test('the same ids always produce the same starting positions', () => {
  const first = initialLayout(nodes(6), OPTIONS);
  const second = initialLayout(nodes(6), OPTIONS);
  assert.deepEqual(first, second);
  assert.notEqual(hashSeed(['a']), hashSeed(['b']));
});

test('the seeded random stream is reproducible and bounded', () => {
  const random = createRandom(42);
  const values = [random(), random(), random()];
  const replay = createRandom(42);
  assert.deepEqual(values, [replay(), replay(), replay()]);
  assert.ok(values.every((value) => value >= 0 && value < 1));
});

test('settling keeps every node inside the canvas and finite', () => {
  const layout = settleLayout(initialLayout(nodes(12), OPTIONS), [], OPTIONS, 120);
  for (const node of layout) {
    assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y));
    assert.ok(node.x >= 24 && node.x <= OPTIONS.width - 24);
    assert.ok(node.y >= 24 && node.y <= OPTIONS.height - 24);
  }
});

test('linked nodes settle closer than unlinked ones', () => {
  const edges: LayoutEdge[] = [{ sourceId: 'skill-0', targetId: 'skill-1', strength: 1 }];
  const layout = settleLayout(initialLayout(nodes(8), OPTIONS), edges, OPTIONS, 300);
  const byId = new Map(layout.map((node) => [node.id, node]));

  const linked = distance(byId.get('skill-0')!, byId.get('skill-1')!);
  const others = layout
    .filter((node) => node.id !== 'skill-0' && node.id !== 'skill-1')
    .map((node) => distance(byId.get('skill-0')!, node));

  assert.ok(linked < Math.min(...others), `linked ${linked} should be closest`);
});

test('unconnected skills settle further from the centre than linked ones', () => {
  const edges: LayoutEdge[] = [
    { sourceId: 'skill-0', targetId: 'skill-1', strength: 1 },
    { sourceId: 'skill-1', targetId: 'skill-2', strength: 1 },
    { sourceId: 'skill-2', targetId: 'skill-3', strength: 1 },
  ];
  const layout = settleLayout(initialLayout(nodes(10), OPTIONS), edges, OPTIONS, 400);
  const centre = { x: OPTIONS.width / 2, y: OPTIONS.height / 2 };
  const radius = (id: string) => distance(layout.find((node) => node.id === id)!, centre);

  const linked = Math.max(...['skill-0', 'skill-1', 'skill-2', 'skill-3'].map(radius));
  const unlinked = Math.min(...['skill-4', 'skill-5', 'skill-9'].map(radius));

  assert.ok(unlinked > linked, `unlinked ${unlinked} should sit outside linked ${linked}`);
});

test('pinned nodes do not move', () => {
  const layout = initialLayout(nodes(5), OPTIONS);
  layout[0].pinned = true;
  const start = { x: layout[0].x, y: layout[0].y };
  settleLayout(layout, [], OPTIONS, 50);
  assert.deepEqual({ x: layout[0].x, y: layout[0].y }, start);
});

test('bounds wrap the settled nodes with padding', () => {
  const layout = settleLayout(initialLayout(nodes(6), OPTIONS), [], OPTIONS, 60);
  const bounds = layoutBounds(layout, 40);
  assert.ok(bounds.minX <= Math.min(...layout.map((node) => node.x)) - 39);
  assert.ok(bounds.maxY >= Math.max(...layout.map((node) => node.y)) + 39);
  assert.deepEqual(layoutBounds([], 10), { minX: 0, minY: 0, maxX: 1, maxY: 1 });
});
