import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  // For GitHub Pages: set base to '/<repo-name>/' when deploying
  // e.g., base: '/Way_point_agents-main/'
  // Leave as '/' for local dev or custom domain
  base: process.env.GITHUB_PAGES === 'true'
    ? '/Way_point_agents-main/'
    : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
