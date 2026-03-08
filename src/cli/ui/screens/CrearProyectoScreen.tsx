import React, { useState } from "react"
import { Box, Text, useInput, useApp } from "ink"
import TextInput from "ink-text-input"
import {
  listProyectosWithDiagnostics,
  type ProyectoListDiagnostic,
  type ProyectoWithCotizaciones,
} from "../../../db.js"
import {
  FolderCreationAfterPersistError,
  createCotizacionWithFolder,
  getCreateCotizacionPreview,
  type CreateCotizacionInput,
} from "../../../services/cotizaciones.js"
import { ScreenFrame } from "../components/ScreenFrame.js"
import { SelectList } from "../components/SelectList.js"

type Phase =
  | "mode"
  | "new-name"
  | "search"
  | "search-loading"
  | "search-results"
  | "confirm"
  | "submitting"
  | "done"
  | "error"

export function CrearCotizacionScreen({ onBack }: { onBack: () => void }) {
  const { exit } = useApp()
  const [phase, setPhase] = useState<Phase>("mode")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [nombre, setNombre] = useState("")
  const [search, setSearch] = useState("")
  const [searchResults, setSearchResults] = useState<ProyectoWithCotizaciones[]>([])
  const [searchDiagnostic, setSearchDiagnostic] = useState<ProyectoListDiagnostic | null>(null)
  const [pendingInput, setPendingInput] = useState<CreateCotizacionInput | null>(null)
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof getCreateCotizacionPreview>> | null>(
    null
  )
  const [message, setMessage] = useState("")

  useInput((input, key) => {
    if (phase === "search-loading" || phase === "submitting") return
    if (key.escape) {
      if (phase === "confirm") {
        setPhase(pendingInput?.kind === "existing" ? "search-results" : "new-name")
      } else if (phase === "search-results") {
        setPhase("search")
      } else if (phase === "new-name" || phase === "search" || phase === "mode") {
        onBack()
      } else {
        onBack()
      }
      return
    }
    if (key.ctrl && input === "c") exit()

    if (phase === "mode" || phase === "search-results" || phase === "confirm") {
      const itemsLength =
        phase === "mode" ? 2 : phase === "confirm" ? 2 : searchResults.length + 2

      if (key.upArrow) {
        setSelectedIndex((index) => (index > 0 ? index - 1 : itemsLength - 1))
        return
      }
      if (key.downArrow) {
        setSelectedIndex((index) => (index < itemsLength - 1 ? index + 1 : 0))
        return
      }
      if (key.return) {
        void handleSelection()
      }
    }
  })

  const moveToConfirm = async (input: CreateCotizacionInput) => {
    const nextPreview = await getCreateCotizacionPreview(input)
    setPendingInput(input)
    setPreview(nextPreview)
    setSelectedIndex(0)
    setPhase("confirm")
  }

  const handleNewProjectSubmit = async () => {
    const trimmed = nombre.trim()
    if (!trimmed) return
    await moveToConfirm({ kind: "new", nombre: trimmed })
  }

  const handleSearchSubmit = async () => {
    const trimmed = search.trim()
    setPhase("search-loading")
    setSearchDiagnostic(null)
    try {
      const result = await listProyectosWithDiagnostics(trimmed || undefined)
      setSearchResults(result.proyectos)
      setSearchDiagnostic(result.diagnostic)
      setSelectedIndex(0)
      setPhase("search-results")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
      setPhase("error")
    }
  }

  const handleSelection = async () => {
    if (phase === "mode") {
      if (selectedIndex === 0) {
        setNombre("")
        setPhase("new-name")
      } else {
        setSearch("")
        setPhase("search")
      }
      return
    }

    if (phase === "search-results") {
      if (selectedIndex === 0) {
        setPhase("search")
        return
      }
      if (selectedIndex === 1) {
        setNombre("")
        setPhase("new-name")
        return
      }
      const selectedProject = searchResults[selectedIndex - 2]
      if (!selectedProject) return
      await moveToConfirm({
        kind: "existing",
        proyectoId: selectedProject.id,
        nombre: selectedProject.nombre,
      })
      return
    }

    if (phase === "confirm" && pendingInput && preview) {
      if (selectedIndex === 1) {
        setMessage("Operación cancelada.")
        setPhase("done")
        return
      }

      setPhase("submitting")
      try {
        const result = await createCotizacionWithFolder(pendingInput)
        setMessage(`Cotización ${result.cotizacion} creada. Carpeta: ${result.targetDir}`)
        setPhase("done")
      } catch (error) {
        if (error instanceof FolderCreationAfterPersistError) {
          setMessage(
            `La base de datos se actualizó con la cotización ${error.result.cotizacion}, pero la carpeta falló.\nRecuperación: orgmorg project recover ${error.result.cotizacion}`
          )
        } else {
          setMessage(error instanceof Error ? error.message : String(error))
        }
        setPhase("error")
      }
    }
  }

  if (phase === "submitting") {
    return (
      <ScreenFrame title="Crear cotización" help="Actualizando base de datos y creando carpeta...">
        <Text color="yellow">Procesando cotización...</Text>
      </ScreenFrame>
    )
  }

  if (phase === "search-loading") {
    return (
      <ScreenFrame title="Crear cotización" help="Buscando proyectos existentes...">
        <Text color="yellow">Buscando proyectos...</Text>
      </ScreenFrame>
    )
  }

  if (phase === "done" || phase === "error") {
    return (
      <ScreenFrame title="Crear cotización" help="Esc volver · Ctrl+C salir">
        <Text color={phase === "done" ? "green" : "red"}>{message}</Text>
      </ScreenFrame>
    )
  }

  if (phase === "mode") {
    return (
      <ScreenFrame title="Crear cotización" help="↑/↓ mover · Enter elegir · Esc volver · Ctrl+C salir">
        <Text>¿La cotización es para un proyecto nuevo o para uno existente?</Text>
        <Box marginTop={1}>
          <SelectList
            selectedIndex={selectedIndex}
            items={[
              { id: "new", label: "Proyecto nuevo" },
              { id: "existing", label: "Proyecto existente" },
            ]}
          />
        </Box>
      </ScreenFrame>
    )
  }

  if (phase === "new-name") {
    return (
      <ScreenFrame title="Crear cotización" help="Escribe el nombre y presiona Enter · Esc volver · Ctrl+C salir">
        <Text>Nombre del proyecto nuevo</Text>
        <Box marginTop={1}>
          <Text color="gray">Nombre: </Text>
          <TextInput
            value={nombre}
            onChange={setNombre}
            onSubmit={() => void handleNewProjectSubmit()}
            placeholder="ej. Mi Proyecto"
          />
        </Box>
      </ScreenFrame>
    )
  }

  if (phase === "search") {
    return (
      <ScreenFrame
        title="Crear cotización"
        help="Busca por nombre o deja vacío para listar · Enter consultar · Esc volver · Ctrl+C salir"
      >
        <Text>Buscar proyecto existente</Text>
        <Box marginTop={1}>
          <Text color="gray">Nombre: </Text>
          <TextInput
            value={search}
            onChange={setSearch}
            onSubmit={() => void handleSearchSubmit()}
            placeholder="ej. RADISSON"
          />
        </Box>
      </ScreenFrame>
    )
  }

  if (phase === "search-results") {
    const items = [
      { id: "search-again", label: "Realizar una nueva búsqueda" },
      { id: "create-new", label: "Crear un proyecto nuevo" },
      ...searchResults.map((project) => ({
        id: `project-${project.id}`,
        label: project.nombre,
        hint: `id ${project.id} · cotizaciones: ${project.cotizaciones.join(", ") || "—"}`,
      })),
    ]

    return (
      <ScreenFrame
        title="Crear cotización"
        help="↑/↓ mover · Enter elegir · Esc volver · Ctrl+C salir"
      >
        <Text>{search.trim() ? `Resultados para “${search.trim()}”` : "Proyectos existentes disponibles"}</Text>
        {searchResults.length === 0 && searchDiagnostic ? (
          <Box marginTop={1}>
            <Text color={searchDiagnostic.kind === "no-visible-rows" ? "yellow" : "gray"}>
              {searchDiagnostic.message}
            </Text>
          </Box>
        ) : null}
        <Box marginTop={1}>
          <SelectList selectedIndex={selectedIndex} items={items} />
        </Box>
      </ScreenFrame>
    )
  }

  return (
    <ScreenFrame title="Crear cotización" help="↑/↓ elegir · Enter confirmar · Esc volver · Ctrl+C salir">
      <Text>Resumen antes de crear</Text>
      {preview ? (
        <Box flexDirection="column" marginTop={1}>
          <Text>Proyecto: {preview.nombre}</Text>
          <Text>Tipo: {preview.existingProject ? "Existente" : "Nuevo"}</Text>
          <Text>Próximo número: {preview.numero}</Text>
          <Text>Carpeta: {preview.folderName}</Text>
          <Text>Ruta: {preview.targetDir}</Text>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <SelectList
          selectedIndex={selectedIndex}
          items={[
            { id: "confirm-yes", label: "Sí, crear cotización y carpeta" },
            { id: "confirm-no", label: "Cancelar" },
          ]}
        />
      </Box>
    </ScreenFrame>
  )
}
