import { Transition } from '@headlessui/react'
import { Trans } from '@lingui/react/macro'
import React, { MouseEvent, ReactNode, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import useClickOutside from '../../../hooks/useClickOutside'
import useCloseOnEscape from '../../../hooks/useCloseOnEscape'
import { useLockBodyScroll } from '../../../hooks/useLockBodyScroll'
import Button, { ButtonType } from '../Button'
import LoadingSpinner from '../LoadingSpinner'

interface ModalProps {
  title?: string
  onCancel?: (e?: MouseEvent<HTMLElement>) => void
  cancelText?: string
  cancelButtonType?: ButtonType
  disableScrollLock?: boolean
  backgroundClickable?: boolean
  iconSvg?: ReactNode
  loading?: boolean
  children: React.ReactNode
  footerActions?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl'
}

const maxWidthMap = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-2xl',
  '3xl': 'sm:max-w-3xl',
  '4xl': 'sm:max-w-4xl',
  '5xl': 'sm:max-w-5xl',
}

const Modal: React.FC<ModalProps> = ({
  title,
  onCancel,
  cancelText,
  cancelButtonType = 'default',
  children,
  disableScrollLock,
  backgroundClickable = true,
  iconSvg,
  loading = false,
  footerActions,
  size = '3xl',
}) => {
  const headlineId = useId()
  const modalRef = useRef<HTMLDivElement>(null)
  const dismissable = typeof onCancel === 'function' && backgroundClickable
  useClickOutside(modalRef, () => {
    if (dismissable) {
      onCancel()
    }
  })
  useCloseOnEscape(dismissable, () => onCancel?.())
  useLockBodyScroll(true, disableScrollLock)

  return createPortal(
    <div className="fixed top-0 right-0 bottom-0 left-0 z-50 flex h-full w-full items-center justify-center bg-zinc-800/70">
      {/* A column, so the body is the only part that scrolls and the footer -
          which carries the close - stays on screen however tall the content
          gets. */}
      <Transition
        appear
        as="div"
        className={`relative flex max-h-full w-full transform flex-col overflow-hidden bg-zinc-700 text-left shadow-xl ring-1 ring-zinc-700 transition duration-300 sm:max-h-[calc(100%-4rem)] ${maxWidthMap[size]} sm:rounded-lg`}
        enterFrom="scale-75 opacity-0"
        enterTo="scale-100 opacity-100"
        show
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? headlineId : undefined}
        ref={modalRef}
      >
        {(title || iconSvg) && (
          <div className="shrink-0 px-4 pt-5 sm:flex sm:items-center">
            {iconSvg && <div className="modal-icon">{iconSvg}</div>}
            <div
              className={`mt-3 truncate text-center text-white sm:mt-0 sm:text-left ${
                iconSvg ? 'sm:ml-4' : ''
              }`}
            >
              {title && (
                <span
                  className="truncate text-lg leading-6 font-bold"
                  id={headlineId}
                >
                  {title}
                </span>
              )}
            </div>
          </div>
        )}
        {/* Loading keeps the shell rather than replacing it with a bare
            spinner: the close has to stay reachable for a fetch that never
            comes back, and the actions have nothing to act on yet. */}
        {(loading || children) && (
          <div className="flex-1 overflow-y-auto px-4 py-4 text-sm leading-5 text-zinc-300">
            {loading ? <LoadingSpinner /> : children}
          </div>
        )}
        {/* Wraps: a footer with a save and a test beside the close is wider
            than a phone, and the panel no longer scrolls sideways to it. */}
        {(onCancel || footerActions) && (
          <div className="flex shrink-0 flex-row-reverse flex-wrap justify-center gap-y-2 border-t border-zinc-600 p-4 sm:justify-start">
            {loading ? undefined : footerActions}
            {typeof onCancel === 'function' && (
              <Button
                buttonType={cancelButtonType}
                onClick={onCancel}
                className="ml-3"
                type="button"
              >
                {cancelText ? cancelText : <Trans>Cancel</Trans>}
              </Button>
            )}
          </div>
        )}
      </Transition>
    </div>,
    document.body,
  )
}

export default Modal
