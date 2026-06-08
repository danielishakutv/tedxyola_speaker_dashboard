import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Dev-only: forward /api calls and WebSocket to the backend so the frontend
  // can use relative URLs (same as production behind a reverse proxy).
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
      // WebSocket proxy — Vite forwards ws:// upgrade requests to the backend
      '/ws': {
        target: 'ws://localhost:5000',
        ws: true,
        rewrite: (path) => path.replace(/^\/ws/, ''),
      },
    },
  },
})
