// Dev entrypoint: mounts the app pages with a tiny hash-router and the mock
// runtime. Not used in production — `vite build` uses .notis/_entry.tsx.
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NotisProvider } from '@notis/sdk';
import AppShell from '../app/layout';
import MapPage from '../app/page';
import LinksPage from '../app/links/page';
import { installMockRuntime, setMockRoute, type MockRoute } from './mock-runtime';

function hashRoute(): MockRoute {
  return window.location.hash === '#/links' ? 'links' : 'map';
}

const runtime = installMockRuntime(hashRoute());

function DevApp() {
  const [route, setRoute] = useState<MockRoute>(hashRoute());

  useEffect(() => {
    const onChange = () => {
      const next = hashRoute();
      setRoute(next);
      setMockRoute(next);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const Page = route === 'links' ? LinksPage : MapPage;

  return (
    <AppShell>
      <div className="px-4 pt-4">
        <nav className="flex w-fit items-center gap-2 rounded-full border border-border bg-card p-1 text-sm">
          {(['map', 'links'] as MockRoute[]).map((item) => (
            <a
              key={item}
              href={item === 'map' ? '#/' : '#/links'}
              className={
                (route === item ? 'bg-accent text-accent-foreground ' : 'text-muted-foreground hover:text-foreground ') +
                'rounded-full px-3 py-1 transition'
              }
            >
              {item === 'map' ? 'Map' : 'Links'}
            </a>
          ))}
          <span className="pl-2 pr-3 text-[10px] uppercase tracking-wide text-muted-foreground">dev preview</span>
        </nav>
      </div>
      <Page />
    </AppShell>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing from index.html');
createRoot(root).render(
  <StrictMode>
    <NotisProvider runtime={runtime}>
      <DevApp />
    </NotisProvider>
  </StrictMode>,
);
