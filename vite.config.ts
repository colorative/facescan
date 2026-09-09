import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { ensureCert } from './scripts/dev-cert.mjs'

/**
 * `npm run dev:lan` sets this to serve HTTPS on every interface, so the kiosk
 * can be opened from another device. It is opt-in because plain `npm run dev`
 * on localhost needs no certificate — localhost is already a secure context.
 */
const lan = process.env.KIOSK_LAN === '1'
const tls = lan ? ensureCert({ quiet: true }) : null

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5273,
    // Bare HTTP on a LAN IP is not a secure context, so getUserMedia is
    // unavailable there — sharing over the network means sharing over HTTPS.
    // `npm run dev:lan` generates a self-signed cert covering the current LAN
    // addresses and binds every interface; `npm run dev` stays on localhost.
    host: lan,
    https: tls ? { key: tls.key, cert: tls.cert } : undefined,
  },
  build: {
    target: 'es2022',
  },
})
