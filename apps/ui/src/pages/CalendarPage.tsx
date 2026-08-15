import { useLingui } from '@lingui/react/macro'
import Calendar from '../components/Calendar/index'

const CalendarPage = () => {
  const { t } = useLingui()
  return (
    <>
      <title>{t`Calendar - Maintainerr`}</title>
      <Calendar />
    </>
  )
}

export default CalendarPage
