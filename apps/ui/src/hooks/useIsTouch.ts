import { useContext } from 'react'
import { InteractionContext } from '../contexts/interaction-context'

export const useIsTouch = (): boolean => {
  const { isTouch } = useContext(InteractionContext)
  return isTouch
}
