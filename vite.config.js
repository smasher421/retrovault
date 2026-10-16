import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = `http://localhost:${env.PORT || '3001'}`
  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target: apiTarget,
          // Preserve the browser origin for the API's account-linking checks.
          changeOrigin: false,
        },
        '/auth': {
          target: apiTarget,
        },
      },
    },
  }
})
