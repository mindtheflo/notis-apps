import type { ReactNode } from 'react';
import { NotisProvider } from '@notis/sdk';
import '@notis/sdk/styles.css';
import './globals.css';

export default function AppShell({ children }: { children: ReactNode }) {
  return <NotisProvider>{children}</NotisProvider>;
}
