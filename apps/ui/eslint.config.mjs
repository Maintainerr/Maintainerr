import js from '@eslint/js'
import eslintReact from '@eslint-react/eslint-plugin'
import pluginQuery from '@tanstack/eslint-plugin-query'
import eslintConfigPrettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

import tseslint from 'typescript-eslint'

/** @type {import('eslint').Linter.Config[]} */
const configs = [
  {
    ignores: ['dist/**', '*.config.js', '*.config.mjs', '*.config.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintReact.configs['recommended-typescript'],
  reactHooks.configs.flat['recommended-latest'],
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser },
    },
    rules: {
      // Restore coverage plugin:react/recommended enforced that @eslint-react
      // maps to real rules but omits from its recommended preset (per its
      // migration guide): reverse-tabnabbing, unknown DOM props, display names.
      '@eslint-react/dom-no-unsafe-target-blank': 'warn',
      '@eslint-react/dom-no-unknown-property': 'warn',
      '@eslint-react/no-missing-component-display-name': 'warn',
      '@eslint-react/no-missing-context-display-name': 'warn',
      // Off by design: the codebase has legitimate id-less ordered lists
      // (overlay segments, streamed log lines) where a stable key would need a
      // data-model change. Enabling it only forces inline disables or fragile
      // composite keys, so index keys stay acceptable here.
      '@eslint-react/no-array-index-key': 'off',
      // React Hooks diagnostics are owned by eslint-plugin-react-hooks (the
      // React team's compiler-aware plugin, configured below). Turn off
      // @eslint-react's overlapping equivalents so each issue is reported once.
      '@eslint-react/error-boundaries': 'off',
      '@eslint-react/rules-of-hooks': 'off',
      '@eslint-react/exhaustive-deps': 'off',
      '@eslint-react/purity': 'off',
      '@eslint-react/set-state-in-effect': 'off',
      '@eslint-react/set-state-in-render': 'off',
      '@eslint-react/static-components': 'off',
      '@eslint-react/unsupported-syntax': 'off',
      '@eslint-react/use-memo': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/incompatible-library': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
  ...pluginQuery.configs['flat/recommended'],
  eslintConfigPrettier,
]

export default configs
