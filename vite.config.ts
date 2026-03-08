import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import tsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsConfigPaths(), tailwindcss(), tanstackStart()],
  esbuild: {
    jsx: 'automatic',
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  test: {
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
