import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '')
  const apiBaseUrl = environment.SWU_DB_API_BASE_URL?.replace(/\/+$/, '')
  const appServerUrl =
    environment.APP_SERVER_URL ??
    `http://127.0.0.1:${environment.APP_SERVER_PORT || '8787'}`

  if (!apiBaseUrl) {
    throw new Error('Missing required environment variable: SWU_DB_API_BASE_URL')
  }

  const swuDbProxy = {
    '/api/swu-db': {
      target: apiBaseUrl,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api\/swu-db/, ''),
    },
    '/api/features': {
      target: appServerUrl,
      changeOrigin: true,
    },
    '/api/agent': {
      target: appServerUrl,
      changeOrigin: true,
    },
  }

  return {
    plugins: [react()],
    server: {
      proxy: swuDbProxy,
    },
    preview: {
      proxy: swuDbProxy,
    },
  }
})
