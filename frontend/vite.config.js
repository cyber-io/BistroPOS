import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    headers: {
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5050',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            if (err.code === 'ECONNREFUSED' && res && !res.headersSent && typeof res.writeHead === 'function') {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                error: 'Backend API is starting up or temporarily offline at 127.0.0.1:5050',
                code: 'BACKEND_CONNECTING'
              }));
            }
          });
        }
      },
      '/hubs': {
        target: 'http://127.0.0.1:5050',
        ws: true,
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('error', () => {
            // Suppress websocket handshake noise during backend restart
          });
        }
      }
    }
  }
})
