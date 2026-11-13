import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev` uses sample data. To run against the real API locally, use `vercel dev`
// with VITE_LIVE=1 in .env.local (see README). That serves api/ alongside this front end.
export default defineConfig({
  base: './',
  plugins: [react()]
});
