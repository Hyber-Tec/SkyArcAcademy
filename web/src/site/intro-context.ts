import { createContext, useContext } from 'react'

/** Whether the logo intro has finished (the hero waits for it before it animates in). */
export const IntroReady = createContext(true)
export const useIntroReady = () => useContext(IntroReady)
