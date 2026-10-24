import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const codespaceName = process.env.CODESPACE_NAME
const forwardingDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ?? 'app.github.dev'
const phoneHost = codespaceName ? `${codespaceName}-5173.${forwardingDomain}` : undefined

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: phoneHost ? [phoneHost] : [],
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
})
