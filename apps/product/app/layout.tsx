import {ShortcutProvider} from '@notis/sdk';
import './globals.css';
import './research.css';

export default function AppShell({ children }: { children: React.ReactNode }) {
  // SDK provider reuses an existing parent registry; standalone/older hosts
  // get exactly one registry and the native ? help dialog.
  return <ShortcutProvider>{children}</ShortcutProvider>;
}
