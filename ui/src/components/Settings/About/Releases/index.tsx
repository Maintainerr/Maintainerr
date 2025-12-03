import { lazy, Suspense, useEffect, useState } from 'react'
import GetApiHandler from '../../../../utils/ApiHandler'
import Badge from '../../../Common/Badge'
import Button from '../../../Common/Button'
import LoadingSpinner from '../../../Common/LoadingSpinner'
import Modal from '../../../Common/Modal'

// Dynamic import for markdown
const ReactMarkdown = lazy(() => import('react-markdown'))

const messages = {
  releases: 'Releases',
  releasedataMissing: 'Release data is currently unavailable.',
  versionChangelog: '{version} Changelog',
  viewongithub: 'View on GitHub',
  latestversion: 'Latest',
  currentversion: 'Current',
  viewchangelog: 'View Changelog',
  close: 'Close',
}

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

  if (secondsAgo < 60) return `${secondsAgo} seconds ago`
  if (minutesAgo < 60) return `${minutesAgo} minutes ago`
  if (hoursAgo < 24) return `${hoursAgo} hours ago`
  return `${daysAgo} days ago`
}

const Release = ({ currentVersion, release, isLatest }: ReleaseProps) => {
  const [isModalOpen, setModalOpen] = useState(false)

  return (
    <div className="flex w-full flex-col space-y-3 rounded-md bg-zinc-700 px-4 py-2 shadow-md ring-1 ring-gray-700 sm:flex-row sm:space-x-3 sm:space-y-0">
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <Modal
            onCancel={() => setModalOpen(false)}
            title={messages.versionChangelog.replace('{version}', release.name)}
            cancelText={messages.close}
            okText={messages.viewongithub}
            onOk={() => {
              window.open(release.html_url, '_blank')
            }}
          >
            <div className="prose:sm prose">
              <Suspense fallback={<LoadingSpinner />}>
                <ReactMarkdown>{release.body}</ReactMarkdown>
              </Suspense>
            </div>
          </Modal>
        </div>
      )}
      <div className="flex w-full flex-grow items-center justify-center space-x-2 truncate sm:justify-start">
        <span className="truncate text-lg font-bold">
          <span className="mr-2 whitespace-nowrap text-xs font-normal">
            {calculateRelativeTime(release.created_at)}
          </span>
          {release.name}
        </span>
        {isLatest && (
          <Badge badgeType="success">{messages.latestversion}</Badge>
        )}
        {release.name.includes(currentVersion) && (
          <Badge badgeType="primary">{messages.currentversion}</Badge>
        )}
      </div>
      <Button buttonType="primary" onClick={() => setModalOpen(true)}>
        <span>{messages.viewchangelog}</span>
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
      } catch (err) {
        setError(
          err instanceof Error && err.message
            ? err.message
            : 'Failed to fetch releases',
        )
      }
    }

    fetchReleases()
  }, [])

  if (!data && !error) {
    return <LoadingSpinner />
  }

  if (error) {
    return <div className="text-gray-300">{messages.releasedataMissing}</div>
  }

  return (
    <div>
      <h3 className="heading">{messages.releases}</h3>
      <div className="section space-y-3">
        {data?.map((release, index) => (
          <div key={`release-${release.id}`}>
            <Release
              release={release}
              currentVersion={currentVersion}
              isLatest={index === 0}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export default Releases
