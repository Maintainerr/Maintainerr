import { i18n } from '@lingui/core'

// Collate with the app locale: the text is shown in the UI language, and the
// browser default would order Swedish labels with English rules.
export const compareLocalized = (left: string, right: string): number =>
  left.localeCompare(right, i18n.locale)

export const compareByName = <T extends { name: string }>(
  left: T,
  right: T,
): number => compareLocalized(left.name, right.name)
