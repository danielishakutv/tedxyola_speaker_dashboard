import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Dev-only: forward /api calls to the backend so the frontend can use
  // relative URLs (same as production behind a reverse proxy).
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
