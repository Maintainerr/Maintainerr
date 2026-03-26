export const FULL_MASK = '****'
const VISIBLE_CHARS = 3

export const maskSecret = (value: string | null | undefined): string | null => {
  if (value == null) {
    return null
  }

  if (value === '') {
    return ''
  }

  if (value.length <= VISIBLE_CHARS * 2) {
    return FULL_MASK
  }

  return `${value.slice(0, VISIBLE_CHARS)}...${value.slice(-VISIBLE_CHARS)}`
}

export const maskSecretString = (value: string): string =>
  maskSecret(value) ?? FULL_MASK
