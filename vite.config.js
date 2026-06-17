import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Dev server only (npm run dev). `true` allows any Host header so you can reach the
    // hot-reload server via a LAN IP, .local name, or Tailscale name without editing this.
    // Production (docker / node server.js) doesn't use Vite, so this has no prod effect.
    allowedHosts: true
  }
})
