import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { createSignal } from "solid-js"
import { EMPTY_FLAT } from "./types"
import type { Agg, FlatCounters } from "./types"

function emptyAgg(): Agg {
  return {
    v: 4,
    ready: false,
    meta: {},
    by_s: {},
    days: [],
    gf: { ...EMPTY_FLAT },
    fresh: {},
    seen: { msg: {}, tool: {} },
  }
}

export const store = {
  agg: emptyAgg(),
  wait: undefined as Promise<void> | undefined,
  save: undefined as ReturnType<typeof setTimeout> | undefined,
  dirty: false,
  rev: 0,
  seed: false,
  bump: undefined as ReturnType<typeof setTimeout> | undefined,
  flat: new Map<string, FlatCounters>(),
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
  store.agg = emptyAgg()
  store.wait = undefined
  store.dirty = false
  store.seed = false
  if (store.save) clearTimeout(store.save)
  if (store.bump) clearTimeout(store.bump)
  store.flat.clear()
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
  const hit = api.kv.get<Agg | undefined>(keyFor(api))
  if (!hit || hit.v !== 4) return
  if (!Array.isArray(hit.days)) hit.days = []
  store.agg = hit
}
