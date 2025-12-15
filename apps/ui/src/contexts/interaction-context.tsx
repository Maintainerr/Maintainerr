import React, { ReactNode } from 'react'
import useInteraction from '../hooks/useInteraction'

interface InteractionContextProps {
  isTouch: boolean
}

export const InteractionContext = React.createContext<InteractionContextProps>({
  isTouch: false,
})

interface IInteractionProvider {
  children?: ReactNode
}

export const InteractionProvider: React.FC<IInteractionProvider> = (
  props: IInteractionProvider,
) => {
  const isTouch = useInteraction()

  return (
    <InteractionContext.Provider value={{ isTouch }}>
      {props.children}
    </InteractionContext.Provider>
  )
}
