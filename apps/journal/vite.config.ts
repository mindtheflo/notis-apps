import { notisViteConfig } from '@notis/sdk/vite';
import react from '@vitejs/plugin-react';
import appConfig from './notis.config';

const base = notisViteConfig(appConfig);

export default {
  ...base,
  plugins: [react(), ...(base.plugins || [])],
  build: {
    ...base.build,
    outDir: 'dist',
    emptyOutDir: true,
  },
};
