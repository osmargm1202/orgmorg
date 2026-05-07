import React, { useMemo, useState } from "react"
import { Box, Text, useApp, useInput } from "ink"
import TextInput from "ink-text-input"
import {
  getProyectoById,
  listProyectosWithDiagnostics,
  updateProyectoNombre,
  type ProyectoListDiagnostic,
  type ProyectoWithCotizaciones,
} from "../../../db.js"
import { ScreenFrame } from "../components/ScreenFrame.js"
import { SelectList, type SelectItem } from "../components/SelectList.js"

type Phase =
  | "mode"
  | "id-input"
  | "search-input"
  | "select-project"
  | "rename-input"
  | "saving"
  | "success"
  | "error"

export function EditarProyectoScreen({ onBack }: { onBack: () => void }) {
  const { exit } = useApp()
  const [phase, setPhase] = useState<Phase>("mode")
  const [modeIndex, setModeIndex] = useState(0)
  const [selectIndex, setSelectIndex] = useState(0)
  const [projectIdInput, setProjectIdInput] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [newName, setNewName] = useState("")
  const [selectedProject, setSelectedProject] = useState<ProyectoWithCotizaciones | null>(null)
  const [results, setResults] = useState<ProyectoWithCotizaciones[]>([])
  const [diagnostic, setDiagnostic] = useState<ProyectoListDiagnostic | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const modeItems: SelectItem[] = [
    { id: "by-id", label: "Editar por id" },
    { id: "by-search", label: "Buscar y seleccionar" },
  ]

  const resultItems = useMemo<SelectItem[]>(() => {
    if (results.length === 0) return []
    return results.map((project) => ({
      id: String(project.id),
      label: `${project.id} · ${project.nombre}`,
    }))
  }, [results])

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit()
      return
    }
    if (key.escape) {
      if (phase === "mode") {
        onBack()
        return
      }
      if (phase === "select-project") {
        setPhase("search-input")
        return
      }
      if (phase === "rename-input") {
        setPhase(selectedProject ? "select-project" : "mode")
        return
      }
      setPhase("mode")
      setMessage(null)
      return
    }

    if (phase === "mode") {
      if (key.upArrow) setModeIndex((current) => (current > 0 ? current - 1 : modeItems.length - 1))
      if (key.downArrow) setModeIndex((current) => (current < modeItems.length - 1 ? current + 1 : 0))
      if (key.return) {
        setMessage(null)
        setPhase(modeIndex === 0 ? "id-input" : "search-input")
      }
      return
    }

    if (phase === "select-project") {
      if (key.upArrow) setSelectIndex((current) => (current > 0 ? current - 1 : resultItems.length - 1))
      if (key.downArrow) setSelectIndex((current) => (current < resultItems.length - 1 ? current + 1 : 0))
      if (key.return && results[selectIndex]) {
        const project = results[selectIndex]
        setSelectedProject(project)
        setNewName(project.nombre)
        setPhase("rename-input")
      }
    }
  })

  const loadProjectById = () => {
    const projectId = Number(projectIdInput.trim())
    if (!Number.isInteger(projectId) || projectId <= 0) {
      setMessage("Debes indicar un id de proyecto válido.")
      return
    }

    try {
      const project = getProyectoById(projectId)
      if (!project) {
        setMessage(`No existe el proyecto con id ${projectId}.`)
        setPhase("id-input")
        return
      }
      setSelectedProject({ id: project.id, nombre: project.nombre, clienteId: project.cliente_id, clienteNombre: "", cotizaciones: [] })
      setNewName(project.nombre)
      setMessage(null)
      setPhase("rename-input")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
      setPhase("error")
    }
  }

  const searchProjects = () => {
    const term = searchTerm.trim()
    if (!term) {
      setMessage("Debes escribir un nombre o parte del nombre para buscar.")
      return
    }

    try {
      const result = listProyectosWithDiagnostics(term)
      setResults(result.proyectos)
      setDiagnostic(result.diagnostic)
      setSelectIndex(0)
      if (result.proyectos.length === 0) {
        setMessage(result.diagnostic?.message ?? "No se encontraron proyectos.")
        setPhase("search-input")
        return
      }
      setMessage(null)
      setPhase("select-project")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
      setPhase("error")
    }
  }

  const saveName = () => {
    if (!selectedProject) {
      setMessage("Primero selecciona un proyecto.")
      setPhase("mode")
      return
    }

    const trimmed = newName.trim()
    if (!trimmed) {
      setMessage("El nuevo nombre no puede estar vacío.")
      return
    }

    try {
      const updated = updateProyectoNombre(selectedProject.id, trimmed)
      setSelectedProject({ ...selectedProject, nombre: updated.nombre })
      setMessage(`Proyecto ${updated.id} actualizado a: ${updated.nombre}`)
      setPhase("success")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
      setPhase("error")
    }
  }

  if (phase === "mode") {
    return (
      <ScreenFrame title="Editar proyecto" help="↑/↓ mover · Enter elegir · Esc volver · Ctrl+C salir">
        <Text>Elige cómo quieres localizar el proyecto que vas a renombrar.</Text>
        <Box marginTop={1}>
          <SelectList items={modeItems} selectedIndex={modeIndex} maxVisible={4} />
        </Box>
      </ScreenFrame>
    )
  }

  if (phase === "id-input") {
    return (
      <ScreenFrame title="Editar proyecto" help="Escribe el id · Enter continuar · Esc volver">
        <Text>Ingresa el id del proyecto existente.</Text>
        <Box marginTop={1}>
          <Text color="gray">Id: </Text>
          <TextInput value={projectIdInput} onChange={setProjectIdInput} onSubmit={loadProjectById} />
        </Box>
        {message ? <Box marginTop={1}><Text color="yellow">{message}</Text></Box> : null}
      </ScreenFrame>
    )
  }

  if (phase === "search-input") {
    return (
      <ScreenFrame title="Editar proyecto" help="Escribe un filtro · Enter buscar · Esc volver">
        <Text>Busca el proyecto por nombre para seleccionarlo desde la lista.</Text>
        <Box marginTop={1}>
          <Text color="gray">Nombre: </Text>
          <TextInput value={searchTerm} onChange={setSearchTerm} onSubmit={searchProjects} />
        </Box>
        {message ? <Box marginTop={1}><Text color="yellow">{message}</Text></Box> : null}
      </ScreenFrame>
    )
  }

  if (phase === "select-project") {
    return (
      <ScreenFrame title="Editar proyecto" help="↑/↓ mover · Enter elegir · Esc volver a buscar">
        <Text>Selecciona el proyecto que quieres editar.</Text>
        {diagnostic && results.length === 0 ? <Box marginTop={1}><Text color="yellow">{diagnostic.message}</Text></Box> : null}
        <Box marginTop={1}>
          <SelectList items={resultItems} selectedIndex={selectIndex} maxVisible={8} />
        </Box>
      </ScreenFrame>
    )
  }

  if (phase === "rename-input") {
    return (
      <ScreenFrame title="Editar proyecto" help="Edita el nombre · Enter guardar · Esc volver">
        <Text>
          <Text color="gray">Proyecto: </Text>
          <Text color="yellow">{selectedProject?.id}</Text>
          <Text color="gray"> · actual: </Text>
          <Text>{selectedProject?.nombre}</Text>
        </Text>
        <Box marginTop={1}>
          <Text color="gray">Nuevo nombre: </Text>
          <TextInput value={newName} onChange={setNewName} onSubmit={saveName} />
        </Box>
        {message ? <Box marginTop={1}><Text color="yellow">{message}</Text></Box> : null}
      </ScreenFrame>
    )
  }

  if (phase === "saving") {
    return (
      <ScreenFrame title="Editar proyecto" help="Procesando...">
        <Text color="yellow">Procesando…</Text>
      </ScreenFrame>
    )
  }

  if (phase === "success") {
    return (
      <ScreenFrame title="Editar proyecto" help="Esc volver · Ctrl+C salir">
        <Text color="green">{message}</Text>
      </ScreenFrame>
    )
  }

  return (
    <ScreenFrame title="Editar proyecto" help="Esc volver · Ctrl+C salir">
      <Text color="red">{message}</Text>
    </ScreenFrame>
  )
}
