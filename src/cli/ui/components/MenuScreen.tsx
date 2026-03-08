import React, { useState, useMemo } from "react"
import { useApp, useInput, useStdout } from "ink"
import { ScreenFrame } from "./ScreenFrame.js"
import { SelectList, type SelectItem } from "./SelectList.js"

const FRAME_OVERHEAD_ROWS = 5
const ROWS_PER_ITEM = 2

export function MenuScreen({
  title,
  help,
  items,
  onSelect,
  onBack,
}: {
  title: string
  help: string
  items: SelectItem[]
  onSelect: (id: string) => void
  onBack?: () => void
}) {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const [selectedIndex, setSelectedIndex] = useState(0)

  const maxVisible = useMemo(() => {
    const rows = stdout?.rows ?? 24
    const contentRows = Math.max(3, rows - FRAME_OVERHEAD_ROWS)
    return Math.max(3, Math.floor(contentRows / ROWS_PER_ITEM))
  }, [stdout?.rows])

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit()
      return
    }
    if (key.escape && onBack) {
      onBack()
      return
    }
    if (key.upArrow) {
      setSelectedIndex((current) => (current > 0 ? current - 1 : items.length - 1))
      return
    }
    if (key.downArrow) {
      setSelectedIndex((current) => (current < items.length - 1 ? current + 1 : 0))
      return
    }
    if (key.return) {
      onSelect(items[selectedIndex].id)
    }
  })

  return (
    <ScreenFrame title={title} help={help}>
      <SelectList
        items={items}
        selectedIndex={selectedIndex}
        boxed={false}
        maxVisible={maxVisible}
      />
    </ScreenFrame>
  )
}
