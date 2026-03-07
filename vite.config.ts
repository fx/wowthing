import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import tsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsConfigPaths(), tanstackStart()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
