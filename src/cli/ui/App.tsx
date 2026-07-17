import React from "react"
import { useApp } from "ink"
import { CLI_VERSION } from "../../version.js"
import { AppShell } from "./components/AppShell.js"
import { useScreenState } from "./hooks/useScreenState.js"
import { ApiKeyScreen } from "./screens/ApiKeyScreen.js"
import { ConfiguracionesMenuScreen } from "./screens/ConfiguracionesMenuScreen.js"
import { ConfigValueScreen } from "./screens/ConfigValueScreen.js"
import { MainMenuScreen } from "./screens/MainMenuScreen.js"
import { SearchQuotationScreen } from "./screens/SearchQuotationScreen.js"
import { TokenLoginScreen } from "./screens/TokenLoginScreen.js"
import type { ScreenType } from "./types.js"

export function App() {
  const { exit } = useApp()
  const { currentScreen, navigateTo, goBack } = useScreenState<ScreenType>("main-menu")

  const handleMainSelection = (screen: string) => {
    if (screen === "exit") {
      exit()
      return
    }
    navigateTo(screen as ScreenType)
  }

  const renderScreen = () => {
    switch (currentScreen) {
      case "main-menu":
        return <MainMenuScreen onSelect={handleMainSelection} />
      case "search-quotation":
        return (
          <SearchQuotationScreen
            onBack={goBack}
            onConfigure={() => navigateTo("settings-menu")}
          />
        )
      case "settings-menu":
        return (
          <ConfiguracionesMenuScreen
            onSelect={(screen) => navigateTo(screen as ScreenType)}
            onBack={goBack}
          />
        )
      case "config-token-login":
        return <TokenLoginScreen onBack={goBack} />
      case "config-api-url":
        return (
          <ConfigValueScreen
            onBack={goBack}
            configKey="apiBaseUrl"
            title="Configurar endpoint administrativo"
            description="URL base del backend administrativo."
            placeholder="https://admin-api.or-gm.com"
          />
        )
      case "config-base-path":
        return (
          <ConfigValueScreen
            onBack={goBack}
            configKey="basePath"
            title="Configurar carpeta base"
            description="Ruta donde se crearán las carpetas de cotizaciones."
            placeholder="/ruta/de/proyectos"
          />
        )
      case "config-api-key":
        return <ApiKeyScreen onBack={goBack} />
    }
  }

  return <AppShell appVersion={CLI_VERSION}>{renderScreen()}</AppShell>
}
