import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { createSignal } from "solid-js"
import { EMPTY_FLAT } from "./types"
import type { Agg, FlatCounters, Row } from "./types"

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function isAgg(value: unknown): value is Agg {
  if (!isRecord(value)) return false
  if (value.v !== 4 || typeof value.ready !== "boolean") return false
  if (!isRecord(value.meta) || !isRecord(value.by_s) || !Array.isArray(value.days)) return false
  if (!isRecord(value.gf) || !isRecord(value.fresh)) return false
  if (!isRecord(value.gf.totals)) return false
  return true
}

export function createAgg(): Agg {
  return {
    v: 4,
    ready: false,
    meta: {},
    by_s: {},
    days: [],
    gf: { ...EMPTY_FLAT },
    fresh: {},
  }
}

export const store = {
  agg: createAgg(),
  wait: undefined as Promise<void> | undefined,
  save: undefined as ReturnType<typeof setTimeout> | undefined,
  dirty: false,
  rev: 0,
  bump: undefined as ReturnType<typeof setTimeout> | undefined,
  flat: new Map<string, FlatCounters>(),
  active: new Map<string, number>(),
  rows: new Map<string, Row[]>(),
  state: "",
  sync: new Set<string>(),
  timers: new Map<string, ReturnType<typeof setTimeout>>(),
}

export const [dbRev, setDbRev] = createSignal(0)

export function bump() {
  if (store.dirty) return
  store.dirty = true
  store.bump = setTimeout(() => {
    store.dirty = false
    setDbRev((x) => x + 1)
  }, 16)
}

export function resetState() {
  store.agg = createAgg()
  store.wait = undefined
  store.dirty = false
  if (store.save) clearTimeout(store.save)
  if (store.bump) clearTimeout(store.bump)
  store.save = undefined
  store.bump = undefined
  store.flat.clear()
  store.active.clear()
  store.rows.clear()
  store.sync.clear()
  for (const timer of store.timers.values()) clearTimeout(timer)
  store.timers.clear()
}

export function keyFor(api: TuiPluginApi) {
  const dir = api.state.path.directory
  return `usage.v4:${dir || "global"}`
}

export function save(api: TuiPluginApi) {
  if (store.save) clearTimeout(store.save)
  store.save = setTimeout(() => {
    api.kv.set(keyFor(api), { ...store.agg })
  }, 2000)
}

export function load(api: TuiPluginApi) {
  const hit = api.kv.get<unknown>(keyFor(api))
  if (!isAgg(hit)) return
  store.agg = hit
}
