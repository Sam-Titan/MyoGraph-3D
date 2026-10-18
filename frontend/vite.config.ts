/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Fixed dev ports so this app never collides with other projects (override: make dev WEB_PORT=... API_PORT=...).
const webPort = Number(process.env.WEB_PORT ?? 5180)
const apiPort = Number(process.env.API_PORT ?? 8010)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  server: {
    port: webPort,
    strictPort: true, // fail loudly instead of silently moving to another port
    proxy: { '/api': `http://localhost:${apiPort}` },
  },
  // `vite preview` serves the production build for Lighthouse; it needs the same API proxy.
  preview: {
    port: Number(process.env.PREVIEW_PORT ?? 4180),
    strictPort: true,
    proxy: { '/api': `http://localhost:${apiPort}` },
  },
})
