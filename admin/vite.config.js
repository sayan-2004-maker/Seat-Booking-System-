import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const frontendRoot = fileURLToPath(new URL('../frontend', import.meta.url))
const apiTarget = process.env.CINEBOOK_API_URL || 'http://localhost:4000'

export default defineConfig({
  root: frontendRoot,
  plugins: [
    react(),
    {
      name: 'manager-portal-root',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/' || req.url === '/index.html') {
            res.writeHead(302, { Location: '/admin.html' })
            res.end()
            return
          }
          next()
        })
      },
    },
  ],
  server: {
    host: 'localhost',
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': apiTarget,
      '/uploads': apiTarget,
    },
  },
  build: {
    outDir: '../dist-admin',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('../frontend/admin.html', import.meta.url)),
    },
  },
})
