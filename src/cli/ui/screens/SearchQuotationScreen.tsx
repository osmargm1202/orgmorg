import React, { useEffect, useState } from "react"
import { Box, Text, useApp, useInput } from "ink"
import TextInput from "ink-text-input"
import {
  AdminApiClient,
  type QuotationSearchResult,
} from "../../../admin-api.js"
import {
  isConfigComplete,
  loadConfig,
  type CompleteConfig,
  type Config,
} from "../../../config.js"
import {
  getQuotationFolderPreview,
  syncQuotationFolder,
  type QuotationFolderPreview,
} from "../../../services/project-folders.js"
import { ScreenFrame } from "../components/ScreenFrame.js"
import { SelectList } from "../components/SelectList.js"

type Phase =
  | "loading-config"
  | "config-error"
  | "query"
  | "searching"
  | "results"
  | "confirm"
  | "creating"
  | "done"
  | "error"

export interface SearchScreenDependencies {
  loadConfig: () => Promise<Config>
  search: (config: CompleteConfig, query: string) => Promise<QuotationSearchResult[]>
  preview: (
    basePath: string,
    quotation: QuotationSearchResult
  ) => QuotationFolderPreview
  sync: (
    config: CompleteConfig,
    quotation: QuotationSearchResult
  ) => Promise<QuotationFolderPreview>
}

const defaultDependencies: SearchScreenDependencies = {
  loadConfig,
  search: async (config, query) =>
    new AdminApiClient(config).searchQuotationsByProjectName(query),
  preview: getQuotationFolderPreview,
  sync: async (config, quotation) => {
    const client = new AdminApiClient(config)
    return syncQuotationFolder({
      basePath: config.basePath,
      quotation,
      downloadPdf: (destination) => client.downloadQuotationPdf(quotation.id, destination),
    })
  },
}

