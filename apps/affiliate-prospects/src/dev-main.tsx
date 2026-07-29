import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NotisProvider } from '@notis/sdk';

import AppShell from '../app/layout';
import DashboardPage from '../app/page';
import ProspectsPage from '../app/prospects/page';
import SegmentsPage from '../app/segments/page';
import { installMockRuntime, setMockRoute } from './mock-runtime';

type Route = 'dashboard' | 'prospects' | 'segments';
const runtime = installMockRuntime(hashRoute());

function hashRoute(): Route {
  if (window.location.hash === '#/prospects') return 'prospects';
  if (window.location.hash === '#/segments') return 'segments';
  return 'dashboard';
}

function DevApp() {
  const [route, setRoute] = useState<Route>(hashRoute());
  useEffect(() => {
    const onChange = () => {
      const next = hashRoute();
      setRoute(next);
      setMockRoute(next);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const Page = route === 'prospects' ? ProspectsPage : route === 'segments' ? SegmentsPage : DashboardPage;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 pt-4">
        <nav className="flex w-fit items-center gap-1 rounded-lg border border-border bg-card p-1 text-sm">
          {([
            ['dashboard', '#/', 'Dashboard'],
            ['prospects', '#/prospects', 'Prospects'],
            ['segments', '#/segments', 'Segments'],
          ] as const).map(([id, href, label]) => (
            <a
              key={id}
              href={href}
              className={
                (route === id ? 'bg-muted text-foreground ' : 'text-muted-foreground hover:text-foreground ') +
                'min-h-9 rounded-md px-3 py-2 transition'
              }
            >
              {label}
            </a>
          ))}
          <span className="hidden pl-2 pr-3 text-[10px] uppercase tracking-wide text-muted-foreground sm:inline">
            dev preview
          </span>
        </nav>
      </div>
      <Page />
    </AppShell>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing');
createRoot(root).render(
  <StrictMode>
    <NotisProvider runtime={runtime}>
      <DevApp />
    </NotisProvider>
  </StrictMode>,
);
