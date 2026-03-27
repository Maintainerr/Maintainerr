import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Use __PATH_PREFIX__ as a placeholder that will be replaced at runtime
  const basePath = env.VITE_BASE_PATH || ''

  return {
    plugins: [react()],
    base: basePath || '/',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
      rolldownOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor'
            }
            if (id.includes('@tanstack/react-query')) {
              return 'query'
            }
          },
        },
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
      tsconfigPaths: true,
    },
    // Ensure environment variables are available and can be replaced at runtime
    define: {
      'import.meta.env.VITE_BASE_PATH': JSON.stringify(basePath),
    },
  }
})
