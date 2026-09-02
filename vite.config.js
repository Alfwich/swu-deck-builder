import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const packageMetadata = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
)
const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const browserRoot = fileURLToPath(new URL('./src', import.meta.url))
const publicDirectory = fileURLToPath(new URL('./public', import.meta.url))
const buildDirectory = fileURLToPath(new URL('./dist', import.meta.url))

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, projectRoot, '')
  const apiBaseUrl = environment.SWU_DB_API_BASE_URL?.replace(/\/+$/, '')
  const appServerUrl =
    environment.APP_SERVER_URL ??
    `http://127.0.0.1:${environment.APP_SERVER_PORT || '8787'}`

  const swuDbProxy = {
    '/api/features': {
      target: appServerUrl,
      changeOrigin: true,
    },
    '/api/agent': {
      target: appServerUrl,
      changeOrigin: true,
    },
    '/api/local': {
      target: appServerUrl,
      changeOrigin: true,
    },
  }

  if (apiBaseUrl) {
    swuDbProxy['/api/swu-db'] = {
      target: apiBaseUrl,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api\/swu-db/, ''),
    }
  }

  return {
    root: browserRoot,
    publicDir: publicDirectory,
    build: {
      emptyOutDir: true,
      outDir: buildDirectory,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'charts',
                test: /node_modules[\\/]chart\.js/,
              },
              {
                name: 'markdown',
                test: /node_modules[\\/](?:react-markdown|remark-|unified|unist-|mdast-|micromark|hast-|vfile|property-information|space-separated-tokens|comma-separated-tokens|decode-named-character-reference|devlop|html-url-attributes)/,
              },
            ],
          },
        },
      },
    },
    define: {
      'import.meta.env.APP_VERSION': JSON.stringify(packageMetadata.version),
      'import.meta.env.GOOGLE_DRIVE_CLIENT_ID': JSON.stringify(
        environment.GOOGLE_DRIVE_CLIENT_ID?.trim() || '',
      ),
    },
    plugins: [react()],
    server: {
      proxy: swuDbProxy,
    },
    preview: {
      proxy: swuDbProxy,
    },
  }
})
