import { sorts } from "./types"
import type { Section, SortState } from "./types"

export function usd(n: number) {
  return `$${n.toFixed(2)}`
}

export function num(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}m`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return `${Math.round(n)}`
}

export function fmtMs(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`
}

export function rate(n: number) {
  return Number.isFinite(n) && n > 0 ? `${n.toFixed(1)} tok/s` : "-"
}

export function pct(n: number, total: number) {
  return total && Number.isFinite(total) ? Math.max(0, Math.min(1, n / total)) : 0
}

export function next<Value>(list: readonly Value[], value: Value, dir: 1 | -1) {
  const i = list.indexOf(value)
  if (i === -1) return list[0]!
  const j = i + dir
  if (j < 0) return list[list.length - 1]!
  if (j >= list.length) return list[0]!
  return list[j]!
}

export function valid<Value extends string>(value: unknown, list: readonly Value[], fallback: Value) {
  if (typeof value !== "string") return fallback
  return list.includes(value as Value) ? (value as Value) : fallback
}

export function trim(value: string, size: number) {
  if (value.length <= size) return value.padEnd(size, " ")
  if (size <= 1) return value.slice(0, size)
  return `${value.slice(0, size - 1)}…`
}

export function cycleSort(section: Section, sort: SortState): SortState {
  if (section === "models") return { ...sort, models: next(sorts.models, sort.models, 1) }
  if (section === "agents") return { ...sort, agents: next(sorts.agents, sort.agents, 1) }
  if (section === "tools") return { ...sort, tools: next(sorts.tools, sort.tools, 1) }
  if (section === "speed") return { ...sort, speed: next(sorts.speed, sort.speed, 1) }
  return { ...sort, errors: next(sorts.errors, sort.errors, 1) }
}

export function sortLabel(section: Section, sort: SortState) {
  if (section === "models") return sort.models
  if (section === "agents") return sort.agents
  if (section === "tools") return sort.tools
  if (section === "speed") return sort.speed
  return sort.errors
}
