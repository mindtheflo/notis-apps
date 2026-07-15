import react from '@vitejs/plugin-react';

export default {
  plugins: [react()],
  build: {
    lib: {
      entry: '.notis/_entry.tsx',
      formats: ['es'] as const,
      fileName: () => 'app.js',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
      output: {
        globals: {
          react: 'window.React',
          'react-dom': 'window.ReactDOM',
          'react-dom/client': 'window.ReactDOMClient',
          'react/jsx-runtime': 'window.React',
        },
        assetFileNames: 'app[extname]',
        inlineDynamicImports: true,
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
  },
  resolve: {
    alias: {
      '@': process.cwd(),
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
};
