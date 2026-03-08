import React, { useState } from "react"
import { Box, Text, useApp, useInput } from "ink"
import { runOrganize } from "../../../organize.js"
import { ScreenFrame } from "../components/ScreenFrame.js"
import { SelectList } from "../components/SelectList.js"
import { captureConsoleOutput } from "../utils/captureConsoleOutput.js"

type ScreenStatus = "confirm" | "loading" | "done" | "error"

const CONFIRM_ITEMS = [
  { id: "yes", label: "Sí", hint: "Organizar ahora el directorio actual" },
  { id: "no", label: "No", hint: "Cancelar y volver al menú anterior" },
]

export function OrganizeByTypeScreen({ onBack }: { onBack: () => void }) {
  const { exit } = useApp()
  const [status, setStatus] = useState<ScreenStatus>("confirm")
  const [message, setMessage] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const currentDir = process.cwd()

  const executeOrganize = () => {
    setStatus("loading")
    setMessage("")

    void (async () => {
      try {
        await captureConsoleOutput(() => runOrganize(currentDir))
        setStatus("done")
        setMessage("Organización por tipo completada en el directorio actual.")
      } catch (error) {
        setStatus("error")
        setMessage(error instanceof Error ? error.message : String(error))
      }
    })()
  }

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit()
      return
    }

    if (status === "confirm") {
      if (key.escape) {
        onBack()
        return
      }
      if (key.upArrow || key.leftArrow) {
        setSelectedIndex((current) => (current > 0 ? current - 1 : CONFIRM_ITEMS.length - 1))
        return
      }
      if (key.downArrow || key.rightArrow) {
        setSelectedIndex((current) => (current < CONFIRM_ITEMS.length - 1 ? current + 1 : 0))
        return
      }
      if (key.return || ["s", "S", "y", "Y", "n", "N"].includes(input)) {
        const shouldConfirm = key.return ? selectedIndex === 0 : ["s", "S", "y", "Y"].includes(input)
        if (shouldConfirm) {
          executeOrganize()
          return
        }
        onBack()
        return
      }
      return
    }

    if (key.escape && status !== "loading") {
      onBack()
    }
  })

  if (status === "confirm") {
    return (
      <ScreenFrame title="Organizar por tipo" help="↑/↓ elegir · Enter confirmar · Esc volver · Ctrl+C salir">
        <Text>Directorio actual:</Text>
        <Text color="gray">{currentDir}</Text>
        <Box marginTop={1} marginBottom={1}>
          <Text>¿Confirmas que deseas organizar por tipo el directorio actual?</Text>
        </Box>
        <SelectList items={CONFIRM_ITEMS} selectedIndex={selectedIndex} boxed={false} />
      </ScreenFrame>
    )
  }

  if (status === "loading") {
    return (
      <ScreenFrame
        title="Organizar por tipo"
        help="Ejecutando en el directorio actual... · Ctrl+C salir"
      >
        <Text color="yellow">Organizando archivos por extensión...</Text>
      </ScreenFrame>
    )
  }

  return (
    <ScreenFrame title="Organizar por tipo" help="Esc volver · Ctrl+C salir">
      <Text>Directorio actual:</Text>
      <Text color="gray">{currentDir}</Text>
      <Box marginTop={1}>
        <Text color={status === "done" ? "green" : "red"}>{message}</Text>
      </Box>
    </ScreenFrame>
  )
}
