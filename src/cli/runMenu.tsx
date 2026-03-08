import React from "react"
import { render } from "ink"
import { App } from "./ui/App.js"

export async function runMenu(): Promise<void> {
  const { waitUntilExit } = render(React.createElement(App), { exitOnCtrlC: false })
  await waitUntilExit()
}
