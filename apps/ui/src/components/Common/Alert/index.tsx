import {
  CheckCircleIcon,
  ExclamationIcon,
  InformationCircleIcon,
  XCircleIcon,
} from '@heroicons/react/solid'
import React from 'react'

interface AlertProps {
  title?: React.ReactNode
  type?: 'warning' | 'info' | 'success' | 'error'
  children?: React.ReactNode
  // A one-line label that fits beside a control instead of a full-width block.
  inline?: boolean
}

const Alert: React.FC<AlertProps> = ({ title, children, type, inline }) => {
  let design = {
    bgColor: 'bg-warning-900',
    titleColor: 'text-warning-100',
    textColor: 'text-warning-300',
    Icon: ExclamationIcon,
  }

  switch (type) {
    case 'info':
      design = {
        bgColor: 'bg-info-700',
        titleColor: 'text-info-100',
        textColor: 'text-info-300',
        Icon: InformationCircleIcon,
      }
      break
    case 'success':
      design = {
        bgColor: 'bg-success-700',
        titleColor: 'text-success-100',
        textColor: 'text-success-300',
        Icon: CheckCircleIcon,
      }
      break
    case 'error':
      design = {
        bgColor: 'bg-error-700',
        titleColor: 'text-error-100',
        textColor: 'text-zinc-200',
        Icon: XCircleIcon,
      }
      break
  }

  if (inline) {
    return (
      <div
        className={`inline-flex max-w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium ${design.bgColor} ${design.titleColor}`}
      >
        <design.Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{title}</span>
      </div>
    )
  }

  return (
    <div className={`mb-4 rounded-md p-4 ${design.bgColor}`}>
      <div className="flex">
        <div className={`flex-shrink-0 ${design.titleColor}`}>
          <design.Icon className="h-5 w-5" />
        </div>
        <div className="ml-3">
          {title && (
            <div className={`text-sm font-medium ${design.titleColor}`}>
              {title}
            </div>
          )}
          {children && (
            <div
              className={`button-text mt-2 text-sm first:mt-0 ${design.textColor}`}
            >
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Alert
