import { lazy, type ComponentProps } from 'react'
import LazyBoundary from './LazyBoundary'
import LoadingSpinner from './LoadingSpinner'

const MonacoEditor = lazy(() => import('@monaco-editor/react'))

type LazyMonacoEditorProps = ComponentProps<typeof MonacoEditor>

const LazyMonacoEditor = (props: LazyMonacoEditorProps) => {
  return (
    <LazyBoundary
      fallback={
        <div className="flex h-full min-h-48 items-center justify-center">
          <LoadingSpinner />
        </div>
      }
    >
      <MonacoEditor {...props} />
    </LazyBoundary>
  )
}

export default LazyMonacoEditor
