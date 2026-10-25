import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    host: true,
    // Hosts the dev server will answer for. Kept to explicit names and one
    // trusted suffix rather than `true`, which would accept any Host header.
    allowedHosts: ['localhost', '127.0.0.1', '.prod-runtime.all-hands.dev'],
    proxy: {
      // Lets the dev server talk to the API without CORS surprises.
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Route-level code splitting is handled by lazy imports; these manual
        // chunks keep the largest third-party libraries out of the entry file.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
          charts: ['recharts'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
});
