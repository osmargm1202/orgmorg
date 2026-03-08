import React from "react"
import { Box, useApp } from "ink"
import { useScreenState } from "./hooks/useScreenState.js"
import type { ScreenType } from "./types.js"
import { MainMenuScreen } from "./screens/MainMenuScreen.js"
import { CrearCotizacionScreen } from "./screens/CrearProyectoScreen.js"
import { UltimoNumeroScreen } from "./screens/UltimoNumeroScreen.js"
import { ListarProyectosScreen } from "./screens/ListarProyectosScreen.js"
import { ConfigPathScreen } from "./screens/ConfigPathScreen.js"
import { ConsultarMenuScreen } from "./screens/ConsultarMenuScreen.js"
import { ConfiguracionesMenuScreen } from "./screens/ConfiguracionesMenuScreen.js"
import { ConfigValueScreen } from "./screens/ConfigValueScreen.js"
import { AuthLoginScreen } from "./screens/AuthLoginScreen.js"
import { AuthStatusScreen } from "./screens/AuthStatusScreen.js"
import { AuthLogoutScreen } from "./screens/AuthLogoutScreen.js"
import { RecrearCarpetaScreen } from "./screens/RecrearCarpetaScreen.js"
import { OrganizeByTypeScreen } from "./screens/OrganizeByTypeScreen.js"
import { OrganizeByDateMenuScreen } from "./screens/OrganizeByDateMenuScreen.js"
import { OrganizeByDateScreen } from "./screens/OrganizeByDateScreen.js"

export function App() {
  const { exit } = useApp()
  const { currentScreen, navigateTo, goBack } = useScreenState<ScreenType>("main-menu")

  const handleMainSelection = (screen: string) => {
    if (screen === "exit") {
      exit()
      process.nextTick(() => process.exit(0))
      return
    }
    navigateTo(screen as ScreenType)
  }

  const handleScreenSelection = (screen: string) => {
    navigateTo(screen as ScreenType)
  }

  const renderScreen = () => {
    switch (currentScreen) {
      case "main-menu":
        return <MainMenuScreen onSelect={handleMainSelection} />
      case "crear-cotizacion":
        return <CrearCotizacionScreen onBack={goBack} />
      case "consultar-menu":
        return <ConsultarMenuScreen onSelect={handleScreenSelection} onBack={goBack} />
      case "configuraciones-menu":
        return <ConfiguracionesMenuScreen onSelect={handleScreenSelection} onBack={goBack} />
      case "organize-by-type":
        return <OrganizeByTypeScreen onBack={goBack} />
      case "organize-by-date-menu":
        return <OrganizeByDateMenuScreen onSelect={handleScreenSelection} onBack={goBack} />
      case "organize-by-date-year":
        return <OrganizeByDateScreen onBack={goBack} mode="year" />
      case "organize-by-date-month":
        return <OrganizeByDateScreen onBack={goBack} mode="month" />
      case "organize-by-date-day":
        return <OrganizeByDateScreen onBack={goBack} mode="day" />
      case "ultimo-numero":
        return <UltimoNumeroScreen onBack={goBack} />
      case "listar-proyectos":
        return <ListarProyectosScreen onBack={goBack} />
      case "recrear-carpeta":
        return <RecrearCarpetaScreen onBack={goBack} />
      case "config-auth-url":
        return (
          <ConfigValueScreen
            onBack={goBack}
            configKey="authUrl"
            title="Configurar Auth URL"
            description="URL base de Neon Auth."
            placeholder="https://.../auth"
          />
        )
      case "config-api-url":
        return (
          <ConfigValueScreen
            onBack={goBack}
            configKey="apiUrl"
            title="Configurar API URL"
            description="URL base de Neon Data API."
            placeholder="https://.../rest/v1"
          />
        )
      case "config-path":
        return <ConfigPathScreen onBack={goBack} />
      case "auth-login":
        return <AuthLoginScreen onBack={goBack} />
      case "auth-status":
        return <AuthStatusScreen onBack={goBack} />
      case "auth-logout":
        return <AuthLogoutScreen onBack={goBack} />
      default:
        return null
    }
  }

  return <Box flexDirection="column">{renderScreen()}</Box>
}
