import { Dispatch, RefObject, SetStateAction } from 'react'

export function addPortToUrl(url: string, port: number): string {
  // Parsing URL using anchor element
  const parser = document.createElement('a')
  parser.href = url

  // Check if the URL already contains a port
  if (parser.port) {
    // If a port already exists, return the original URL
    return url
  }

  // Reconstructing URL with the provided port
  return `${parser.protocol}//${parser.hostname}:${port}${parser.pathname == '/' ? '' : parser.pathname}${parser.search}${parser.hash}`
}

export function removePortFromUrl(url: string): string | undefined {
  try {
    if (!url) return undefined
    const urlObject = new URL(url)
    urlObject.port = ''
    return urlObject.toString()
  } catch {
    return undefined
  }
}

export function getPortFromUrl(url: string): string | undefined {
  try {
    const urlObject = new URL(url)
    let port = urlObject.port
    if (!port && urlObject.protocol === 'http:') {
      port = '80'
    } else if (!port && urlObject.protocol === 'https:') {
      port = '443'
    }
    return port
  } catch {
    return undefined
  }
}

export function getHostname(url: string): string | undefined {
  try {
    const urlObject = new URL(url)
    const baseUrl = urlObject.protocol + '//' + urlObject.hostname
    return baseUrl
  } catch {
    return undefined
  }
}

export function getBaseUrl(url: string): string | undefined {
  try {
    const urlObject = new URL(url)
    let baseUrl = urlObject.pathname
    baseUrl = baseUrl.startsWith('/') ? baseUrl.substring(1) : baseUrl
    return baseUrl
  } catch {
    return undefined
  }
}

export function stripTrailingSlashes(value: string): string {
  let endIndex = value.length

  while (endIndex > 0 && value[endIndex - 1] === '/') {
    endIndex -= 1
  }

  return endIndex === value.length ? value : value.slice(0, endIndex)
}

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
  return (spaced.charAt(0).toUpperCase() + spaced.slice(1)).trim()
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
