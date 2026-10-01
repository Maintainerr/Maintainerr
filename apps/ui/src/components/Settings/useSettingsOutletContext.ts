import { useOutletContext } from 'react-router-dom'
import type { UseSettingsResult } from '../../api/settings'

type SettingsOutletContext = {
  settings: NonNullable<UseSettingsResult['data']>
}

export const useSettingsOutletContext = () =>
  useOutletContext<SettingsOutletContext>()
