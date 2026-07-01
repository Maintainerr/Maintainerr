# UI translations

Maintainerr UI translations are stored as monolingual JSON files:

- Source language: `locales/en.json`
- Translation file mask: `locales/*.json`
- New translation file pattern: `locales/<language-code>.json`

Suggested Weblate component settings:

- File format: JSON file
- Monolingual base language file: `apps/ui/src/i18n/locales/en.json`
- File mask: `apps/ui/src/i18n/locales/*.json`
- Source language: English
- Repository branch: the active development branch

Weblate can pull changes from the Git repository and push translation updates
back through its version-control integration. Crowdin can use the same JSON
files through its GitHub integration.
