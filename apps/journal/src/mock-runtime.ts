import type { NotisRuntime } from '@notis/sdk';

/** Build a Notion-shape select value. */
function select(name: string) {
  return { type: 'select', select: { id: `opt_${name}`, name, color: 'gray' } };
}
function date(iso: string) {
  return { type: 'date', date: { start: iso, end: '', timezone: null } };
}
function number(n: number) {
  return { type: 'number', number: n };
}
function title(text: string) {
  return { type: 'title', title: [{ type: 'text', text: { content: text } }] };
}

function dayISO(offset: number, h = 0, m = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

type Seed = {
  name: string;
  offset: number;
  morningMood: string;
  mood: string;
  motivation: number;
  sleepiness: number;
  tasks: number;
  appetite: string;
  onset: [number, number];
  off: [number, number];
  reflection: string;
};

const SEEDS: Seed[] = [
  {
    name: 'A steady, productive day',
    offset: 0,
    morningMood: 'Good',
    mood: 'Good',
    motivation: 8,
    sleepiness: 3,
    tasks: 4,
    appetite: 'Normal',
    onset: [8, 30],
    off: [16, 0],
    reflection:
      'Woke up clear-headed. Medication kicked in fast and I got real work done before the afternoon dip. Grateful for the momentum.',
  },
  {
    name: 'Best day this week',
    offset: 1,
    morningMood: 'Amazing',
    mood: 'Amazing',
    motivation: 9,
    sleepiness: 2,
    tasks: 6,
    appetite: 'High',
    onset: [8, 0],
    off: [17, 0],
    reflection: 'Everything clicked — deep focus for hours, good food, good mood. Want more days like this.',
  },
  {
    name: 'Foggy start, strong finish',
    offset: 2,
    morningMood: 'Low',
    mood: 'Neutral',
    motivation: 5,
    sleepiness: 6,
    tasks: 2,
    appetite: 'Low',
    onset: [9, 15],
    off: [15, 30],
    reflection: 'Slow to get going and appetite was off, but the evening turned around once I got outside.',
  },
  {
    name: 'Low energy, rested anyway',
    offset: 3,
    morningMood: 'Rough',
    mood: 'Low',
    motivation: 3,
    sleepiness: 8,
    tasks: 1,
    appetite: 'Normal',
    onset: [10, 0],
    off: [14, 0],
    reflection: 'Short medication window and heavy eyes all day. Chose rest over pushing. That was the right call.',
  },
  {
    name: 'Back on track',
    offset: 4,
    morningMood: 'Neutral',
    mood: 'Good',
    motivation: 7,
    sleepiness: 4,
    tasks: 3,
    appetite: 'Normal',
    onset: [8, 45],
    off: [16, 30],
    reflection: 'Solid, unremarkable in the best way. Consistent focus and a calm evening.',
  },
];

function buildDocuments() {
  return SEEDS.map((s, i) => ({
    id: `mock_${i}`,
    title: s.name,
    content_markdown: s.reflection,
    created_time: dayISO(s.offset),
    properties: {
      Name: title(s.name),
      Date: date(dayISO(s.offset)),
      'Morning Mood': select(s.morningMood),
      'General Mood': select(s.mood),
      Motivation: number(s.motivation),
      Sleepiness: number(s.sleepiness),
      'Meaningful Tasks': number(s.tasks),
      Appetite: select(s.appetite),
      'Medication Onset': date(dayISO(s.offset, s.onset[0], s.onset[1])),
      'Medication Wore Off': date(dayISO(s.offset, s.off[0], s.off[1])),
    },
  }));
}

export function installMockRuntime(): NotisRuntime {
  const documents = buildDocuments();
  return {
    app: { id: 'mock', name: 'Journal', slug: 'notis-journal', icon: 'phosphor:notebook' } as never,
    route: { path: '/', slug: 'journal', name: 'Journal' } as never,
    databases: [] as never,
    context: {},
    navigate: (payload) => {
      // eslint-disable-next-line no-console
      console.log('[mock navigate]', payload);
      window.dispatchEvent(new CustomEvent('mock-navigate', { detail: payload }));
    },
    registerTopBarSearch: () => {},
    setTopBarSearchValue: () => {},
    setTopBarSearchLoading: () => {},
    async listTools() {
      return [];
    },
    async callTool(name: string, args?: Record<string, unknown>) {
      if (name === 'LOCAL_NOTIS_DATABASE_QUERY') {
        return { documents } as never;
      }
      if (name === 'LOCAL_NOTIS_DATABASE_UPSERT_JOURNAL_ENTRIES') {
        if (args?.operation === 'archive' && typeof args.document_id === 'string') {
          const index = documents.findIndex((document) => document.id === args.document_id);
          if (index < 0) {
            return { status: 'error', message: 'Document not found' } as never;
          }
          const [document] = documents.splice(index, 1);
          return { status: 'success', archived: true, document } as never;
        }
        return { document: { id: 'mock_new', title: String(args?.Name ?? 'Untitled'), properties: {} } } as never;
      }
      if (name === 'LOCAL_NOTIS_DATABASE_GET_DOCUMENT') {
        const match = documents.find((doc) => doc.id === args?.document_id);
        return (match ? { status: 'success', document: match } : { status: 'error', message: 'Document not found' }) as never;
      }
      return {} as never;
    },
    async request() {
      return {};
    },
  };
}
