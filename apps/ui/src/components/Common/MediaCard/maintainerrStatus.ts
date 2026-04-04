import type { MaintainerrMediaStatusDetails } from '@maintainerr/contracts'

export const emptyMaintainerrMediaStatusDetails: MaintainerrMediaStatusDetails =
  {
    excludedFrom: [],
    manuallyAddedTo: [],
  }

const maintainerrStatusDetailsCache = new Map<
  string,
  MaintainerrMediaStatusDetails
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

export const getCachedMaintainerrStatusDetails = (cacheKey: string) =>
  maintainerrStatusDetailsCache.get(cacheKey)

export const rememberMaintainerrStatusDetails = (
  cacheKey: string,
  details?: MaintainerrMediaStatusDetails,
) => {
  const normalizedDetails = normalizeMaintainerrStatusDetails(details)
  maintainerrStatusDetailsCache.set(cacheKey, normalizedDetails)
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
