export const createDateStampedFilename = () => {
  const date = new Date()
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const dateStamp = `${year}-${month}-${day}`

  return `maintainerr-${dateStamp}.sqlite`
}

export const normalizeDatabaseFilename = (filename: string) => {
  const reservedWindowsNames = new Set([
    'CON',
    'PRN',
    'AUX',
    'NUL',
    'COM1',
    'COM2',
    'COM3',
    'COM4',
    'COM5',
    'COM6',
    'COM7',
    'COM8',
    'COM9',
    'LPT1',
    'LPT2',
    'LPT3',
    'LPT4',
    'LPT5',
    'LPT6',
    'LPT7',
    'LPT8',
    'LPT9',
  ])
  const trimmedName = filename.trim().replace(/\.+$/, '')
  const sanitizedName = trimmedName
    .split('')
    .filter((char) => {
      const codePoint = char.charCodeAt(0)
      return codePoint >= 32 && codePoint !== 127
    })
    .join('')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 120)

  if (sanitizedName.length === 0) {
    return ''
  }

  const nameWithoutExtension = sanitizedName
    .replace(/\.sqlite$/i, '')
    .replace(/\.+$/, '')
    .trim()

  if (nameWithoutExtension.length === 0) {
    return ''
  }

  const normalizedBaseName = reservedWindowsNames.has(
    nameWithoutExtension.toUpperCase(),
  )
    ? `${nameWithoutExtension}-backup`
    : nameWithoutExtension

  return `${normalizedBaseName}.sqlite`
}
