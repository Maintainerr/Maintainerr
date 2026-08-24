import { lazy, type ComponentProps } from 'react'
import LazyBoundary from './LazyBoundary'
import LoadingSpinner, { SmallLoadingSpinner } from './LoadingSpinner'

// @monaco-editor/react fetches monaco from cdn.jsdelivr.net unless it is handed
// an instance, which breaks installs without internet access and runs a version
// other than the one pinned here. Both imports stay inside the lazy factory so
// monaco is still only downloaded when an editor is actually opened.
const MonacoEditor = lazy(async () => {
  const [{ default: Editor, loader }, { default: monaco }] = await Promise.all([
    import('@monaco-editor/react'),
    import('../../utils/monaco'),
  ])
  loader.config({ monaco })
  return { default: Editor }
})

type LazyMonacoEditorProps = ComponentProps<typeof MonacoEditor>

const centered = 'flex h-full min-h-48 items-center justify-center'
// LoadingSpinner's own size, so the two waits below are visually identical.
const SPINNER_SIZE = 'h-16 w-16'

// Downloading the chunk: an expected wait, so the delayed spinner, which stays
// hidden if the chunk is already cached.
const downloading = (
  <div className={centered}>
    <LoadingSpinner />
  </div>
)

// Initialising monaco: by now the wait is already known to be long, so this one
// is immediate. Delaying it again would blank the box mid-load, because
// LoadingSpinner restarts its timer whenever it mounts.
const initialising = (
  <div className={centered}>
    <SmallLoadingSpinner className={SPINNER_SIZE} />
  </div>
)

const LazyMonacoEditor = (props: LazyMonacoEditorProps) => {
  return (
    <LazyBoundary fallback={downloading}>
      <MonacoEditor loading={initialising} {...props} />
    </LazyBoundary>
  )
}

export default LazyMonacoEditor
