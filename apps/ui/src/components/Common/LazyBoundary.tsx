import { Suspense, type ReactNode } from 'react'
import LoadingSpinner from './LoadingSpinner'

interface LazyBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

const LazyBoundary = ({
  children,
  fallback = <LoadingSpinner />,
}: LazyBoundaryProps) => {
  return <Suspense fallback={fallback}>{children}</Suspense>
}

export default LazyBoundary
