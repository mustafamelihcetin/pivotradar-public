import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BUILD_EPOCH = Date.now().toString();

// https://vite.dev/config/
export default defineConfig({
  base: '/', // Mutlak yollar: SPA yönlendirme sorunlarını ve alt dizinlerdeki varlık yükleme hatalarını önler
  define: { __BUILD_EPOCH__: JSON.stringify(BUILD_EPOCH) },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8051',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    target: 'es2020',
    cssMinify: 'lightningcss',
    cssCodeSplit: true,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/react-router-dom') || id.includes('node_modules/react-router/')) {
            return 'vendor-router';
          }
          if (id.includes('node_modules/framer-motion')) {
            return 'vendor-motion';
          }
          if (id.includes('node_modules/@tanstack')) {
            return 'vendor-query';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
          if (id.includes('node_modules/zustand')) {
            return 'vendor-state';
          }
          if (id.includes('node_modules/@google') || id.includes('node_modules/@react-oauth')) {
            return 'vendor-google';
          }
        },
      },
    },
  }
})
