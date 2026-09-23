import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGraph,
  extractLinks,
  fencedRanges,
  graphStats,
  stripFrontmatter,
  STRONG_LINK_THRESHOLD,
  type SkillDetail,
} from './skill-links';

function skill(name: string, skill_md: string, description = ''): SkillDetail {
  return { id: name, name, description, skill_md, source: 'custom' };
}

function linkBetween(links: ReturnType<typeof extractLinks>, from: string, to: string) {
  return links.find((link) => link.sourceId === from && link.targetId === to);
}

test('strips frontmatter but keeps the body', () => {
  const body = stripFrontmatter('---\nname: a\ndescription: b\n---\n# Title\ntext');
  assert.equal(body, '# Title\ntext');
  assert.equal(stripFrontmatter('# Title'), '# Title');
});

test('fenced ranges cover opening and closing fences', () => {
  const text = 'before\n```bash\nnpm run dev\n```\nafter';
  const [range] = fencedRanges(text);
  assert.ok(range);
  assert.ok(text.slice(range[0], range[1]).includes('npm run dev'));
  assert.ok(!text.slice(range[0], range[1]).includes('after'));
});

test('an unterminated fence swallows the rest of the document', () => {
  const [range] = fencedRanges('intro\n```\ncode forever');
  assert.deepEqual(range, [6, 'intro\n```\ncode forever'.length]);
});

test('slash commands, bundle paths, backticks and "skill" all score above plain prose', () => {
  const skills = [
    skill('runner', [
      'Use `/deep-clean` when the workspace is dirty.',
      'Scripts live in .agents/skills/deep-clean and are shared.',
      'Hand off to `deep-clean` after the build.',
      'The **deep-clean** skill owns the retention window.',
      'Nothing here mentions deep clean in passing.',
    ].join('\n')),
    skill('deep-clean', 'Cleans things.'),
  ];

  const link = linkBetween(extractLinks(skills), 'runner', 'deep-clean');
  assert.ok(link);
  assert.equal(link.confidence, 1);
  const kinds = new Set(link.evidence.map((item) => item.kind));
  assert.ok(kinds.has('path'));
  assert.ok(kinds.has('command'));
  assert.ok(kinds.has('code'));
  assert.equal(link.evidence[0].snippet.length > 0, true);
});

test('a one-word skill name only links when the context marks it as a skill', () => {
  const skills = [
    skill('caller', 'Run the design system audit, then the CLI.'),
    skill('mentions-design', 'Hand off to the `design` skill for layout work.'),
    skill('design', 'Design guidance.'),
  ];
  const links = extractLinks(skills);

  assert.equal(linkBetween(links, 'caller', 'design'), undefined);
  assert.ok(linkBetween(links, 'mentions-design', 'design'));
});

test('a capitalised word does not match a lowercase one-word skill name', () => {
  const skills = [
    skill('caller', 'All calls go through the `CLI`, never the desktop bridge.'),
    skill('cli', 'CLI usage.'),
  ];
  assert.equal(extractLinks(skills).length, 0);
});

test('names inside fenced code blocks are ignored', () => {
  const skills = [
    skill('caller', 'Install it:\n\n```bash\nnpm install deep-clean\n```\n'),
    skill('deep-clean', 'Cleans things.'),
  ];
  assert.equal(extractLinks(skills).length, 0);
});

test('a hyphenated name mentioned in prose is kept as a weak link', () => {
  const skills = [
    skill('caller', 'The deep-clean pass runs nightly.'),
    skill('deep-clean', 'Cleans things.'),
  ];
  const link = linkBetween(extractLinks(skills), 'caller', 'deep-clean');
  assert.ok(link);
  assert.ok(link.confidence < STRONG_LINK_THRESHOLD);
});

test('descriptions are scanned and a skill never links to itself', () => {
  const skills = [
    skill('caller', 'Body says nothing.', 'Runs after deep-clean finishes.'),
    skill('deep-clean', 'Cleans things.', 'Also mentions deep-clean itself.'),
  ];
  const links = extractLinks(skills);
  assert.equal(links.length, 1);
  assert.equal(links[0].evidence[0].kind, 'description');
  assert.equal(links[0].evidence[0].origin, 'description');
});

test('frontmatter metadata does not create links', () => {
  const skills = [
    skill('caller', '---\nname: caller\ndescription: pairs with deep-clean\n---\n# Caller\nNothing else.'),
    skill('deep-clean', 'Cleans things.'),
  ];
  assert.equal(extractLinks(skills).length, 0);
});

test('graph keeps only links above the threshold and counts degrees', () => {
  const skills = [
    skill('alpha', 'Hand off to `beta` when done.\nThe gamma-runner pass is unrelated prose.'),
    skill('beta', 'Nothing.'),
    skill('gamma-runner', 'Nothing.'),
    skill('lonely', 'Nothing.'),
  ];
  const links = extractLinks(skills);
  const graph = buildGraph(skills, links, STRONG_LINK_THRESHOLD);

  assert.equal(graph.links.length, 1);
  assert.equal(graph.nodes.find((node) => node.id === 'alpha')?.outgoing, 1);
  assert.equal(graph.nodes.find((node) => node.id === 'beta')?.incoming, 1);
  assert.equal(graph.nodes.find((node) => node.id === 'lonely')?.cluster, -1);
  assert.equal(graph.nodes.find((node) => node.id === 'alpha')?.cluster, 0);
  assert.equal(graph.clusterCount, 1);

  const all = buildGraph(skills, links, 0);
  assert.equal(all.links.length, 2);
  assert.equal(all.clusterCount, 1);
});

test('clusters are numbered from the largest component down', () => {
  const skills = [
    skill('alpha', 'Uses `beta`.'),
    skill('beta', 'Uses `gamma`.'),
    skill('gamma', 'Nothing.'),
    skill('delta', 'Uses `epsilon`.'),
    skill('epsilon', 'Nothing.'),
  ];
  const graph = buildGraph(skills, extractLinks(skills), STRONG_LINK_THRESHOLD);
  const clusterOf = (id: string) => graph.nodes.find((node) => node.id === id)?.cluster;

  assert.equal(clusterOf('alpha'), 0);
  assert.equal(clusterOf('gamma'), 0);
  assert.equal(clusterOf('delta'), 1);
  assert.equal(graph.clusterCount, 2);
});

test('stats report isolated skills and the busiest hubs', () => {
  const skills = [
    skill('a', 'Uses `hub`.'),
    skill('b', 'Uses `hub`.'),
    skill('hub', 'Nothing.'),
    skill('lonely', 'Nothing.'),
  ];
  const stats = graphStats(buildGraph(skills, extractLinks(skills), STRONG_LINK_THRESHOLD));

  assert.equal(stats.skills, 4);
  assert.equal(stats.links, 2);
  assert.equal(stats.connected, 3);
  assert.equal(stats.isolated, 1);
  assert.equal(stats.mostReferenced?.name, 'hub');
  assert.equal(stats.mostReferencing?.outgoing, 1);
});

test('stats report no hub when nothing is linked', () => {
  const stats = graphStats(buildGraph([skill('a', 'Nothing.')], [], STRONG_LINK_THRESHOLD));
  assert.equal(stats.mostReferenced, null);
  assert.equal(stats.mostReferencing, null);
});
