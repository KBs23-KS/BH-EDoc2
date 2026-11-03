import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { useIsolatedTestSite } from './scripts/security-test-build-guard.mjs';

// The test target has its OWN HTML entry and never imports src/App.jsx.
const isolated = useIsolatedTestSite(process.env);
export default defineConfig({
  plugins: [react(), tailwindcss()],
  ...(isolated ? {
    root: 'security-test',
    publicDir: false,
    build: { outDir: '../dist', emptyOutDir: true },
  } : {}),
});
