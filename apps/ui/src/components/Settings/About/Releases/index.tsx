import { plural, t } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import GetApiHandler from '../../../../utils/ApiHandler'
import Badge from '../../../Common/Badge'
import Button from '../../../Common/Button'
import { SmallLoadingSpinner } from '../../../Common/LoadingSpinner'
import Modal from '../../../Common/Modal'

interface GitHubRelease {
  url: string
  assets_url: string
  upload_url: string
  html_url: string
  id: number
  node_id: string
  tag_name: string
  target_commitish: string
  name: string
  draft: boolean
  prerelease: boolean
  created_at: string
  published_at: string
  tarball_url: string
  zipball_url: string
  body: string
}

interface ReleaseProps {
  release: GitHubRelease
  isLatest: boolean
  currentVersion: string
}

const calculateRelativeTime = (dateString: string): string => {
  const secondsAgo = Math.floor(
    (Date.now() - new Date(dateString).getTime()) / 1000,
  )
  const minutesAgo = Math.floor(secondsAgo / 60)
  const hoursAgo = Math.floor(minutesAgo / 60)
  const daysAgo = Math.floor(hoursAgo / 24)

  if (secondsAgo < 60)
    return plural(secondsAgo, {
      one: '# second ago',
      other: '# seconds ago',
    })
  if (minutesAgo < 60)
    return plural(minutesAgo, {
      one: '# minute ago',
      other: '# minutes ago',
    })
  if (hoursAgo < 24)
    return plural(hoursAgo, { one: '# hour ago', other: '# hours ago' })
  return plural(daysAgo, { one: '# day ago', other: '# days ago' })
}

const Release = ({ currentVersion, release, isLatest }: ReleaseProps) => {
  const { t: translate } = useLingui()
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <div className="flex w-full flex-col space-y-3 rounded-md bg-zinc-700 px-4 py-2 shadow-md ring-1 ring-gray-700 sm:flex-row sm:space-y-0 sm:space-x-3">
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Modal
            onCancel={() => setIsModalOpen(false)}
            title={translate`${{ version: release.name }} Changelog`}
            cancelText={translate`Close`}
            footerActions={
              <Button
                buttonType="primary"
                className="ml-3"
                onClick={() => window.open(release.html_url, '_blank')}
              >
                <Trans>View on GitHub</Trans>
              </Button>
            }
          >
            <div className="prose:sm prose">
              <ReactMarkdown>{release.body}</ReactMarkdown>
            </div>
          </Modal>
        </div>
      )}
      <div className="flex w-full grow items-center justify-center space-x-2 truncate sm:justify-start">
        <span className="truncate text-lg font-bold">
          <span className="mr-2 text-xs font-normal whitespace-nowrap">
            {calculateRelativeTime(release.created_at)}
          </span>
          {release.name}
        </span>
        {isLatest && (
          <Badge badgeType="success">
            <Trans>Latest</Trans>
          </Badge>
        )}
        {release.name.includes(currentVersion) && (
          <Badge badgeType="primary">
            <Trans>Current</Trans>
          </Badge>
        )}
      </div>
      <Button buttonType="primary" onClick={() => setIsModalOpen(true)}>
        <span>
          <Trans>View Changelog</Trans>
        </span>
      </Button>
    </div>
  )
}

interface ReleasesProps {
  currentVersion: string
}

const Releases = ({ currentVersion }: ReleasesProps) => {
  const [data, setData] = useState<GitHubRelease[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchReleases = async () => {
      try {
        const response = await GetApiHandler<GitHubRelease[]>(`/app/releases`)
        setData(response)
      } catch (error) {
        setError(
          error instanceof Error && error.message
            ? error.message
            : t`Failed to fetch releases`,
        )
      }
    }

    fetchReleases()
  }, [])

  return (
    <div>
      <h3 className="heading">
        <Trans>Releases</Trans>
      </h3>
      <div className="section space-y-3">
        {!data && !error ? (
          <SmallLoadingSpinner />
        ) : error ? (
          <div className="text-gray-300">
            <Trans>Release data is currently unavailable.</Trans>
          </div>
        ) : (
          data?.map((release, index) => (
            <div key={`release-${release.id}`}>
              <Release
                release={release}
                currentVersion={currentVersion}
                isLatest={index === 0}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default Releases
