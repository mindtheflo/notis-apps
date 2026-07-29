import type { AffiliateProspect, ProspectStatus, SegmentName } from '@/lib/affiliate-data';

export const DEMO_PROSPECTS: AffiliateProspect[] = [
  demo('Alex Morgan', 'FlowNorth', 'Automation Agency', 'Interested', 94, 'Zapier Solution Partner Directory', 22200, 0, 'Send partner economics one-pager'),
  demo('Maya Chen', 'Agent Ops Weekly', 'AI Creator', 'Replied', 91, 'Newsletter discovery', 60000, 0, 'Share creator demo kit'),
  demo('Noah Williams', 'Automate Better', 'SEO Publisher', 'Ready for Outreach', 88, 'DataForSEO: Zapier alternatives', 76000, 0, 'Approve comparison-page pitch'),
  demo('Sofia Rossi', 'RevOps Circle', 'Community Educator', 'Qualified', 86, 'Community operator list', 14500, 0, 'Enrich sponsor history'),
  demo('Theo Martin', 'Notis customer', 'Customer Advocate', 'Activated', 97, 'Rewardful + product usage', 0, 1680, ''),
  demo('Lena Fischer', 'StackPilot', 'Integration Partner', 'Applied', 92, 'Integration overlap analysis', 62000, 0, 'Confirm co-marketing launch date'),
  demo('Sam Patel', 'SaaS Growth Lab', 'Affiliate Marketplace', 'Contacted', 82, 'PartnerStack marketplace', 51000, 0, 'Follow up with use-case proof'),
  demo('Jordan Lee', 'OpsCraft', 'Automation Agency', 'Qualified', 84, 'Make Partner Directory', 5400, 0, 'Review recent client verticals'),
  demo('Camille Laurent', 'Productive AI', 'SEO Publisher', 'Activated', 90, 'DataForSEO: AI automation tools', 92000, 2940, ''),
  demo('Owen King', 'Notis customer', 'Customer Advocate', 'Contacted', 80, 'Product usage', 0, 0, 'Invite to advocate cohort'),
];

function demo(
  name: string,
  company: string,
  segment: SegmentName,
  status: ProspectStatus,
  fitScore: number,
  source: string,
  reach: number,
  attributedMrr: number,
  nextAction: string,
): AffiliateProspect {
  return {
    id: `demo-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name,
    company,
    segment,
    status,
    priority: fitScore >= 90 ? 'P0' : fitScore >= 75 ? 'P1' : 'P2',
    fitScore,
    email: `${name.split(' ')[0].toLowerCase()}@example.com`,
    linkedInUrl: 'https://linkedin.com',
    website: '',
    source,
    audienceSize: reach,
    trafficEstimate: 0,
    enrichmentStatus: 'Verified',
    outreachChannel: 'Email + LinkedIn',
    nextAction,
    nextActionDate: nextAction ? '2026-07-25' : '',
    lastTouchDate: '',
    referredSignups: attributedMrr ? 12 : 0,
    activatedReferrals: attributedMrr ? 5 : 0,
    attributedMrr,
    notes: '',
    optedOut: false,
  };
}
