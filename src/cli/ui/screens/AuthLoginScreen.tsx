import React, { useEffect, useState } from "react"
import { Text, useApp, useInput } from "ink"
import { runOAuthLogin } from "../../../auth/neon.js"
import { ScreenFrame } from "../components/ScreenFrame.js"

export function AuthLoginScreen({ onBack }: { onBack: () => void }) {
  const { exit } = useApp()
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading")
  const [message, setMessage] = useState("Abriendo el navegador para iniciar sesión...")

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const session = await runOAuthLogin()
        if (!cancelled) {
          setStatus("done")
          setMessage(
            `Sesión iniciada como ${session.user.email ?? session.user.name ?? session.user.id}.`
          )
        }
      } catch (error) {
        if (!cancelled) {
          setStatus("error")
          setMessage(error instanceof Error ? error.message : String(error))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit()
      return
    }
    if (key.escape && status !== "loading") {
      onBack()
    }
  })

  return (
    <ScreenFrame
      title="Iniciar sesión OAuth"
      help={status === "loading" ? "Completa el login en el navegador" : "Esc volver · Ctrl+C salir"}
    >
      <Text color={status === "done" ? "green" : status === "error" ? "red" : "yellow"}>
        {message}
      </Text>
    </ScreenFrame>
  )
}
