import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadDatabase } from '../../../api/settings'
import DatabaseBackupModal from './DatabaseBackupModal'

vi.mock('../../../api/settings', () => ({
  downloadDatabase: vi.fn(),
}))

vi.mock('../../Common/Modal', () => ({
  default: ({
    title,
    children,
    footerActions,
  }: {
    title: string
    children: ReactNode
    footerActions: ReactNode
  }) => (
    <div>
      <h1>{title}</h1>
      <div>{children}</div>
      <div>{footerActions}</div>
    </div>
  ),
}))

describe('DatabaseBackupModal', () => {
  const downloadDatabaseMock = vi.mocked(downloadDatabase)
  const onClose = vi.fn()
  const onDownloaded = vi.fn()

  beforeEach(() => {
    downloadDatabaseMock.mockReset()
    onClose.mockReset()
    onDownloaded.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('reports success to the parent before closing', async () => {
    downloadDatabaseMock.mockResolvedValue(undefined as never)

    render(
      <DatabaseBackupModal onClose={onClose} onDownloaded={onDownloaded} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Backup' }))

    await waitFor(() => {
      expect(downloadDatabaseMock).toHaveBeenCalled()
      expect(onDownloaded).toHaveBeenCalledTimes(1)
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('keeps the modal open and shows an inline error when the backup fails', async () => {
    downloadDatabaseMock.mockRejectedValue(new Error('boom'))

    render(
      <DatabaseBackupModal onClose={onClose} onDownloaded={onDownloaded} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Backup' }))

    await waitFor(() => {
      expect(screen.getByText('Could not backup the database')).toBeTruthy()
    })

    expect(onDownloaded).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})
