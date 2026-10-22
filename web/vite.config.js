import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // 화면(5173)에서 /api를 부르면 서버(8080)로 넘겨요.
    proxy: {
      '/api': 'http://127.0.0.1:8080',
    },
  },
})
