import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev` uses sample data by default.
// Set VITE_LIVE=1 in .env.local to proxy api.php to the real server instead
// (requests you submit will then be real).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_API_TARGET || 'http://arc50.duckdns.org';
  return {
    base: './', // relative paths, so dist/ can be dropped into any folder on the server
    plugins: [react()],
    server: {
      proxy: env.VITE_LIVE === '1' ? { '/api.php': { target, changeOrigin: true } } : undefined
    }
  };
});
