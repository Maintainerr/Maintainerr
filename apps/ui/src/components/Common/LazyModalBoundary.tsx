import { type ReactNode } from 'react'
import LazyBoundary from './LazyBoundary'
import Modal from './Modal'

interface LazyModalBoundaryProps {
  children: ReactNode
  onCancel?: () => void
  title?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl'
  backgroundClickable?: boolean
}

const LazyModalBoundary = ({
  children,
  onCancel,
  title,
  size,
  backgroundClickable,
}: LazyModalBoundaryProps) => {
  return (
    <LazyBoundary
      fallback={
        <Modal
          loading
          title={title}
          size={size}
          onCancel={onCancel}
          backgroundClickable={backgroundClickable}
        >
          <div />
        </Modal>
      }
    >
      {children}
    </LazyBoundary>
  )
}

export default LazyModalBoundary
