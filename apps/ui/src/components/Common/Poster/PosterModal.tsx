import type { ReactNode } from 'react'
import { useLockBodyScroll } from '../../../hooks/useLockBodyScroll'

interface PosterModalProps {
  onClose: () => void
  children: ReactNode
}

const PosterModal = ({ onClose, children }: PosterModalProps) => {
  useLockBodyScroll(true)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 px-3"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl bg-zinc-800 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

export default PosterModal
