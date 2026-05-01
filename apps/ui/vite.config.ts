import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

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
            if (id.includes('@heroicons/react/')) {
              return 'icons'
            }
            if (
              id.includes('node_modules/konva/') ||
              id.includes('node_modules/react-konva/')
            ) {
              return 'konva'
            }
            if (
              id.includes('node_modules/monaco-editor/') ||
              id.includes('node_modules/@monaco-editor/react/')
            ) {
              return 'monaco'
            }
            if (id.includes('node_modules/@headlessui/react/')) {
              return 'headlessui'
            }
            if (
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-router/') ||
              id.includes('node_modules/react-router-dom/')
            ) {
              return 'vendor'
            }
            if (id.includes('@tanstack/react-query')) {
              return 'query'
            }
            if (id.includes('node_modules/zod/')) {
              return 'validation'
            }
            if (
              id.includes('node_modules/react-hook-form/') ||
              id.includes('node_modules/@hookform/resolvers/')
            ) {
              return 'forms'
            }
            if (
              id.includes('node_modules/axios/') ||
              id.includes('node_modules/react-toastify/')
            ) {
              return 'network'
            }
            if (id.includes('node_modules/lodash-es/')) {
              return 'lodash'
            }
            if (id.includes('node_modules/yaml/')) {
              return 'yaml'
            }
          },
        },
      },
    },
    optimizeDeps: {
      include: ['@maintainerr/contracts'],
    },
    server: {
      host: true,
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
    test: {
      environment: 'jsdom',
    },
    // Ensure environment variables are available and can be replaced at runtime
    define: {
      'import.meta.env.VITE_BASE_PATH': JSON.stringify(basePath),
    },
  }
})
