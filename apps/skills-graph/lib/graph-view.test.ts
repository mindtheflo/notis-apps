import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, extractLinks, STRONG_LINK_THRESHOLD, type SkillDetail } from './skill-links';
import {
  CLUSTER_COLORS,
  ISOLATED_COLOR,
  clusterColor,
  clusterSummaries,
  connectedOnly,
  isolatedNodes,
  linkRows,
  matchesQuery,
  neighbourhood,
  nodeRadius,
  rankedNodes,
} from './graph-view';

function skill(name: string, skill_md: string, description = ''): SkillDetail {
  return { id: name, name, description, skill_md, source: 'custom' };
}

const CORPUS: SkillDetail[] = [
  skill('release-launch', 'Follow `social-planning` and then `brand-images`.'),
  skill('social-planning', 'Ask `brand-images` for the visuals.'),
  skill('brand-images', 'Nothing outgoing.', 'Generates on-brand images.'),
  skill('repo-setup', 'Pairs with `repo-workspace`.'),
  skill('repo-workspace', 'Nothing outgoing.'),
  skill('lonely-skill', 'Stands alone.'),
];

const GRAPH = buildGraph(CORPUS, extractLinks(CORPUS), STRONG_LINK_THRESHOLD);

test('cluster colours cycle and isolated skills are grey', () => {
  assert.equal(clusterColor(0), CLUSTER_COLORS[0]);
  assert.equal(clusterColor(CLUSTER_COLORS.length), CLUSTER_COLORS[0]);
  assert.equal(clusterColor(-1), ISOLATED_COLOR);
});

test('node radius grows with how often a skill is referenced', () => {
  const hub = GRAPH.nodes.find((node) => node.name === 'brand-images')!;
  const leaf = GRAPH.nodes.find((node) => node.name === 'lonely-skill')!;
  assert.ok(nodeRadius(hub) > nodeRadius(leaf));
});

test('neighbourhood splits incoming from outgoing links', () => {
  const focus = GRAPH.nodes.find((node) => node.name === 'social-planning')!;
  const view = neighbourhood(GRAPH, focus.id);

  assert.deepEqual(view.outgoing.map((link) => link.targetId), ['brand-images']);
  assert.deepEqual(view.incoming.map((link) => link.sourceId), ['release-launch']);
  assert.deepEqual([...view.ids].sort(), ['brand-images', 'release-launch', 'social-planning']);
});

test('neighbourhood of nothing is empty', () => {
  const view = neighbourhood(GRAPH, null);
  assert.equal(view.ids.size, 0);
  assert.equal(view.outgoing.length, 0);
});

test('query matches names and descriptions but never an empty string', () => {
  const node = GRAPH.nodes.find((item) => item.name === 'brand-images')!;
  assert.ok(matchesQuery(node, 'BRAND'));
  assert.ok(matchesQuery(node, 'on-brand images'));
  assert.equal(matchesQuery(node, '   '), false);
  assert.equal(matchesQuery(node, 'calendar'), false);
});

test('clusters are summarised largest first with the busiest skill as anchor', () => {
  const summaries = clusterSummaries(GRAPH);
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0].size, 3);
  assert.equal(summaries[0].anchor.name, 'brand-images');
  assert.equal(summaries[1].members.length, 2);
  assert.equal(summaries[0].color, clusterColor(summaries[0].cluster));
});

test('the map graph drops unconnected skills but keeps every link', () => {
  const mapGraph = connectedOnly(GRAPH);
  assert.equal(mapGraph.nodes.length, GRAPH.nodes.length - 1);
  assert.equal(mapGraph.nodes.some((node) => node.name === 'lonely-skill'), false);
  assert.equal(mapGraph.links.length, GRAPH.links.length);
  assert.equal(mapGraph.clusterCount, GRAPH.clusterCount);
});

test('isolated skills are listed alphabetically', () => {
  assert.deepEqual(isolatedNodes(GRAPH).map((node) => node.name), ['lonely-skill']);
});

test('rankings only include skills with links in that direction', () => {
  assert.deepEqual(rankedNodes(GRAPH, 'incoming', 2).map((node) => node.name), ['brand-images', 'repo-workspace']);
  assert.equal(rankedNodes(GRAPH, 'outgoing').every((node) => node.outgoing > 0), true);
});

test('link rows resolve names and filter on names or evidence', () => {
  const rows = linkRows(GRAPH);
  assert.equal(rows.length, GRAPH.links.length);
  assert.ok(rows.every((row) => row.source.name && row.target.name));

  assert.equal(linkRows(GRAPH, 'repo-workspace').length, 1);
  assert.ok(linkRows(GRAPH, 'Ask ').length >= 1);
  assert.equal(linkRows(GRAPH, 'nothing-matches-this').length, 0);
});
