import type { NotisRuntime, RouteDescriptor } from '@notis/sdk';
import { SAMPLE_SKILLS } from './sample-skills';

export type MockRoute = 'map' | 'links';

const ROUTES: Record<MockRoute, RouteDescriptor> = {
  map: { slug: 'map', path: '/', name: 'Map', icon: 'phosphor:graph', default: true },
  links: { slug: 'links', path: '/links', name: 'Links', icon: 'phosphor:list-magnifying-glass' },
};

let currentRoute: MockRoute = 'map';
let runtimeRef: NotisRuntime | null = null;

export function setMockRoute(route: MockRoute): void {
  currentRoute = route;
  if (runtimeRef) runtimeRef.route = ROUTES[route];
}

/**
 * Dev-only runtime. It answers the declared skill-list tool with the sample
 * corpus so the preview and the vite dev server behave like the portal.
 */
export function installMockRuntime(initialRoute: MockRoute = 'map'): NotisRuntime {
  currentRoute = initialRoute;

  const runtime: NotisRuntime = {
    app: {
      id: 'dev-skill-graph',
      name: 'Skill Graph',
      icon: 'phosphor:graph',
      description: 'Dev preview — sample skills, not your account.',
    },
    route: ROUTES[initialRoute],
    databases: [],
    context: {},

    listTools: async () => [{ name: 'LOCAL_NOTIS_LIST_SKILLS' }],
    callTool: async <TResult = unknown>(name: string): Promise<TResult> => {
      if (name === 'LOCAL_NOTIS_LIST_SKILLS') {
        return {
          status: 'success',
          installed_skills: SAMPLE_SKILLS,
          curated_catalog: [],
        } as TResult;
      }
      throw new Error(`Unhandled dev tool: ${name}`);
    },

    request: async (path: string) => {
      throw new Error(`Unhandled dev request: ${path}`);
    },
  };

  runtimeRef = runtime;
  return runtime;
}

export { SAMPLE_SKILLS };