export function SearchQuotationScreen({
  onBack,
  onConfigure,
  dependencies = defaultDependencies,
}: {
  onBack: () => void
  onConfigure: () => void
  dependencies?: SearchScreenDependencies
}) {
  const { exit } = useApp()
  const [phase, setPhase] = useState<Phase>("loading-config")
  const [config, setConfig] = useState<CompleteConfig | null>(null)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<QuotationSearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [confirmationIndex, setConfirmationIndex] = useState(0)
  const [selectedQuotation, setSelectedQuotation] = useState<QuotationSearchResult | null>(
    null
  )
  const [preview, setPreview] = useState<QuotationFolderPreview | null>(null)
  const [completed, setCompleted] = useState<QuotationFolderPreview | null>(null)
  const [message, setMessage] = useState("")
  const [readyForSelection, setReadyForSelection] = useState(true)

  useEffect(() => {
    let cancelled = false
    void dependencies
      .loadConfig()
      .then((loaded) => {
        if (cancelled) return
        if (!isConfigComplete(loaded)) {
          setPhase("config-error")
          return
        }
        setConfig(loaded)
        setPhase("query")
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : String(error))
          setPhase("error")
        }
      })
    return () => {
      cancelled = true
    }
  }, [dependencies])

  useEffect(() => {
    if (phase !== "results" && phase !== "confirm") {
      setReadyForSelection(true)
      return
    }
    setReadyForSelection(false)
    const timer = setTimeout(() => setReadyForSelection(true), 50)
    return () => clearTimeout(timer)
  }, [phase])

  const handleSearch = async () => {
    const trimmed = query.trim()
    if (!config || !trimmed) {
      setMessage("Escribe un nombre de proyecto para buscar.")
      return
    }

    setMessage("")
    setPhase("searching")
    try {
      const found = await dependencies.search(config, trimmed)
      setResults(found)
      setSelectedIndex(0)
      if (found.length === 0) {
        setMessage(`No se encontraron cotizaciones para “${trimmed}”.`)
        setPhase("error")
      } else {
        setPhase("results")
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
      setPhase("error")
    }
  }

  const openConfirmation = () => {
    const quotation = results[selectedIndex]
    if (!config || !quotation) return
    setSelectedQuotation(quotation)
    setPreview(dependencies.preview(config.basePath, quotation))
    setConfirmationIndex(0)
    setPhase("confirm")
  }

  const createFolder = async () => {
    if (!config || !selectedQuotation) return
    setPhase("creating")
    try {
      const result = await dependencies.sync(config, selectedQuotation)
      setCompleted(result)
      setPhase("done")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
      setPhase("error")
    }
  }

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit()
      return
    }
    if (phase === "loading-config" || phase === "searching" || phase === "creating") return

    if (key.escape) {
      if (phase === "results") {
        setPhase("query")
      } else if (phase === "confirm") {
        setPhase("results")
      } else if (phase === "done" || phase === "error") {
        setMessage("")
        setPhase(config ? "query" : "config-error")
      } else {
        onBack()
      }
      return
    }

    if (phase === "config-error" && key.return) {
      onConfigure()
      return
    }

    if (!readyForSelection) return

    if (phase === "results") {
      if (key.upArrow) {
        setSelectedIndex((current) => (current > 0 ? current - 1 : results.length - 1))
      } else if (key.downArrow) {
        setSelectedIndex((current) => (current < results.length - 1 ? current + 1 : 0))
      } else if (key.return) {
        openConfirmation()
      }
      return
    }

    if (phase === "confirm") {
      if (key.upArrow || key.downArrow) {
        setConfirmationIndex((current) => (current === 0 ? 1 : 0))
      } else if (key.return) {
        if (confirmationIndex === 0) void createFolder()
        else setPhase("results")
      }
    }
  })

  if (phase === "loading-config") {
    return (
      <ScreenFrame title="Buscar cotización" help="Cargando configuración...">
        <Text color="yellow">Cargando configuración...</Text>
      </ScreenFrame>
    )
  }

  if (phase === "config-error") {
    return (
      <ScreenFrame title="Buscar cotización" help="Enter configurar · Esc volver · Ctrl+C salir">
        <Text color="yellow">Configuración incompleta.</Text>
        <Text>Configura endpoint, carpeta base y API key antes de buscar.</Text>
      </ScreenFrame>
    )
  }

  if (phase === "searching" || phase === "creating") {
    return (
      <ScreenFrame
        title="Buscar cotización"
        help={phase === "searching" ? "Consultando API..." : "Descargando PDF y preparando carpeta..."}
      >
        <Text color="yellow">
          {phase === "searching" ? "Buscando cotizaciones..." : "Creando carpeta..."}
        </Text>
      </ScreenFrame>
    )
  }

  if (phase === "done" && completed) {
    return (
      <ScreenFrame title="Carpeta lista" help="Esc buscar otra · Ctrl+C salir">
        <Text color="green">Carpeta lista.</Text>
        <Text>Ruta: {completed.targetDir}</Text>
        <Text>PDF: {completed.pdfPath}</Text>
      </ScreenFrame>
    )
  }

  if (phase === "error") {
    return (
      <ScreenFrame title="No se completó la operación" help="Esc volver · Ctrl+C salir">
        <Text color="red">{message}</Text>
      </ScreenFrame>
    )
  }

  if (phase === "query") {
    return (
      <ScreenFrame
        title="Buscar cotización"
        help="Escribe el nombre y presiona Enter · Esc volver · Ctrl+C salir"
      >
        <Text>Nombre del proyecto</Text>
        {message ? <Text color="yellow">{message}</Text> : null}
        <Box marginTop={1}>
          <Text color="gray">Proyecto: </Text>
          <TextInput
            value={query}
            onChange={setQuery}
            onSubmit={() => void handleSearch()}
            placeholder="ej. Torre Central"
          />
        </Box>
      </ScreenFrame>
    )
  }

  if (phase === "results") {
    return (
      <ScreenFrame
        title="Cotizaciones encontradas"
        help="↑/↓ mover · Enter elegir · Esc buscar otra · Ctrl+C salir"
      >
        <SelectList
          selectedIndex={selectedIndex}
          items={results.map((quotation) => ({
            id: String(quotation.id),
            label: [
              `#${quotation.id}`,
              quotation.projectName,
              quotation.date,
              quotation.status,
              quotation.description,
            ]
              .filter(Boolean)
              .join(" · "),
          }))}
        />
      </ScreenFrame>
    )
  }

  return (
    <ScreenFrame
      title="Confirmar creación"
      help="↑/↓ elegir · Enter confirmar · Esc volver · Ctrl+C salir"
    >
      <Text>Confirmar cotización #{selectedQuotation?.id}</Text>
      <Text>Proyecto: {selectedQuotation?.projectName}</Text>
      <Text>Carpeta: {preview?.targetDir}</Text>
      <Text>PDF: {preview?.pdfPath}</Text>
      <Box marginTop={1}>
        <SelectList
          selectedIndex={confirmationIndex}
          items={[
            { id: "confirm", label: "Sí, crear o actualizar carpeta" },
            { id: "cancel", label: "Cancelar" },
          ]}
        />
      </Box>
    </ScreenFrame>
  )
}
