'use client';

/**
 * Binds a view to the Portal's own top-bar search field.
 *
 * The portal already owns a search input, so the app never renders one — it
 * subscribes to the value and filters the rows it is about to show.
 */

import { useCallback, useMemo, useState } from 'react';
import { useTopBarSearch } from '@notis/sdk';

import type { Task } from '@/lib/tasks';

/**
 * Filtering here is an instant, local, client-side match against tasks
 * already in memory — never a submitted search — so the top-bar spinner
 * (`setLoading`) is never driven from it. See the instant-view loading
 * contract: `setLoading` is reserved for an explicit submitted search.
 */
export function useTaskSearch(placeholder: string) {
  const [query, setQuery] = useState('');
  useTopBarSearch({
    value: query,
    onChange: setQuery,
    placeholder,
  });

  const needle = useMemo(() => query.trim().toLowerCase(), [query]);

  const matches = useCallback(
    (task: Task) => {
      if (!needle) return true;
      return (
        task.title.toLowerCase().includes(needle)
        || task.description.toLowerCase().includes(needle)
        || task.labels.some((label) => label.toLowerCase().includes(needle))
      );
    },
    [needle],
  );

  return { query: needle, matches };
}
