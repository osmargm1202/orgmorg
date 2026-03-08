import React from "react"
import { Box, Text } from "ink"

const ACCENT_COLOR = "blue"
const SELECTED_TEXT_COLOR = "white"

export interface SelectItem {
  id: string
  label: string
  hint?: string
}

function computeScrollWindow(
  itemCount: number,
  selectedIndex: number,
  maxVisible: number
): { start: number; end: number } {
  if (itemCount <= maxVisible) {
    return { start: 0, end: itemCount }
  }
  const halfVisible = Math.floor(maxVisible / 2)
  let start = Math.max(0, selectedIndex - halfVisible)
  let end = Math.min(itemCount, start + maxVisible)
  if (end - start < maxVisible) {
    start = Math.max(0, end - maxVisible)
  }
  return { start, end }
}

function SelectListComponent({
  items,
  selectedIndex,
  boxed = true,
  maxVisible,
}: {
  items: SelectItem[]
  selectedIndex: number
  boxed?: boolean
  maxVisible?: number
}) {
  const { start, end } =
    maxVisible != null
      ? computeScrollWindow(items.length, selectedIndex, maxVisible)
      : { start: 0, end: items.length }
  const visibleItems = items.slice(start, end)

  const content = (
    <Box flexDirection="column">
      {visibleItems.map((item, i) => {
        const index = start + i
        const selected = index === selectedIndex
        return (
          <Box
            key={item.id}
            flexDirection="column"
            paddingX={boxed ? 1 : 0}
          >
            <Text
              color={selected ? SELECTED_TEXT_COLOR : undefined}
              backgroundColor={selected ? ACCENT_COLOR : undefined}
              bold={selected}
            >
              {selected ? "> " : "  "}
              {item.label}
            </Text>
            {item.hint ? (
              <Text
                color={selected ? SELECTED_TEXT_COLOR : "gray"}
                backgroundColor={selected ? ACCENT_COLOR : undefined}
              >
                {"  "}
                {item.hint}
              </Text>
            ) : null}
          </Box>
        )
      })}
    </Box>
  )

  if (!boxed) return content

  return (
    <Box borderStyle="round" borderColor={ACCENT_COLOR} flexDirection="column" paddingY={0}>
      {content}
    </Box>
  )
}

function arePropsEqual(prev: Readonly<Parameters<typeof SelectListComponent>[0]>, next: Readonly<Parameters<typeof SelectListComponent>[0]>) {
  if (prev.selectedIndex !== next.selectedIndex || prev.boxed !== next.boxed || prev.maxVisible !== next.maxVisible) return false
  if (prev.items.length !== next.items.length) return false
  for (let index = 0; index < prev.items.length; index += 1) {
    const prevItem = prev.items[index]
    const nextItem = next.items[index]
    if (
      prevItem.id !== nextItem.id ||
      prevItem.label !== nextItem.label ||
      prevItem.hint !== nextItem.hint
    ) {
      return false
    }
  }
  return true
}

export const SelectList = React.memo(SelectListComponent, arePropsEqual)
