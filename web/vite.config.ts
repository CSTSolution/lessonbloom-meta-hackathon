import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The client's version, shown next to the logo (Son, 30 Oct: so we know which build a user has):
// v1.0.<build date and time, Hanoi>, e.g. v1.0.20261030.1415
const at = new Date(Date.now() + 7 * 36e5).toISOString();
const version = `v1.0.${at.slice(0, 10).replace(/-/g, '')}.${at.slice(11, 16).replace(':', '')}`;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  root: new URL('.', import.meta.url).pathname,
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:8080' } },
});
