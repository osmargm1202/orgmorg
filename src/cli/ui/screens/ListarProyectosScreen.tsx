import React, { useState } from "react"
import { Box, Text, useInput, useApp } from "ink"
import TextInput from "ink-text-input"
import {
  listProyectosWithDiagnostics,
  type ProyectoListDiagnostic,
  type ProyectoWithCotizaciones,
} from "../../../db.js"
import { ScreenFrame } from "../components/ScreenFrame.js"

type Phase = "input" | "loading" | "result" | "error"

export function ListarProyectosScreen({ onBack }: { onBack: () => void }) {
  const { exit } = useApp()
  const [phase, setPhase] = useState<Phase>("input")
  const [filter, setFilter] = useState("")
  const [list, setList] = useState<ProyectoWithCotizaciones[]>([])
  const [diagnostic, setDiagnostic] = useState<ProyectoListDiagnostic | null>(null)
  const [error, setError] = useState<string | null>(null)

  useInput((input, key) => {
    if (key.escape) {
      onBack()
      return
    }
    if (key.ctrl && input === "c") exit()
    if (phase !== "input") return
  })

  const handleSubmit = async () => {
    const nombre = filter.trim()
    setPhase("loading")
    setError(null)
    setDiagnostic(null)
    try {
      const result = await listProyectosWithDiagnostics(nombre || undefined)
      setList(result.proyectos)
      setDiagnostic(result.diagnostic)
      setPhase("result")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase("error")
    }
  }

  if (phase === "input") {
    return (
      <ScreenFrame
        title="Consultar proyectos"
        help="Escribe un filtro o deja vacío para listar · Enter consultar · Esc volver · Ctrl+C salir"
      >
        <Text>Busca proyectos por nombre o deja el filtro vacío para listar los primeros proyectos.</Text>
        <Box marginTop={1}>
          <Text color="gray">Nombre (o parte): </Text>
          <TextInput
            value={filter}
            onChange={setFilter}
            onSubmit={handleSubmit}
            placeholder="ej. RADISSON"
          />
        </Box>
      </ScreenFrame>
    )
  }

  if (phase === "loading") {
    return (
      <ScreenFrame title="Consultar proyectos" help="Consultando Neon Data API...">
        <Text color="yellow">Buscando proyectos…</Text>
      </ScreenFrame>
    )
  }

  if (phase === "error") {
    return (
      <ScreenFrame title="Consultar proyectos" help="Esc volver · Ctrl+C salir">
        <Text color="red">{error}</Text>
      </ScreenFrame>
    )
  }

  return (
    <ScreenFrame title="Consultar proyectos" help="Esc volver · Ctrl+C salir">
      <Text>
        {filter.trim()
          ? `Proyectos con “${filter.trim()}” (id, nombre, cotizaciones)`
          : "Proyectos disponibles (id, nombre, cotizaciones)"}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {list.length === 0 ? (
          <Text color={diagnostic?.kind === "no-visible-rows" ? "yellow" : "gray"}>
            {diagnostic?.message ??
              (filter.trim() ? "Ningún proyecto coincide con ese nombre." : "No hay proyectos cargados.")}
          </Text>
        ) : (
          list.slice(0, 50).map((p) => (
            <Box key={p.id} flexDirection="column">
              <Text>
                <Text color="gray">id </Text>
                <Text color="yellow">{p.id}</Text>
                <Text color="gray"> · </Text>
                <Text>{p.nombre}</Text>
                <Text color="gray"> · cotizaciones: </Text>
                <Text color="cyan">
                  {p.cotizaciones.length > 5
                    ? `${p.cotizaciones.slice(0, 3).join(", ")}… (${p.cotizaciones.length})`
                    : p.cotizaciones.join(", ") || "—"}
                </Text>
              </Text>
            </Box>
          ))
        )}
        {list.length > 50 && (
          <Box marginTop={1}>
            <Text dimColor>… y {list.length - 50} más</Text>
          </Box>
        )}
      </Box>
    </ScreenFrame>
  )
}
