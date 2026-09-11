import { fireEvent, render, screen, waitFor } from '../../../test-utils/render'
import { DownloadClientType } from '@maintainerr/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DownloadClientSettings from './index'

const saveSettingsMock = vi.fn()
const deleteSettingsMock = vi.fn()
const testMock = vi.fn()
const showUpdated = vi.fn()
const showError = vi.fn()
const clearError = vi.fn()

let downloadClientData: {
  download_client_type: DownloadClientType
  download_client_url: string
  download_client_username: string
  download_client_password: string
  download_client_delete_data: boolean
  download_client_fallback_ratio: number
}

vi.mock('..', () => ({
  useSettingsOutletContext: () => ({ settings: { id: 1 } }),
}))

vi.mock('../../../api/settings', () => ({
  useDownloadClientSettings: () => ({ data: downloadClientData }),
  useTestDownloadClient: () => ({ mutateAsync: testMock, isPending: false }),
  useSaveDownloadClientSettings: () => ({
    mutateAsync: saveSettingsMock,
    isPending: false,
  }),
  useDeleteDownloadClientSettings: () => ({
    mutateAsync: deleteSettingsMock,
    isPending: false,
  }),
}))

vi.mock('../useSettingsFeedback', () => ({
  useSettingsFeedback: () => ({
    feedback: null,
    showUpdated,
    showError,
    clearError,
  }),
}))

vi.mock('../../Common/DocsButton', () => ({
  default: () => <button type="button">Docs</button>,
}))

describe('DownloadClientSettings', () => {
  beforeEach(() => {
    saveSettingsMock.mockReset()
    deleteSettingsMock.mockReset()
    testMock.mockReset()
    showUpdated.mockReset()
    showError.mockReset()
    clearError.mockReset()
    downloadClientData = {
      download_client_type: DownloadClientType.QBITTORRENT,
      download_client_url: 'http://localhost:8080',
      download_client_username: 'admin',
      download_client_password: 'secret',
      download_client_delete_data: true,
      download_client_fallback_ratio: 0.5,
    }
  })

  it('saves the connection settings as a contract payload', async () => {
    saveSettingsMock.mockResolvedValue({ status: 'OK', code: 1 })

    render(<DownloadClientSettings />)

    fireEvent.click(await screen.findByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(saveSettingsMock).toHaveBeenCalledWith({
        download_client_type: DownloadClientType.QBITTORRENT,
        download_client_url: 'http://localhost:8080',
        download_client_username: 'admin',
        download_client_password: 'secret',
        download_client_delete_data: true,
        download_client_fallback_ratio: 0.5,
      })
    })
    expect(showUpdated).toHaveBeenCalled()
  })

  it('surfaces backend save failures instead of showing success', async () => {
    saveSettingsMock.mockRejectedValue(
      new Error('Download client settings could not be updated'),
    )

    render(<DownloadClientSettings />)

    fireEvent.click(await screen.findByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith(
        'Download client settings could not be updated',
      )
    })
    expect(showUpdated).not.toHaveBeenCalled()
  })

  it('deletes the integration when the URL is cleared', async () => {
    downloadClientData = {
      download_client_type: DownloadClientType.QBITTORRENT,
      download_client_url: '',
      download_client_username: '',
      download_client_password: '',
      download_client_delete_data: true,
      download_client_fallback_ratio: 0.5,
    }
    deleteSettingsMock.mockResolvedValue({ status: 'OK', code: 1 })

    render(<DownloadClientSettings />)

    fireEvent.click(await screen.findByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(deleteSettingsMock).toHaveBeenCalled()
    })
    expect(saveSettingsMock).not.toHaveBeenCalled()
  })

  it('tests the connection and shows a success alert', async () => {
    testMock.mockResolvedValue({ status: 'OK', code: 1, message: 'v4.6.0' })

    render(<DownloadClientSettings />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Test Connection' }),
    )

    await waitFor(() => {
      expect(testMock).toHaveBeenCalledWith(
        expect.objectContaining({
          download_client_url: 'http://localhost:8080',
        }),
      )
    })
    expect(
      await screen.findByText(/Successfully connected to the download client/),
    ).toBeTruthy()
  })

  it('clears the URL when the client changes and restores it for the saved client', async () => {
    render(<DownloadClientSettings />)

    const clientSelect = await screen.findByLabelText('Client *')
    const urlInput = screen.getByLabelText(/^URL \*/) as HTMLInputElement
    expect(urlInput.value).toBe('http://localhost:8080')

    fireEvent.change(clientSelect, {
      target: { value: DownloadClientType.TRANSMISSION },
    })
    expect(urlInput.value).toBe('')
    expect(
      screen.getByRole('button', { name: 'Test Connection' }),
    ).toHaveProperty('disabled', true)

    fireEvent.change(clientSelect, {
      target: { value: DownloadClientType.QBITTORRENT },
    })
    expect(urlInput.value).toBe('http://localhost:8080')
  })

  it('saves Transmission as the selected client', async () => {
    saveSettingsMock.mockResolvedValue({ status: 'OK', code: 1 })

    render(<DownloadClientSettings />)

    fireEvent.change(await screen.findByLabelText('Client *'), {
      target: { value: DownloadClientType.TRANSMISSION },
    })
    fireEvent.change(screen.getByLabelText(/^URL \*/), {
      target: { value: 'http://localhost:9091/transmission/rpc' },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(saveSettingsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          download_client_type: DownloadClientType.TRANSMISSION,
          download_client_url: 'http://localhost:9091/transmission/rpc',
        }),
      )
    })
  })
})
