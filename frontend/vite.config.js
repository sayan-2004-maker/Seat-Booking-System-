import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiTarget = process.env.CINEBOOK_API_URL || 'http://localhost:4000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': apiTarget,
      '/uploads': apiTarget,
    },
  },
})
