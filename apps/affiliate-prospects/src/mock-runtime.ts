import type { NotisRuntime } from '@notis/sdk';

type Route = 'dashboard' | 'prospects' | 'segments';

interface MockDocument {
  id: string;
  title: string;
  properties: Record<string, unknown>;
}

const PROSPECTS: MockDocument[] = [
  prospect('Alex Morgan', 'FlowNorth', 'Automation Agency', 'Interested', 'P0', 94, {
    Email: 'alex@flownorth.example',
    LinkedIn: 'https://linkedin.com/in/alex-morgan',
    Website: 'https://flownorth.example',
    Source: 'Zapier Solution Partner Directory',
    'Audience Size': 8200,
    'Monthly Traffic': 14000,
    'Outreach Channel': 'LinkedIn + Email',
    'Next Action': 'Send partner economics one-pager',
    'Next Action Date': '2026-07-24',
    'Last Touch Date': '2026-07-22',
  }),
  prospect('Maya Chen', 'Agent Ops Weekly', 'AI Creator', 'Replied', 'P0', 91, {
    Email: 'maya@agentopsweekly.example',
    LinkedIn: 'https://linkedin.com/in/maya-chen',
    Website: 'https://agentopsweekly.example',
    Source: 'Newsletter discovery',
    'Audience Size': 38000,
    'Monthly Traffic': 22000,
    'Outreach Channel': 'Email',
    'Next Action': 'Share creator demo kit',
    'Next Action Date': '2026-07-24',
    'Last Touch Date': '2026-07-23',
  }),
  prospect('Noah Williams', 'Automate Better', 'SEO Publisher', 'Ready for Outreach', 'P1', 88, {
    Email: 'noah@automatebetter.example',
    Website: 'https://automatebetter.example',
    Source: 'DataForSEO: Zapier alternatives',
    'Monthly Traffic': 76000,
    'Enrichment Status': 'Verified',
    'Outreach Channel': 'Email',
    'Next Action': 'Approve comparison-page pitch',
    'Next Action Date': '2026-07-25',
  }),
  prospect('Sofia Rossi', 'RevOps Circle', 'Community Educator', 'Qualified', 'P1', 86, {
    Email: 'sofia@revopscircle.example',
    LinkedIn: 'https://linkedin.com/in/sofia-rossi',
    Source: 'Community operator list',
    'Audience Size': 14500,
    'Outreach Channel': 'LinkedIn',
    'Next Action': 'Enrich sponsor history',
    'Next Action Date': '2026-07-25',
  }),
  prospect('Theo Martin', 'Notis customer', 'Customer Advocate', 'Activated', 'P0', 97, {
    Email: 'theo@example.com',
    Source: 'Rewardful + product usage',
    'Outreach Channel': 'Email',
    'Referred Signups': 19,
    'Activated Referrals': 7,
    'Attributed MRR': 1680,
    'Last Touch Date': '2026-07-21',
  }),
  prospect('Lena Fischer', 'StackPilot', 'Integration Partner', 'Applied', 'P0', 92, {
    Email: 'lena@stackpilot.example',
    LinkedIn: 'https://linkedin.com/in/lena-fischer',
    Website: 'https://stackpilot.example',
    Source: 'Integration overlap analysis',
    'Audience Size': 21000,
    'Monthly Traffic': 41000,
    'Next Action': 'Confirm co-marketing launch date',
    'Next Action Date': '2026-07-28',
  }),
  prospect('Sam Patel', 'SaaS Growth Lab', 'Affiliate Marketplace', 'Contacted', 'P1', 82, {
    Email: 'sam@saasgrowthlab.example',
    Website: 'https://saasgrowthlab.example',
    Source: 'PartnerStack marketplace',
    'Audience Size': 18000,
    'Monthly Traffic': 33000,
    'Next Action': 'Follow up with use-case proof',
    'Next Action Date': '2026-07-27',
    'Last Touch Date': '2026-07-22',
  }),
  prospect('Priya Shah', 'Nocode Founders', 'Community Educator', 'New', 'P2', 71, {
    LinkedIn: 'https://linkedin.com/in/priya-shah',
    Source: 'LinkedIn event speakers',
    'Audience Size': 9700,
    'Next Action': 'Verify audience fit',
    'Next Action Date': '2026-07-26',
  }),
  prospect('Eli Brooks', 'AI Workflow School', 'AI Creator', 'Researching', 'P1', 78, {
    Website: 'https://aiworkflowschool.example',
    Source: 'YouTube discovery',
    'Audience Size': 62000,
    'Monthly Traffic': 12000,
    'Enrichment Status': 'Pending',
    'Next Action': 'Find verified business email',
    'Next Action Date': '2026-07-24',
  }),
  prospect('Jordan Lee', 'OpsCraft', 'Automation Agency', 'Qualified', 'P1', 84, {
    Email: 'jordan@opscraft.example',
    LinkedIn: 'https://linkedin.com/in/jordan-lee',
    Source: 'Make Partner Directory',
    'Audience Size': 5400,
    'Next Action': 'Review recent client verticals',
    'Next Action Date': '2026-07-25',
  }),
  prospect('Camille Laurent', 'Productive AI', 'SEO Publisher', 'Activated', 'P0', 90, {
    Email: 'camille@productiveai.example',
    Website: 'https://productiveai.example',
    Source: 'DataForSEO: AI automation tools',
    'Monthly Traffic': 92000,
    'Referred Signups': 31,
    'Activated Referrals': 11,
    'Attributed MRR': 2940,
    'Last Touch Date': '2026-07-20',
  }),
  prospect('Marcus Reed', 'Cloud Workflows', 'Integration Partner', 'Nurture', 'P2', 69, {
    Email: 'marcus@cloudworkflows.example',
    Source: 'Integration directory',
    'Monthly Traffic': 28000,
    'Next Action': 'Revisit after API launch',
    'Next Action Date': '2026-09-01',
  }),
  prospect('Nina Okafor', 'Growth Operators', 'Affiliate Marketplace', 'Disqualified', 'P3', 38, {
    Email: 'nina@growthoperators.example',
    Source: 'impact.com marketplace',
    'Audience Size': 120000,
    Notes: 'Audience is primarily consumer coupons; no B2B SaaS fit.',
  }),
  prospect('Owen King', 'Notis customer', 'Customer Advocate', 'Contacted', 'P1', 80, {
    Email: 'owen@example.com',
    Source: 'Product usage: 25 successful workflows',
    'Next Action': 'Invite to advocate cohort',
    'Next Action Date': '2026-07-26',
    'Last Touch Date': '2026-07-23',
  }),
];

