import { defineConfig } from '@lingui/cli'
import { formatter } from '@lingui/format-po'

// Catalogs are PO so Weblate can show translators the source file, line and
// any developer comment. Extraction is scoped to src: nothing outside it is
// ever offered for translation.
export default defineConfig({
  sourceLocale: 'en',
  // Keep in step with SUPPORTED_LOCALES in src/i18n.ts - a locale offered in
  // the picker with no catalog on disk fails its dynamic import.
  locales: [
    'en',
    'cs',
    'da',
    'de',
    'es',
    'fi',
    'fr',
    'it',
    'nb',
    'nl',
    'pl',
    'pt',
    'sv',
  ],
  catalogs: [
    {
      path: '<rootDir>/src/locales/{locale}',
      include: ['src'],
      exclude: ['**/*.spec.ts', '**/*.spec.tsx', 'src/test-utils/**'],
    },
  ],
  compileNamespace: 'es',
  // File references without line numbers. With them, editing anything above a
  // translatable string rewrites that reference in all 13 catalogs, so
  // unrelated PRs churn the whole catalog set and collide with Weblate's own
  // commits. Translators still get the file path, which is the useful half.
  format: formatter({ lineNumbers: false }),
})
