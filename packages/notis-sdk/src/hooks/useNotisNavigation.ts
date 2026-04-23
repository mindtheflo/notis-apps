'use client';

import { useCallback } from 'react';
import { useNotisRuntime } from '../provider';

interface NavigationActions {
  /** Navigate to a route within the app by its path. */
  toRoute: (path: string) => void;
  /** Navigate to a document detail view. */
  toDocument: (documentId: string) => void;
  /** Navigate to the app's default route. */
  toApp: () => void;
}

/**
 * Navigation helpers for moving between routes and documents within the app.
 * When rendered inside the portal, uses the runtime.navigate() bridge.
 * In local preview, falls back to window.location.
 *
 * ```tsx
 * const nav = useNotisNavigation();
 * nav.toRoute('/settings');
 * ```
 */
export function useNotisNavigation(): NavigationActions {
  const runtime = useNotisRuntime();

  const toRoute = useCallback((path: string) => {
    if (runtime?.navigate) {
      runtime.navigate({ kind: 'route', path });
    } else if (typeof window !== 'undefined') {
      window.location.href = path;
    }
  }, [runtime]);

  const toDocument = useCallback((documentId: string) => {
    if (runtime?.navigate) {
      runtime.navigate({ kind: 'document', documentId });
    }
  }, [runtime]);

  const toApp = useCallback(() => {
    if (runtime?.navigate) {
      runtime.navigate({ kind: 'app' });
    }
  }, [runtime]);

  return { toRoute, toDocument, toApp };
}