declare global {
  interface Window {
    __AFFILIATE_PROSPECTS_RUNTIME__?: NotisRuntime;
  }
}

export function installMockRuntime(initialRoute: Route = 'dashboard'): NotisRuntime {
  const runtime: NotisRuntime = {
    app: {
      id: 'dev-affiliate-prospects',
      name: 'Affiliate Prospects',
      icon: 'phosphor:users-three',
      description: 'Local development preview.',
    },
    route: routeDescriptor(initialRoute),
    databases: [],
    context: {},
    listTools: async () => [
      {
        name: 'LOCAL_NOTIS_DATABASE_QUERY',
        inputSchema: { type: 'object', properties: { database_slug: { type: 'string' } } },
      },
    ],
    callTool: async <TResult = unknown>(name: string, args?: Record<string, unknown>): Promise<TResult> => {
      if (name !== 'LOCAL_NOTIS_DATABASE_QUERY') {
        throw new Error(`Tool calls unavailable in preview (${name}).`);
      }
      const slug = typeof args?.database_slug === 'string' ? args.database_slug : '';
      return { documents: slug === 'affiliate_prospects_1' ? PROSPECTS : [] } as TResult;
    },
    request: async () => {
      throw new Error('Backend requests unavailable in preview.');
    },
    navigate: (payload) => {
      if (payload.kind !== 'route' || typeof payload.path !== 'string') return;
      const hashByPath: Record<string, string> = {
        '/': '#/',
        '/prospects': '#/prospects',
        '/segments': '#/segments',
      };
      const hash = hashByPath[payload.path];
      if (hash) window.location.hash = hash;
    },
    registerTopBarSearch: () => {},
    setTopBarSearchValue: () => {},
    setTopBarSearchLoading: () => {},
  };
  window.__AFFILIATE_PROSPECTS_RUNTIME__ = runtime;
  return runtime;
}

export function setMockRoute(route: Route) {
  if (window.__AFFILIATE_PROSPECTS_RUNTIME__) {
    window.__AFFILIATE_PROSPECTS_RUNTIME__.route = routeDescriptor(route);
  }
}

function prospect(
  name: string,
  company: string,
  segment: string,
  status: string,
  priority: string,
  fitScore: number,
  extra: Record<string, unknown>,
): MockDocument {
  return {
    id: `prospect-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    title: name,
    properties: {
      Name: name,
      Company: company,
      Segment: segment,
      Status: status,
      Priority: priority,
      'Fit Score': fitScore,
      'Enrichment Status': 'Not started',
      'Outreach Channel': '',
      'Audience Size': 0,
      'Monthly Traffic': 0,
      'Referred Signups': 0,
      'Activated Referrals': 0,
      'Attributed MRR': 0,
      'Opted Out': false,
      ...extra,
    },
  };
}

function routeDescriptor(route: Route) {
  const meta = {
    dashboard: { path: '/', name: 'Dashboard', icon: 'phosphor:squares-four', default: true },
    prospects: { path: '/prospects', name: 'Prospects', icon: 'phosphor:users', default: false },
    segments: { path: '/segments', name: 'Segments', icon: 'phosphor:circles-three-plus', default: false },
  }[route];
  return { slug: route, ...meta, parentSlug: null, collection: null };
}
