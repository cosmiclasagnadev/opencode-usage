import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { For } from "solid-js"
import { trim } from "./format"
import type { Row } from "./types"

export function Meter(props: { api: TuiPluginApi; row: Row }) {
  const theme = () => props.api.theme.current
  const fill = () => Math.round(props.row.pct * 20)
  const full = () => "█".repeat(fill())
  const empty = () => "░".repeat(Math.max(0, 20 - fill()))
  return (
    <box flexDirection="column" gap={0}>
      <text fg={theme().text}>{`${trim(props.row.name, 28)} ${props.row.value}`}</text>
      <text
        fg={theme().textMuted}
      >{`${String(Math.round(props.row.pct * 100)).padStart(3, " ")}% ${full()}${empty()} ${props.row.note}`}</text>
    </box>
  )
}

export function Tabs<Value extends string>(props: {
  api: TuiPluginApi
  label: string
  value: Value
  list: Value[]
  pick: (value: Value) => void
}) {
  const theme = () => props.api.theme.current
  const text = (item: Value) => (props.label === "section" && item === "speed" ? "throughput" : item)
  return (
    <box flexDirection="row" gap={1} flexWrap="wrap">
      <text fg={theme().textMuted}>{props.label} </text>
      <For each={props.list}>
        {(item, i) => (
          <text
            fg={props.value === item ? theme().accent : theme().textMuted}
          >{`${i() ? "  " : ""}${props.value === item ? "[" : ""}${text(item)}${props.value === item ? "]" : ""}`}</text>
        )}
      </For>
    </box>
  )
}
