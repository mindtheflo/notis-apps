export const SEGMENTS = [
  {
    name: 'Customer Advocate',
    short: 'Customers',
    description: 'Power users and existing referrers with firsthand product credibility.',
    source: 'Rewardful + product usage',
  },
  {
    name: 'Automation Agency',
    short: 'Agencies',
    description: 'Zapier, Make, n8n, and AI automation consultants who recommend tools to clients.',
    source: 'Partner directories + LinkedIn',
  },
  {
    name: 'AI Creator',
    short: 'Creators',
    description: 'AI, productivity, and automation creators, newsletters, and educators.',
    source: 'YouTube + LinkedIn + newsletters',
  },
  {
    name: 'SEO Publisher',
    short: 'Publishers',
    description: 'Comparison sites and writers ranking for high-intent automation searches.',
    source: 'DataForSEO SERPs',
  },
  {
    name: 'Integration Partner',
    short: 'Partners',
    description: 'Complementary SaaS teams, implementation partners, and integration ecosystems.',
    source: 'Integration catalog + partner pages',
  },
  {
    name: 'Community Educator',
    short: 'Communities',
    description: 'Operators of trusted no-code, RevOps, AI, and founder communities.',
    source: 'Community directories + events',
  },
  {
    name: 'Affiliate Marketplace',
    short: 'Marketplaces',
    description: 'Experienced B2B SaaS affiliates active in curated partner marketplaces.',
    source: 'PartnerStack + impact.com',
  },
] as const;

export const PIPELINE = [
  'New',
  'Researching',
  'Qualified',
  'Ready for Outreach',
  'Contacted',
  'Replied',
  'Interested',
  'Applied',
  'Activated',
  'Nurture',
  'Disqualified',
] as const;

export type SegmentName = (typeof SEGMENTS)[number]['name'];
export type ProspectStatus = (typeof PIPELINE)[number];

export interface AffiliateProspect {
  id: string;
  name: string;
  company: string;
  segment: SegmentName;
  status: ProspectStatus;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  fitScore: number;
  email: string;
  linkedInUrl: string;
  website: string;
  source: string;
  audienceSize: number;
  trafficEstimate: number;
  enrichmentStatus: string;
  outreachChannel: string;
  nextAction: string;
  nextActionDate: string;
  lastTouchDate: string;
  referredSignups: number;
  activatedReferrals: number;
  attributedMrr: number;
  notes: string;
  optedOut: boolean;
}

interface DocumentLike {
  id?: string;
  document_id?: string;
  title?: string;
  properties?: Record<string, unknown>;
}

export function normalizeProspect(document: DocumentLike): AffiliateProspect {
  const properties = document.properties ?? {};
  return {
    id: String(document.id ?? document.document_id ?? document.title ?? crypto.randomUUID()),
    name: textValue(properties.Name) || document.title || 'Untitled prospect',
    company: textValue(properties.Company),
    segment: segmentValue(textValue(properties.Segment)),
    status: statusValue(textValue(properties.Status)),
    priority: priorityValue(textValue(properties.Priority)),
    fitScore: numberValue(properties['Fit Score']),
    email: textValue(properties.Email),
    linkedInUrl: textValue(properties.LinkedIn),
    website: textValue(properties.Website),
    source: textValue(properties.Source),
    audienceSize: numberValue(properties['Audience Size']),
    trafficEstimate: numberValue(properties['Monthly Traffic']),
    enrichmentStatus: textValue(properties['Enrichment Status']),
    outreachChannel: textValue(properties['Outreach Channel']),
    nextAction: textValue(properties['Next Action']),
    nextActionDate: dateValue(properties['Next Action Date']),
    lastTouchDate: dateValue(properties['Last Touch Date']),
    referredSignups: numberValue(properties['Referred Signups']),
    activatedReferrals: numberValue(properties['Activated Referrals']),
    attributedMrr: numberValue(properties['Attributed MRR']),
    notes: textValue(properties.Notes),
    optedOut: booleanValue(properties['Opted Out']),
  };
}

export function statusTone(status: ProspectStatus): string {
  if (status === 'Activated') return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (['Interested', 'Applied'].includes(status)) return 'bg-violet-500/10 text-violet-700 dark:text-violet-300';
  if (['Contacted', 'Replied'].includes(status)) return 'bg-sky-500/10 text-sky-700 dark:text-sky-300';
  if (['Nurture', 'Disqualified'].includes(status)) return 'bg-muted text-muted-foreground';
  return 'bg-amber-500/10 text-amber-700 dark:text-amber-300';
}

export function compactNumber(value: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function money(value: number): string {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function segmentValue(value: string): SegmentName {
  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, SegmentName> = {
    'customer advocate': 'Customer Advocate',
    'customer advocates': 'Customer Advocate',
    'automation agency': 'Automation Agency',
    'automation agencies': 'Automation Agency',
    'ai creator': 'AI Creator',
    'ai creators': 'AI Creator',
    'seo publisher': 'SEO Publisher',
    'seo publishers': 'SEO Publisher',
    'integration partner': 'Integration Partner',
    'integration partners': 'Integration Partner',
    'community educator': 'Community Educator',
    'community educators': 'Community Educator',
    'affiliate marketplace': 'Affiliate Marketplace',
    'affiliate marketplaces': 'Affiliate Marketplace',
  };
  return aliases[normalized] ?? 'Customer Advocate';
}

function statusValue(value: string): ProspectStatus {
  return (PIPELINE.find((status) => status === value) ?? 'New') as ProspectStatus;
}

function priorityValue(value: string): AffiliateProspect['priority'] {
  return value === 'P0' || value === 'P1' || value === 'P2' || value === 'P3' ? value : 'P2';
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const typed = value as Record<string, unknown>;
  if (typeof typed.url === 'string') return typed.url;
  if (typeof typed.email === 'string') return typed.email;
  if (typed.select && typeof typed.select === 'object') return String((typed.select as Record<string, unknown>).name ?? '');
  if (typed.status && typeof typed.status === 'object') return String((typed.status as Record<string, unknown>).name ?? '');
  for (const key of ['title', 'rich_text']) {
    const rows = typed[key];
    if (Array.isArray(rows)) {
      return rows
        .map((row) => {
          if (!row || typeof row !== 'object') return '';
          const record = row as Record<string, unknown>;
          if (typeof record.plain_text === 'string') return record.plain_text;
          const text = record.text as Record<string, unknown> | undefined;
          return typeof text?.content === 'string' ? text.content : '';
        })
        .join('');
    }
  }
  return '';
}

function numberValue(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && typeof (value as Record<string, unknown>).number === 'number') {
    return (value as Record<string, unknown>).number as number;
  }
  return 0;
}

function booleanValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value && typeof value === 'object') return Boolean((value as Record<string, unknown>).checkbox);
  return false;
}

function dateValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const date = (value as Record<string, unknown>).date;
  return date && typeof date === 'object' ? String((date as Record<string, unknown>).start ?? '') : '';
}
