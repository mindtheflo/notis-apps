'use client';

import { useCallback, useEffect, useState } from 'react';
import { useNotis, useTool } from '@notis/sdk';

import { normalizeProspect, type AffiliateProspect } from '@/lib/affiliate-data';
import { DEMO_PROSPECTS } from '@/lib/demo-prospects';

type QueryArgs = {
  database_slug: 'affiliate_prospects_1';
  query: { page_size: number };
  offset?: number;
};

type QueryResult = {
  documents?: Array<{
    id?: string;
    document_id?: string;
    title?: string;
    properties?: Record<string, unknown>;
  }>;
  error?: string;
  message?: string;
  has_more?: boolean;
  next_offset?: number | null;
};

function isDevelopmentPreview(appId?: string) {
  if (appId === 'harness-app') return true;
  if (typeof window === 'undefined') return false;
  return window.location.pathname.includes('/apps/affiliate-prospects-dev-');
}

export function useAffiliateProspects() {
  const { app } = useNotis();
  const query = useTool<QueryArgs, QueryResult>('LOCAL_NOTIS_DATABASE_QUERY');
  const [prospects, setProspects] = useState<AffiliateProspect[]>([]);
  const [localError, setLocalError] = useState<Error | null>(null);
  const [usingPreviewFixture, setUsingPreviewFixture] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLocalError(null);
    setUsingPreviewFixture(false);
    const fetchAllProspects = async () => {
      const documents: NonNullable<QueryResult['documents']> = [];
      let offset = 0;
      while (true) {
        const result = await query.call({
          database_slug: 'affiliate_prospects_1',
          query: { page_size: 500 },
          ...(offset ? { offset } : {}),
        });
        if (!result.documents && (result.error || result.message)) {
          throw new Error(result.error ?? result.message);
        }
        documents.push(...(result.documents ?? []));
        if (!result.has_more) return documents;
        if (typeof result.next_offset !== 'number' || result.next_offset <= offset) {
          throw new Error('Prospect query returned an invalid pagination offset');
        }
        offset = result.next_offset;
      }
    };

    void fetchAllProspects()
      .then((documents) => {
        if (cancelled) return;
        const normalized = documents.map(normalizeProspect);
        const shouldUsePreviewFixture = !normalized.length && isDevelopmentPreview(app?.id);
        setUsingPreviewFixture(shouldUsePreviewFixture);
        setProspects(shouldUsePreviewFixture ? DEMO_PROSPECTS : normalized);
      })
      .catch((error) => {
        if (cancelled) return;
        if (isDevelopmentPreview(app?.id)) {
          setProspects(DEMO_PROSPECTS);
          setLocalError(null);
          setUsingPreviewFixture(true);
          return;
        }
        setProspects([]);
        setUsingPreviewFixture(false);
        setLocalError(error instanceof Error ? error : new Error(String(error)));
      });
    return () => {
      cancelled = true;
    };
  }, [app?.id, fetchKey, query.call]);

  return {
    prospects,
    loading: query.loading,
    error: usingPreviewFixture ? null : query.error ?? localError,
    refetch,
  };
}
