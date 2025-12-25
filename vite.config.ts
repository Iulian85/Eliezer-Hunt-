import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY),
  },
  server: {
    host: true,
    port: 3000,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 3000,
    strictPort: true,
    allowedHosts: [
      'eliezer-hunt-production.up.railway.app',
      'all'
    ]
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false, // BUN – păstrează
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true, // Schimbă în true – nu ai nevoie de debugger
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn']
      },
      mangle: {
        toplevel: true, // ADAUGĂ ASTA – esențial pentru obfuscare maximă
      },
      format: {
        comments: false,
      }
    },
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[hash].js',
        chunkFileNames: 'assets/[hash].js',
        assetFileNames: 'assets/[hash].[ext]',
      },
    },
    // ADAUGĂ ASTA – forțează Vite să nu genereze importmap
    target: 'es2022', // sau 'es2022'
    modulePreload: false,
  },
  // ADAUGĂ ASTA – oprește generarea automată de importmap
  base: './', // important pentru Railway și production
});