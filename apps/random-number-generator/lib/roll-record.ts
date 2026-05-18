import type { Mode } from '@/lib/rng';

export interface RollDocument {
  id: string;
  title: string;
  properties?: Record<string, unknown>;
  createdAt?: string | null;
  created_at?: string | null;
  created_time?: string | null;
  lastEditedTime?: string | null;
  last_edited_time?: string | null;
  updated_at?: string | null;
}

function readString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.name === 'string') {
      return record.name;
    }
    if (typeof record.start === 'string') {
      return record.start;
    }
  }
  return null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const stringValue = readString(value);
  if (!stringValue) {
    return null;
  }
  const parsed = Number(stringValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function readMode(value: unknown): Mode {
  const raw = readString(value)?.toLowerCase();
  if (raw === 'integer' || raw === 'decimal' || raw === 'dice') {
    return raw;
  }
  return 'integer';
}

function readTimestamp(doc: RollDocument): string {
  return (
    readString(doc.properties?.['Rolled At']) ||
    doc.createdAt ||
    doc.created_at ||
    doc.created_time ||
    doc.lastEditedTime ||
    doc.last_edited_time ||
    doc.updated_at ||
    ''
  );
}

function sortTimestamp(value: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface RollRecord {
  id: string;
  value: number;
  mode: Mode;
  min: number | null;
  max: number | null;
  at: string;
}

export function normalizeRollRecord(doc: RollDocument): RollRecord {
  const value =
    readNumber(doc.properties?.['Value']) ??
    readNumber(doc.properties?.['Name']) ??
    readNumber(doc.title) ??
    0;

  return {
    id: doc.id,
    value,
    mode: readMode(doc.properties?.['Mode']),
    min: readNumber(doc.properties?.['Min']),
    max: readNumber(doc.properties?.['Max']),
    at: readTimestamp(doc),
  };
}

export function sortRollRecordsDesc(a: RollRecord, b: RollRecord): number {
  return sortTimestamp(b.at) - sortTimestamp(a.at);
}
