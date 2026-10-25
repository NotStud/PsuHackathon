import { existsSync, readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const codespaceName = process.env.CODESPACE_NAME
const forwardingDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ?? 'app.github.dev'
const phoneHost = codespaceName ? `${codespaceName}-5173.${forwardingDomain}` : undefined
// Phones only allow the camera over HTTPS. With a self-signed cert in .cert/ (made with
// openssl, like trigger_camera/serve.py), the dev server serves HTTPS on your Wi-Fi.
const cert = existsSync('.cert/cert.pem') && existsSync('.cert/key.pem')
  ? { cert: readFileSync('.cert/cert.pem'), key: readFileSync('.cert/key.pem') }
  : undefined

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    https: cert,
    allowedHosts: phoneHost ? [phoneHost] : [],
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
})
