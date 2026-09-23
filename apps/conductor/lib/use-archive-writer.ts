'use client';
import { useCallback } from 'react';
import { useTool } from '@notis/sdk';

export function useArchiveWriter() {
  const { call } = useTool<Record<string, unknown>, { status?: string; message?: string; document_id?: string; document?: { id?: string } }>('LOCAL_NOTIS_DATABASE_UPSERT_ROW');
  return useCallback(async (id: string) => {
    const result = await call({ database_slug: 'workspaces', operation: 'update', document_id: id, properties: { Status: 'Archived' } });
    if (result?.status !== 'success' || result.document?.id !== id) throw new Error(result?.message || 'Could not confirm the archive record. Refresh before retrying.');
  }, [call]);
}
