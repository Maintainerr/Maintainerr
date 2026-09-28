import { Dispatch, RefObject, SetStateAction } from 'react'

const acronyms = new Set(['id', 'json', 'pgp', 'smtp', 'tls', 'url'])

export function camelCaseToPrettyText(camelCaseStr: string): string {
  let spaced = ''
  for (let i = 0; i < camelCaseStr.length; i++) {
    const code = camelCaseStr.charCodeAt(i)
    const prevCode = camelCaseStr.charCodeAt(i - 1)
    const isUpper = code >= 65 && code <= 90
    const prevIsLower = i > 0 && prevCode >= 97 && prevCode <= 122
    if (isUpper && prevIsLower) {
      spaced += ' '
    }
    spaced += camelCaseStr[i]
  }
  return (spaced.charAt(0).toUpperCase() + spaced.slice(1))
    .trim()
    .split(' ')
    .map((word) =>
      acronyms.has(word.toLowerCase()) ? word.toUpperCase() : word,
    )
    .join(' ')
}

export const handleSettingsInputChange = (
  event: React.ChangeEvent<HTMLInputElement>,
  ref: RefObject<HTMLInputElement | null>,
  stateSetter: Dispatch<SetStateAction<string | undefined>>,
) => {
  // this is required for some reason, even though the state is not used. Otherwise setting values breaks
  stateSetter(event.target.value)
  // @ts-ignore
  ref.current = { value: event.target.value }
}
