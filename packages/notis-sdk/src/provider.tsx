'use client';

import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { NotisRuntime } from './runtime';
import { getRuntime } from './runtime';

const NotisContext = createContext<NotisRuntime | null>(null);

/**
 * Provides the Notis runtime context to all child components. Place this in
 * your root layout so that hooks like useDatabase, useTool, etc. can access
 * the platform bridge.
 *
 * During `next dev` (no runtime injected), hooks return safe defaults (empty
 * arrays, null values). During `notis apps preview` and in the portal, the
 * runtime is fully functional.
 */
export function NotisProvider({ children, runtime }: { children: ReactNode; runtime?: NotisRuntime | null }) {
  const [resolvedRuntime, setResolvedRuntime] = useState<NotisRuntime | null>(runtime ?? null);

  useEffect(() => {
    // If runtime was passed as a prop (portal component rendering), use it directly.
    // Otherwise fall back to window.__NOTIS_RUNTIME__ (local dev / preview).
    if (runtime !== undefined) {
      setResolvedRuntime(runtime);
    } else {
      setResolvedRuntime(getRuntime());
    }
  }, [runtime]);

  return (
    <NotisContext.Provider value={resolvedRuntime}>
      {children}
    </NotisContext.Provider>
  );
}

/**
 * Returns the raw NotisRuntime or null if not yet available.
 * Prefer the typed hooks (useDatabase, useTool, etc.) over this.
 */
export function useNotisRuntime(): NotisRuntime | null {
  return useContext(NotisContext);
}
