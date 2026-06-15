import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Standalone Vite app for the Experience Layer. NOT part of the root npm workspace.
// The project root is experience/ (so render layers under experience/* resolve
// node_modules); the HTML entry + bootstrap live in app/, set via `root`.
// No /api proxy — the Experience Layer makes no live data calls in M32.
export default defineConfig({
  root: 'app',
  plugins: [react()],
  build: {
    // Emit into experience/app/dist (relative to root = app/).
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5273,
    // Render layers live one level up from the app root (experience/components,
    // /panels, /shell, /visuals, /design, /placeholders, /contracts).
    fs: { allow: ['..'] },
  },
})
