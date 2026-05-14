'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTool } from '@notis/sdk';
import type { RollDocument } from '@/lib/roll-record';
import type { Roll } from '@/lib/rng';
import { formatNumber } from '@/lib/utils';

type QueryRollsArgs = {
  database_slug: 'rolls';
  query?: {
    page_size?: number;
  };
  offset?: number;
};

type QueryRollsResult = {
  documents?: RollDocument[];
  message?: string;
  error?: string;
};

type UpsertRollArgs = {
  title: string;
  Value: number;
  Mode: Roll['mode'];
  Min: number;
  Max: number;
  'Rolled At': string;
};

type UpsertRollResult = {
  status?: string;
  document?: RollDocument;
  message?: string;
  error?: string;
};

export function useRollDocuments(pageSize?: number) {
  const queryRolls = useTool<QueryRollsArgs, QueryRollsResult>('notis-default-query');
  const [documents, setDocuments] = useState<RollDocument[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => {
    setFetchKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    queryRolls
      .call({ database_slug: 'rolls', query: { page_size: pageSize } })
      .then((result) => {
        if (cancelled) return;
        const message = result.error ?? result.message;
        if (message && !result.documents) {
          throw new Error(message);
        }
        setDocuments(result.documents ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setDocuments([]);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchKey, pageSize, queryRolls.call]);

  return {
    documents,
    loading: queryRolls.loading,
    error: queryRolls.error ?? error,
    refetch,
  };
}

export function usePersistRoll() {
  const upsertRoll = useTool<UpsertRollArgs, UpsertRollResult>('notis-default-upsert_rolls');

  const persist = useCallback(
    async (roll: Roll) => {
      const result = await upsertRoll.call({
        title: formatNumber(roll.value),
        Value: roll.value,
        Mode: roll.mode,
        Min: roll.min,
        Max: roll.max,
        'Rolled At': roll.at,
      });
      const message = result.error ?? result.message;
      if (message && result.status === 'error') {
        throw new Error(message);
      }
      return result.document ?? null;
    },
    [upsertRoll.call],
  );

  return {
    persist,
    loading: upsertRoll.loading,
    error: upsertRoll.error,
  };
}
