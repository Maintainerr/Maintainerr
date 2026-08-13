import { lingui, linguiTransformerBabelPreset } from '@lingui/vite-plugin'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Use __PATH_PREFIX__ as a placeholder that will be replaced at runtime
  const basePath = env.VITE_BASE_PATH || ''

  return {
    plugins: [
      react(),
      lingui(),
      // Vite 8 runs Rolldown, where plugin-react's `babel` option is not
      // applied - it silently ships untransformed macros. The macro rewrite
      // has to go through @rolldown/plugin-babel instead.
      babel({ presets: [linguiTransformerBabelPreset()] }),
      tailwindcss(),
    ],
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
      allowedHosts: ['dev.maintainerr.info'],
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
      setupFiles: [
        './src/test-utils/browser-apis.ts',
        './src/test-utils/react-cleanup.ts',
      ],
    },
    // Ensure environment variables are available and can be replaced at runtime
    define: {
      'import.meta.env.VITE_BASE_PATH': JSON.stringify(basePath),
    },
  }
})
