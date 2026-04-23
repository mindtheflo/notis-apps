'use client';

import { useCallback, useState } from 'react';
import { useNotisRuntime } from '../provider';

interface UseToolResult {
  call: (args?: Record<string, unknown>) => Promise<unknown>;
  loading: boolean;
  error: Error | null;
}

/**
 * Call a specific Notis tool by name.
 *
 * ```tsx
 * const { call, loading } = useTool('notis_web_search');
 * const result = await call({ query: 'latest news' });
 * ```
 */
export function useTool(toolName: string): UseToolResult {
  const runtime = useNotisRuntime();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const call = useCallback(
    async (args?: Record<string, unknown>): Promise<unknown> => {
      if (!runtime) {
        throw new Error('Notis runtime not available. Ensure NotisProvider is mounted.');
      }

      setLoading(true);
      setError(null);

      try {
        const result = await runtime.callTool(toolName, args);
        return result;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [runtime, toolName],
  );

  return { call, loading, error };
}
