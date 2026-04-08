import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { putMsg, putSess, putTool, rebuildDays } from "./agg"
import { bump, createAgg, keyFor, load, resetState, save, store } from "./state"
import { BATCH } from "./types"

async function fetchSessionRows(api: TuiPluginApi, sessionID: string) {
  const result = await api.client.session.messages({ sessionID })
  return result.data ?? []
}

export async function refreshSession(api: TuiPluginApi, sessionID: string) {
  return api.client.session
    .get({ sessionID })
    .then((r) => {
      if (!r.data) return
      putSess(store.agg, r.data)
      return r.data
    })
    .catch(() => undefined)
}

export async function reconcileSession(api: TuiPluginApi, sessionID: string) {
  if (store.sync.has(sessionID)) return
  store.sync.add(sessionID)
  try {
    const session = await refreshSession(api, sessionID)
    if (!session) return
    let rows
    try {
      rows = await fetchSessionRows(api, sessionID)
    } catch {
      return
    }
    const next = createAgg()
    rows.forEach((row) => {
      putMsg(next, row.info)
      row.parts.forEach((part) => putTool(next, part))
    })
    if (next.by_s[sessionID]) store.agg.by_s[sessionID] = next.by_s[sessionID]!
    else delete store.agg.by_s[sessionID]
    rebuildDays()
    store.flat.clear()
    store.active.clear()
    store.rows.clear()
    const fresh = store.agg.fresh[sessionID] ?? { updated: 0, synced: 0 }
    fresh.updated = Math.max(fresh.updated, session.time.updated)
    fresh.synced = session.time.updated
    store.agg.fresh[sessionID] = fresh
    store.rev += 1
    save(api)
    bump()
  } finally {
    store.sync.delete(sessionID)
  }
}

export async function refreshProjectSessions(api: TuiPluginApi) {
  const list = await api.client.session
    .list()
    .then((r) => r.data ?? [])
    .catch(() => [])
  list.forEach((session) => putSess(store.agg, session))
  return list.filter((s) => (store.agg.fresh[s.id]?.synced ?? 0) < s.time.updated)
}

export function scheduleReconcile(api: TuiPluginApi, sessionID: string, delay = 350) {
  const prev = store.timers.get(sessionID)
  if (prev) clearTimeout(prev)
  const timer = setTimeout(() => {
    store.timers.delete(sessionID)
    void reconcileSession(api, sessionID)
  }, delay)
  store.timers.set(sessionID, timer)
}

export async function seed(api: TuiPluginApi) {
  const key = keyFor(api)
  if (store.state && store.state !== key) resetState()
  store.state = key
  if (store.wait) return store.wait
  store.wait = (async () => {
    load(api)
    store.agg.v = 4
    store.agg.ready = false
    bump()
    let list
    try {
      list = await api.client.session.list().then((r) => r.data ?? [])
    } catch {
      store.agg.ready = true
      bump()
      return
    }
    const next = createAgg()
    list.forEach((session) => putSess(next, session))
    try {
      for (let i = 0; i < list.length; i += BATCH) {
        const group = list.slice(i, i + BATCH)
        const rowsBySession = await Promise.all(
          group.map(async (session) => ({
            rows: await fetchSessionRows(api, session.id),
          })),
        )
        rowsBySession.forEach(({ rows }) => {
          rows.forEach((row) => {
            putMsg(next, row.info)
            row.parts.forEach((part) => putTool(next, part))
          })
        })
      }
    } catch {
      store.agg.ready = true
      bump()
      return
    }
    store.agg = next
    for (const session of list) {
      const fresh = store.agg.fresh[session.id] ?? { updated: 0, synced: 0 }
      fresh.updated = Math.max(fresh.updated, session.time.updated)
      fresh.synced = session.time.updated
      store.agg.fresh[session.id] = fresh
    }
    rebuildDays()
    store.flat.clear()
    store.active.clear()
    store.rows.clear()
    store.rev += 1
    store.agg.ready = true
    save(api)
    bump()
  })()
  return store.wait
}
