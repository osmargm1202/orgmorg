import React from "react"
import { useApp } from "ink"
import { useScreenState } from "./hooks/useScreenState.js"
import type { ScreenType } from "./types.js"
import { AppShell } from "./components/AppShell.js"
import { MainMenuScreen } from "./screens/MainMenuScreen.js"
import { CrearCotizacionScreen } from "./screens/CrearProyectoScreen.js"
import { UltimoNumeroScreen } from "./screens/UltimoNumeroScreen.js"
import { ListarProyectosScreen } from "./screens/ListarProyectosScreen.js"
import { EditarProyectoScreen } from "./screens/EditarProyectoScreen.js"
import { ConfigPathScreen } from "./screens/ConfigPathScreen.js"
import { ConsultarMenuScreen } from "./screens/ConsultarMenuScreen.js"
import { ConfiguracionesMenuScreen } from "./screens/ConfiguracionesMenuScreen.js"
import { ConfigValueScreen } from "./screens/ConfigValueScreen.js"
import { RecrearCarpetaScreen } from "./screens/RecrearCarpetaScreen.js"
import { OrganizeByTypeScreen } from "./screens/OrganizeByTypeScreen.js"
import { OrganizeByDateMenuScreen } from "./screens/OrganizeByDateMenuScreen.js"
import { OrganizeByDateScreen } from "./screens/OrganizeByDateScreen.js"
import { CLI_VERSION } from "../../version.js"

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
      case "editar-proyecto":
        return <EditarProyectoScreen onBack={goBack} />
      case "recrear-carpeta":
        return <RecrearCarpetaScreen onBack={goBack} />
      case "config-db-path":
        return (
          <ConfigValueScreen
            onBack={goBack}
            configKey="dbPath"
            title="Configurar ruta de base de datos"
            description="Ruta del archivo SQLite."
            placeholder="~/.config/orgmorg/proyectos.db"
          />
        )
      case "config-path":
        return <ConfigPathScreen onBack={goBack} />
      default:
        return null
    }
  }

  return (
    <AppShell appVersion={CLI_VERSION}>
      {renderScreen()}
    </AppShell>
  )
}
