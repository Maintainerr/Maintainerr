import { lingui, linguiTransformerBabelPreset } from '@lingui/vite-plugin'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { availableParallelism } from 'node:os'
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
      sourcemap: false,
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
      // Half the cores, at most 4: each worker holds a jsdom page, so more
      // workers only add memory, and the same command runs on any machine.
      maxWorkers: Math.min(
        4,
        Math.max(1, Math.floor(availableParallelism() / 2)),
      ),
      // Renders are CPU-bound; a loaded machine stretches them past 5 s.
      testTimeout: 20_000,
      setupFiles: [
        './src/test-utils/browser-apis.ts',
        './src/test-utils/react-cleanup.ts',
        './src/test-utils/i18n.tsx',
      ],
    },
    // Ensure environment variables are available and can be replaced at runtime
    define: {
      'import.meta.env.VITE_BASE_PATH': JSON.stringify(basePath),
    },
  }
})
