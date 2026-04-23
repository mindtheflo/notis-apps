import { notisViteConfig } from '@notis/sdk/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import appConfig from './notis.config';

const base = notisViteConfig(appConfig);

export default defineConfig({
  ...base,
  plugins: [react(), ...((base.plugins as never[]) ?? [])],
  build: {
    ...base.build,
    outDir: 'dist',
    emptyOutDir: true,
  },
});
