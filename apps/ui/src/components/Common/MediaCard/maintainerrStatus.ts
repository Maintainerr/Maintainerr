import type { MaintainerrMediaStatusDetails } from '@maintainerr/contracts'

export const emptyMaintainerrMediaStatusDetails: MaintainerrMediaStatusDetails =
  {
    excludedFrom: [],
    manuallyAddedTo: [],
  }

const maintainerrStatusDetailsTtlMs = 5 * 60 * 1000

const maintainerrStatusDetailsCache = new Map<
  string,
  {
    details: MaintainerrMediaStatusDetails
    cachedAt: number
  }
>()

const normalizeMaintainerrStatusDetails = (
  details?: MaintainerrMediaStatusDetails,
): MaintainerrMediaStatusDetails => ({
  excludedFrom: details?.excludedFrom ?? [],
  manuallyAddedTo: details?.manuallyAddedTo ?? [],
})

export const getMaintainerrStatusDetailsKey = ({
  id,
  exclusionType,
  isManual,
}: {
  id: number | string
  exclusionType?: 'global' | 'specific'
  isManual?: boolean
}) => {
  if (!exclusionType && !isManual) {
    return undefined
  }

  return String(id)
}

export const clearMaintainerrStatusDetailsCache = () => {
  maintainerrStatusDetailsCache.clear()
}

export const getCachedMaintainerrStatusDetails = (cacheKey: string) => {
  const cachedEntry = maintainerrStatusDetailsCache.get(cacheKey)

  if (!cachedEntry) {
    return undefined
  }

  if (cachedEntry.cachedAt + maintainerrStatusDetailsTtlMs <= Date.now()) {
    maintainerrStatusDetailsCache.delete(cacheKey)
    return undefined
  }

  return cachedEntry.details
}

export const rememberMaintainerrStatusDetails = (
  cacheKey: string,
  details?: MaintainerrMediaStatusDetails,
) => {
  const normalizedDetails = normalizeMaintainerrStatusDetails(details)
  maintainerrStatusDetailsCache.set(cacheKey, {
    details: normalizedDetails,
    cachedAt: Date.now(),
  })
  return normalizedDetails
}

export const hasMaintainerrStatusDetails = (
  details?: MaintainerrMediaStatusDetails,
) => {
  if (!details) {
    return false
  }

  return details.excludedFrom.length > 0 || details.manuallyAddedTo.length > 0
}

export const fetchMaintainerrStatusDetails = async ({
  id,
  getApiHandler,
}: {
  id: number | string
  getApiHandler: <Response = unknown>(url: string) => Promise<Response>
}) => {
  const details = await getApiHandler<MaintainerrMediaStatusDetails>(
    `/media-server/meta/${encodeURIComponent(String(id))}/maintainerr-status`,
  )

  return normalizeMaintainerrStatusDetails(details)
}

export const loadMaintainerrStatusDetails = async ({
  cacheKey,
  id,
  getApiHandler,
}: {
  cacheKey: string
  id: number | string
  getApiHandler: <Response = unknown>(url: string) => Promise<Response>
}) => {
  const cachedDetails = getCachedMaintainerrStatusDetails(cacheKey)

  if (cachedDetails) {
    return cachedDetails
  }

  const details = await fetchMaintainerrStatusDetails({
    id,
    getApiHandler,
  })

  return rememberMaintainerrStatusDetails(cacheKey, details)
}
