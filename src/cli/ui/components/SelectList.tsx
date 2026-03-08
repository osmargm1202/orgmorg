import React from "react"
import { Box, Text } from "ink"

const ACCENT_COLOR = "blue"
const SELECTED_TEXT_COLOR = "white"

export interface SelectItem {
  id: string
  label: string
  hint?: string
}

function SelectListComponent({
  items,
  selectedIndex,
  boxed = true,
}: {
  items: SelectItem[]
  selectedIndex: number
  boxed?: boolean
}) {
  const content = (
    <Box flexDirection="column">
      {items.map((item, index) => {
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
  if (prev.selectedIndex !== next.selectedIndex || prev.boxed !== next.boxed) return false
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
