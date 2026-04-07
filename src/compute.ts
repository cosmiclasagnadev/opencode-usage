import { dayRange, since } from "./agg"
import { fmtMs, num, pct, rate, usd } from "./format"
import { store } from "./state"
import { EMPTY_VIEW } from "./types"
import type { FlatCounters, Row, Scope, ScopeParam, Section, SortState, ViewData, Win } from "./types"

export function filterIds(scope: Scope, sid: string | undefined, sp: ScopeParam) {
  const meta = store.agg.meta
  if (scope === "global") return new Set(Object.keys(meta))
  if (scope === "project") {
    if (sp.pid) {
      const ids = new Set<string>()
      for (const [id, m] of Object.entries(meta)) if (m.pid === sp.pid) ids.add(id)
      return ids
    }
    if (sp.dir) {
      const ids = new Set<string>()
      for (const [id, m] of Object.entries(meta)) if (m.dir === sp.dir || m.dir.startsWith(`${sp.dir}/`)) ids.add(id)
      return ids
    }
    return new Set<string>()
  }
  return sid ? new Set([sid]) : new Set<string>()
}

export function mergeMap<In extends { n: number }>(out: Record<string, In>, src: Record<string, In>) {
  for (const [k, v] of Object.entries(src)) {
    if (!out[k]) out[k] = { ...v }
    else {
      const o = out[k]!
      o.n += v.n
      for (const key of Object.keys(v)) {
        if (key === "n") continue
        ;(o as Record<string, number>)[key] =
          ((o as Record<string, number>)[key] ?? 0) + ((v as Record<string, number>)[key] ?? 0)
      }
    }
  }
}

export function buildFlat(allowed: Set<string>, win: Win): FlatCounters {
  const keys = dayRange(since(win))
  const flat: FlatCounters = {
    models: {},
    tools: {},
    agents: {},
    errors: {},
    speed: {},
    totals: { msg: 0, tool: 0, cost: 0, cache: 0, input: 0 },
  }
  for (const sid of allowed) {
    const sd = store.agg.by_s[sid]
    if (!sd) continue
    for (const dk of keys) {
      const b = sd[dk]
      if (!b) continue
      mergeMap(flat.models, b.models)
      mergeMap(flat.tools, b.tools)
      mergeMap(flat.agents, b.agents)
      mergeMap(flat.speed, b.speed)
      for (const [k, v] of Object.entries(b.errors)) flat.errors[k] = (flat.errors[k] ?? 0) + v
      flat.totals.msg += b.totals.msg
      flat.totals.tool += b.totals.tool
      flat.totals.cost += b.totals.cost
      flat.totals.cache += b.totals.cache
      flat.totals.input += b.totals.input
    }
  }
  return flat
}

export function collectFlat(scope: Scope, sid: string | undefined, sp: ScopeParam, win: Win): FlatCounters {
  const key = `${store.rev}:${scope}:${sid ?? ""}:${sp.pid ?? ""}:${sp.dir ?? ""}:${win}`
  const hit = store.flat.get(key)
  if (hit) return hit
  if (win === "all" && scope === "global") {
    store.flat.set(key, store.agg.gf)
    const old = store.flat.keys().next().value
    if (store.flat.size > 12 && old) store.flat.delete(old)
    return store.agg.gf
  }
  const flat = buildFlat(filterIds(scope, sid, sp), win)
  store.flat.set(key, flat)
  const old = store.flat.keys().next().value
  if (store.flat.size > 12 && old) store.flat.delete(old)
  return flat
}

export function activeSessions(allowed: Set<string>, win: Win) {
  const keys = new Set(dayRange(since(win)))
  let count = 0
  for (const sid of allowed) {
    const sd = store.agg.by_s[sid]
    if (!sd) continue
    let hit = false
    for (const dk of Object.keys(sd)) {
      if (!keys.has(dk)) continue
      if (sd[dk]!.totals.msg || sd[dk]!.totals.tool) {
        hit = true
        break
      }
    }
    if (hit) count += 1
  }
  return count
}

