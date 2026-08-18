import type { NotisRuntime } from '@notis/sdk';

// The same canned responses the verify harness and the screenshot capture use.
// Keeping one source of stub data means the local `vite` preview cannot drift
// away from what those two check.
import fixtures from '../metadata/screenshot-fixtures.json';

type ToolFixtures = Record<string, unknown>;
type FixtureFile = {
  tools?: ToolFixtures;
  scenarios?: Record<string, { tools?: ToolFixtures }>;
};

/**
 * Tool fixtures for one preview, with a named scenario's overrides layered on
 * top per key -- the same shallow merge the CLI harness applies so the preview
 * cannot drift from a captured screenshot.
 */
function resolveTools(scenario: string | null): ToolFixtures {
  const file = fixtures as FixtureFile;
  const base = file.tools ?? {};
  const overrides = scenario ? file.scenarios?.[scenario]?.tools ?? {} : {};
  return { ...base, ...overrides };
}

/** Scenario selected by `?scenario=` on the preview URL. */
function currentScenario(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('scenario') || null;
}

/**
 * Resolve a canned response the way the harness does: a key scoped to one
 * argument (`TOOL#database_slug=workspaces`) wins, and the bare tool name is
 * the fallback.
 */
function lookup(tools: ToolFixtures, name: string, args: Record<string, unknown>): unknown {
  for (const key of Object.keys(tools)) {
    const separator = key.indexOf('#');
    if (separator === -1 || key.slice(0, separator) !== name) continue;
    const scope = key.slice(separator + 1);
    const equals = scope.indexOf('=');
    if (equals === -1) continue;
    if (String(args[scope.slice(0, equals)]) === scope.slice(equals + 1)) {
      return tools[key];
    }
  }
  return Object.prototype.hasOwnProperty.call(tools, name) ? tools[name] : undefined;
}

export function installMockRuntime(scenario: string | null = currentScenario()): NotisRuntime {
  const tools = resolveTools(scenario);
  return {
    app: {
      id: 'dev-workspaces',
      name: 'Conductor',
      icon: 'phosphor:git-branch',
      description: 'Dev preview - seeded repository and workspace data.',
    },
    route: {
      slug: 'workspaces',
      path: '/',
      name: 'Workspaces',
      icon: 'phosphor:git-branch',
      parentSlug: null,
      default: true,
      collection: null,
    },
    databases: [],
    context: { screenshotScenario: scenario },
    // The dev preview has no change feed: subscriptions are inert and
    // `useDatabaseSubscription` reports live=false.
    subscribeDatabase: () => () => {},
    // No manager chat in the preview either: the handover is logged so the
    // wiring is visible, and reported as drafted.
    handover: async (payload) => {
      console.info('[dev preview] handover', payload);
      return { status: 'drafted' as const };
    },
    // No cloud computer behind the preview: `useCloudComputer` takes the same
    // fallback branch a user without one would see.
    cloudComputerFacts: async () => ({
      available: false,
      reason: 'unsupported_host',
      sandbox: null,
      cli_auth: {
        gh: { authenticated: null, account: null, checked_at: null, reason: 'unsupported_host' },
      },
    }),
    listTools: async () => [
      { name: 'LOCAL_NOTIS_DATABASE_QUERY', inputSchema: { type: 'object', properties: {} } },
    ],
    callTool: async <TResult = unknown>(
      name: string,
      args?: Record<string, unknown>,
    ): Promise<TResult> => {
      const result = lookup(tools, name, args ?? {});
      if (result === undefined) {
        throw new Error(`No dev-preview fixture for ${name} with ${JSON.stringify(args)}`);
      }
      return structuredClone(result) as TResult;
    },
    request: async () => {
      throw new Error('Backend requests are unavailable in the dev preview.');
    },
  };
}
