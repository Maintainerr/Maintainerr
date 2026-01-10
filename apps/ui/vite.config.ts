import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Use __PATH_PREFIX__ as a placeholder that will be replaced at runtime
  const basePath = env.VITE_BASE_PATH || ''

  return {
    plugins: [react(), tsconfigPaths()],
    base: basePath || '/',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            query: ['@tanstack/react-query'],
          },
        },
      },
      commonjsOptions: {
        include: [/node_modules/, /contracts/],
      },
    },
    optimizeDeps: {
      include: ['@maintainerr/contracts'],
    },
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://localhost:6246',
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    // Ensure environment variables are available and can be replaced at runtime
    define: {
      'import.meta.env.VITE_BASE_PATH': JSON.stringify(basePath),
    },
  }
})
