export type Section = "models" | "agents" | "tools" | "speed" | "errors"
export type Scope = "project" | "session" | "global"
export type Win = "7d" | "30d" | "all"
export type Row = { name: string; note: string; value: string; pct: number }
export type ModelSort = "usage" | "cost" | "messages"
export type AgentSort = "messages" | "cost" | "output"
export type ToolSort = "calls" | "errors" | "latency"
export type SpeedSort = "tps" | "runs"
export type ErrorSort = "count" | "name"

export type SortState = {
  models: ModelSort
  agents: AgentSort
  tools: ToolSort
  speed: SpeedSort
  errors: ErrorSort
}

export type ViewData = {
  rows: Row[]
  head: { sessions: number; msg: number; tool: number; cost: number; hit: number }
  ready: boolean
  sync: boolean
}

export type SessMeta = { id: string; pid: string; dir: string }
export type ModelCount = { n: number; cost: number; input: number; output: number }
export type ToolCount = { n: number; err: number; ms: number }
export type AgentCount = { n: number; cost: number; output: number }
export type SpeedCount = { out: number; ms: number; n: number }
export type Totals = { msg: number; tool: number; cost: number; cache: number; input: number }
export type Fresh = { updated: number; synced: number }

export type SessDay = {
  models: Record<string, ModelCount>
  tools: Record<string, ToolCount>
  agents: Record<string, AgentCount>
  errors: Record<string, number>
  speed: Record<string, SpeedCount>
  totals: Totals
}

export type FlatCounters = {
  models: Record<string, ModelCount>
  tools: Record<string, ToolCount>
  agents: Record<string, AgentCount>
  errors: Record<string, number>
  speed: Record<string, SpeedCount>
  totals: Totals
}

export type Agg = {
  v: 4
  ready: boolean
  meta: Record<string, SessMeta>
  by_s: Record<string, Record<string, SessDay>>
  days: string[]
  gf: FlatCounters
  fresh: Record<string, Fresh>
}

export type ScopeParam = { pid?: string; dir?: string }
export type Back = { name: string; params?: Record<string, unknown> }

export const sectionKey = "usage.section"
export const scopeKey = "usage.scope"
export const winKey = "usage.win"
export const BATCH = 50

export const sections = ["models", "agents", "tools", "speed", "errors"] as const
export const scopes = ["project", "session"] as const
export const wins = ["7d", "30d", "all"] as const
export const sorts = {
  models: ["usage", "cost", "messages"] as const,
  agents: ["messages", "cost", "output"] as const,
  tools: ["calls", "errors", "latency"] as const,
  speed: ["tps", "runs"] as const,
  errors: ["count", "name"] as const,
} satisfies { [K in Section]: readonly string[] }

export const EMPTY_VIEW: ViewData = {
  rows: [],
  head: { sessions: 0, msg: 0, tool: 0, cost: 0, hit: 0 },
  ready: false,
  sync: false,
}

export const EMPTY_FLAT: FlatCounters = {
  models: {},
  tools: {},
  agents: {},
  errors: {},
  speed: {},
  totals: { msg: 0, tool: 0, cost: 0, cache: 0, input: 0 },
}

export const EMPTY_SD: SessDay = {
  models: {},
  tools: {},
  agents: {},
  errors: {},
  speed: {},
  totals: { msg: 0, tool: 0, cost: 0, cache: 0, input: 0 },
}

export const DEFAULT_SORT: SortState = {
  models: "usage",
  agents: "messages",
  tools: "calls",
  speed: "tps",
  errors: "count",
}
