import { useState, useCallback } from "react"

export function useScreenState<T extends string>(initialScreen: T) {
  const [screenStack, setScreenStack] = useState<T[]>([initialScreen])

  const currentScreen = screenStack[screenStack.length - 1]

  const navigateTo = useCallback((screen: T) => {
    setScreenStack((prev) => [...prev, screen])
  }, [])

  const goBack = useCallback(() => {
    if (screenStack.length > 1) {
      setScreenStack((prev) => prev.slice(0, -1))
    }
  }, [screenStack.length])

  const reset = useCallback(
    (screen?: T) => {
      setScreenStack([screen ?? initialScreen])
    },
    [initialScreen]
  )

  const canGoBack = screenStack.length > 1

  return {
    currentScreen,
    screenStack,
    navigateTo,
    goBack,
    reset,
    canGoBack,
  }
}
