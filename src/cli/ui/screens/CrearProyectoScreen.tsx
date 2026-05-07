import React, { useState } from "react"
import { Box, Text, useInput, useApp } from "ink"
import TextInput from "ink-text-input"
import {
  listProyectosWithDiagnostics,
  listClientes,
  type ProyectoListDiagnostic,
  type ProyectoWithCotizaciones,
  type ClienteRow,
} from "../../../db.js"
import {
  FolderCreationAfterPersistError,
  createCotizacionWithFolder,
  getCreateCotizacionPreview,
  type CreateCotizacionInput,
} from "../../../services/cotizaciones.js"
import { ScreenFrame } from "../components/ScreenFrame.js"
import { SelectList } from "../components/SelectList.js"
import { PRIMARY_COLOR } from "../theme.js"

type Phase =
  | "mode"
  | "select-cliente"
  | "cliente-loading"
  | "cliente-results"
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
  const [clienteSearch, setClienteSearch] = useState("")
  const [clientes, setClientes] = useState<ClienteRow[]>([])
  const [selectedCliente, setSelectedCliente] = useState<ClienteRow | null>(null)
  const [searchResults, setSearchResults] = useState<ProyectoWithCotizaciones[]>([])
  const [searchDiagnostic, setSearchDiagnostic] = useState<ProyectoListDiagnostic | null>(null)
  const [pendingInput, setPendingInput] = useState<CreateCotizacionInput | null>(null)
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof getCreateCotizacionPreview>> | null>(
    null
  )
  const [message, setMessage] = useState("")

  useInput((input, key) => {
    if (phase === "search-loading" || phase === "submitting" || phase === "cliente-loading") return
    if (key.escape) {
      if (phase === "confirm") {
        setPhase(pendingInput?.kind === "existing" ? "search-results" : "new-name")
      } else if (phase === "search-results") {
        setPhase("search")
      } else if (phase === "cliente-results") {
        setPhase("select-cliente")
      } else if (phase === "new-name") {
        setPhase("mode")
      } else if (phase === "select-cliente" || phase === "search" || phase === "mode") {
        onBack()
      } else {
        onBack()
      }
      return
    }
    if (key.ctrl && input === "c") exit()

    if (phase === "mode" || phase === "cliente-results" || phase === "search-results" || phase === "confirm") {
      const itemsLength =
        phase === "mode" ? 2 : phase === "confirm" ? 2 : phase === "cliente-results" ? clientes.length + 1 : searchResults.length + 2

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
    if (!trimmed || !selectedCliente) return
    await moveToConfirm({ kind: "new", nombre: trimmed, clienteId: selectedCliente.id })
  }

  const handleSearchSubmit = () => {
    const trimmed = search.trim()
    setSearchDiagnostic(null)
    try {
      const result = listProyectosWithDiagnostics(trimmed || undefined)
      setSearchResults(result.proyectos)
      setSearchDiagnostic(result.diagnostic)
      setSelectedIndex(0)
      setPhase("search-results")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
      setPhase("error")
    }
  }

  const handleClienteSearchSubmit = () => {
    try {
      const results = listClientes(clienteSearch.trim() || undefined)
      setClientes(results)
      setSelectedIndex(0)
      setPhase("cliente-results")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
      setPhase("error")
    }
  }

  const handleSelection = async () => {
    if (phase === "mode") {
      if (selectedIndex === 0) {
        // New project — first select cliente
        setClienteSearch("")
        setSelectedCliente(null)
        setPhase("select-cliente")
      } else {
        // Existing project — search projects directly
        setSearch("")
        setPhase("search")
      }
      return
    }

    if (phase === "cliente-results") {
      if (selectedIndex === 0) {
        setPhase("select-cliente")
        return
      }
      const cliente = clientes[selectedIndex - 1]
      if (!cliente) return
      setSelectedCliente(cliente)
      setNombre("")
      setPhase("new-name")
      return
    }

    if (phase === "search-results") {
      if (selectedIndex === 0) {
        setPhase("search")
        return
      }
      if (selectedIndex === 1) {
        setClienteSearch("")
        setSelectedCliente(null)
        setPhase("select-cliente")
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

  if (phase === "cliente-loading" || phase === "search-loading") {
    return (
      <ScreenFrame title="Crear cotización" help="Buscando...">
        <Text color="yellow">Buscando...</Text>
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

  if (phase === "select-cliente") {
    return (
      <ScreenFrame
        title="Seleccionar cliente"
        help="Escribe un nombre o deja vacío para listar · Enter buscar · Esc volver · Ctrl+C salir"
      >
        <Text>Busca el cliente para el nuevo proyecto.</Text>
        <Box marginTop={1}>
          <Text color="gray">Cliente: </Text>
          <TextInput
            value={clienteSearch}
            onChange={setClienteSearch}
            onSubmit={handleClienteSearchSubmit}
            placeholder="ej. RADISSON"
          />
        </Box>
      </ScreenFrame>
    )
  }

  if (phase === "cliente-results") {
    const items = [
      { id: "search-again", label: "Realizar una nueva búsqueda" },
      ...clientes.map((c) => ({
        id: `cliente-${c.id}`,
        label: c.nombre,
      })),
    ]

    return (
      <ScreenFrame
        title="Seleccionar cliente"
        help="↑/↓ mover · Enter elegir · Esc volver · Ctrl+C salir"
      >
        <Text>
          {clienteSearch.trim()
            ? `Clientes que coinciden con "${clienteSearch.trim()}"`
            : "Clientes disponibles"}
        </Text>
        {clientes.length === 0 ? (
          <Box marginTop={1}>
            <Text color="yellow">No se encontraron clientes. Intenta con otro término.</Text>
          </Box>
        ) : null}
        <Box marginTop={1}>
          <SelectList selectedIndex={selectedIndex} items={items} />
        </Box>
      </ScreenFrame>
    )
  }

  if (phase === "new-name") {
    return (
      <ScreenFrame title="Crear cotización" help="Escribe el nombre y presiona Enter · Esc volver · Ctrl+C salir">
        <Text>
          <Text color="gray">Cliente: </Text>
          <Text color={PRIMARY_COLOR}>{selectedCliente?.nombre}</Text>
        </Text>
        <Box marginTop={1}>
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
            onSubmit={handleSearchSubmit}
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
      })),
    ]

    return (
      <ScreenFrame
        title="Crear cotización"
        help="↑/↓ mover · Enter elegir · Esc volver · Ctrl+C salir"
      >
        <Text>{search.trim() ? `Resultados para "${search.trim()}"` : "Proyectos existentes disponibles"}</Text>
        {searchResults.length === 0 && searchDiagnostic ? (
          <Box marginTop={1}>
            <Text color={searchDiagnostic.kind === "empty" ? "yellow" : "gray"}>
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
          <Text>Cliente: {preview.clienteNombre} (id {preview.clienteId})</Text>
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