export function rowsFor(section: Section, flat: FlatCounters, sort: SortState): Row[] {
  if (section === "models") {
    const e = Object.entries(flat.models)
    const key = sort.models
    const t = e.reduce((s, [, m]) => s + (key === "cost" ? m.cost : key === "messages" ? m.n : m.input + m.output), 0)
    return e
      .sort((a, b) => {
        const av = key === "cost" ? a[1].cost : key === "messages" ? a[1].n : a[1].input + a[1].output
        const bv = key === "cost" ? b[1].cost : key === "messages" ? b[1].n : b[1].input + b[1].output
        return bv - av || b[1].cost - a[1].cost || b[1].n - a[1].n
      })
      .slice(0, 12)
      .map(([name, m]) => ({
        name,
        note: `${m.n} msg  ${num(m.input + m.output)} tok`,
        value: usd(m.cost),
        pct: pct(key === "cost" ? m.cost : key === "messages" ? m.n : m.input + m.output, t),
      }))
  }
  if (section === "agents") {
    const e = Object.entries(flat.agents)
    const key = sort.agents
    const t = e.reduce((s, [, a]) => s + (key === "cost" ? a.cost : key === "output" ? a.output : a.n), 0)
    return e
      .sort((a, b) => {
        const av = key === "cost" ? a[1].cost : key === "output" ? a[1].output : a[1].n
        const bv = key === "cost" ? b[1].cost : key === "output" ? b[1].output : b[1].n
        return bv - av || b[1].n - a[1].n || b[1].cost - a[1].cost
      })
      .slice(0, 12)
      .map(([name, a]) => ({
        name,
        note: `${a.n} msg  ${num(a.output)} out`,
        value: usd(a.cost),
        pct: pct(key === "cost" ? a.cost : key === "output" ? a.output : a.n, t),
      }))
  }
  if (section === "tools") {
    const e = Object.entries(flat.tools)
    const key = sort.tools
    const t = e.reduce(
      (s, [, v]) => s + (key === "errors" ? v.err : key === "latency" ? (v.n ? v.ms / v.n : 0) : v.n),
      0,
    )
    return e
      .sort((a, b) => {
        const av = key === "errors" ? a[1].err : key === "latency" ? (a[1].n ? a[1].ms / a[1].n : 0) : a[1].n
        const bv = key === "errors" ? b[1].err : key === "latency" ? (b[1].n ? b[1].ms / b[1].n : 0) : b[1].n
        return bv - av || b[1].n - a[1].n || a[0].localeCompare(b[0])
      })
      .slice(0, 12)
      .map(([name, v]) => ({
        name,
        note: `${v.n} calls  ${v.err} err`,
        value: v.n ? fmtMs(v.ms / v.n) : "-",
        pct: pct(key === "errors" ? v.err : key === "latency" ? (v.n ? v.ms / v.n : 0) : v.n, t),
      }))
  }
  if (section === "speed") {
    const key = sort.speed
    const e = Object.entries(flat.speed)
      .map(([name, s]) => ({ name, tok: s.ms ? (s.out * 1000) / s.ms : 0, n: s.n }))
      .sort((a, b) => {
        const av = key === "runs" ? a.n : a.tok
        const bv = key === "runs" ? b.n : b.tok
        return bv - av || b.tok - a.tok || b.n - a.n
      })
    const top = e.reduce((s, item) => Math.max(s, key === "runs" ? item.n : item.tok), 0)
    return e
      .slice(0, 12)
      .map((s) => ({
        name: s.name,
        note: `${s.n} runs`,
        value: rate(s.tok),
        pct: pct(key === "runs" ? s.n : s.tok, top),
      }))
  }
  const e = Object.entries(flat.errors).sort((a, b) =>
    sort.errors === "name" ? a[0].localeCompare(b[0]) : b[1] - a[1] || a[0].localeCompare(b[0]),
  )
  const t = e.reduce((s, [, v]) => s + v, 0)
  return e.slice(0, 12).map(([name, value]) => ({ name, note: "errors", value: String(value), pct: pct(value, t) }))
}

export function computeView(
  section: Section,
  scope: Scope,
  win: Win,
  sid: string | undefined,
  sp: ScopeParam,
  sort: SortState,
): ViewData {
  const allowed = filterIds(scope, sid, sp)
  if (!store.agg.ready)
    return { ...EMPTY_VIEW, head: { ...EMPTY_VIEW.head, sessions: allowed.size }, sync: store.wait != null }
  const flat = collectFlat(scope, sid, sp, win)
  const input = flat.totals.input
  return {
    rows: rowsFor(section, flat, sort),
    head: {
      sessions: activeSessions(allowed, win),
      msg: flat.totals.msg,
      tool: flat.totals.tool,
      cost: flat.totals.cost,
      hit: input ? Math.round((flat.totals.cache / input) * 100) : 0,
    },
    ready: true,
    sync: store.wait != null,
  }
}
