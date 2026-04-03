import React, { useEffect, useState } from 'react'
import { LOADING_SPINNER_DELAY_MS } from '../../../utils/uiBehavior'

interface SmallLoadingSpinnerProps {
  className?: string
}

export const SmallLoadingSpinner: React.FC<SmallLoadingSpinnerProps> = (
  props: SmallLoadingSpinnerProps,
) => {
  return (
    <div className={`${props.className ? props.className : ''}`}>
      <div className="inset-0 flex h-full w-full items-center justify-center text-zinc-200">
        <svg
          className={props.className ? props.className : 'h-10 w-10'}
          viewBox="0 0 38 38"
          xmlns="http://www.w3.org/2000/svg"
          stroke="currentColor"
        >
          <g fill="none" fillRule="evenodd">
            <g transform="translate(1 1)" strokeWidth="2">
              <circle strokeOpacity=".5" cx="18" cy="18" r="18" />
              <path d="M36 18c0-9.94-8.06-18-18-18">
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from="0 18 18"
                  to="360 18 18"
                  dur="1s"
                  repeatCount="indefinite"
                />
              </path>
            </g>
          </g>
        </svg>
      </div>
    </div>
  )
}

interface LoadingSpinnerProps {
  className?: string
  containerClassName?: string
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  className,
  containerClassName,
}) => {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setIsVisible(true)
    }, LOADING_SPINNER_DELAY_MS)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [])

  if (!isVisible) {
    return null
  }

  return (
    <div
      className={`inset-0 flex items-center justify-center text-zinc-200 ${containerClassName ?? 'h-64'}`}
    >
      <svg
        className={className ?? 'h-16 w-16'}
        viewBox="0 0 38 38"
        xmlns="http://www.w3.org/2000/svg"
        stroke="currentColor"
      >
        <g fill="none" fillRule="evenodd">
          <g transform="translate(1 1)" strokeWidth="2">
            <circle strokeOpacity=".5" cx="18" cy="18" r="18" />
            <path d="M36 18c0-9.94-8.06-18-18-18">
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 18 18"
                to="360 18 18"
                dur="1s"
                repeatCount="indefinite"
              />
            </path>
          </g>
        </g>
      </svg>
    </div>
  )
}

export default LoadingSpinner
