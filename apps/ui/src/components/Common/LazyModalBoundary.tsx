import { type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import useCloseOnEscape from '../../hooks/useCloseOnEscape'
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll'
import LazyBoundary from './LazyBoundary'
import LoadingSpinner from './LoadingSpinner'

interface LazyModalBoundaryProps {
  children: ReactNode
  onCancel?: () => void
}

// The backdrop and the delayed spinner while the chunk loads. A Modal shell
// has its own footer and height, so it would be swapped for the real dialog
// rather than filled in.
const Backdrop = ({ onCancel }: { onCancel?: () => void }) => {
  useLockBodyScroll(true)
  useCloseOnEscape(typeof onCancel === 'function', () => onCancel?.())

  return createPortal(
    <div className="modal-backdrop">
      <LoadingSpinner />
    </div>,
    document.body,
  )
}

const LazyModalBoundary = ({ children, onCancel }: LazyModalBoundaryProps) => (
  <LazyBoundary fallback={<Backdrop onCancel={onCancel} />}>
    {children}
  </LazyBoundary>
)

export default LazyModalBoundary
