import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { putMsg, putSess, putTool, rebuildDays } from "./agg"
import { buildFlat } from "./compute"
import { bump, keyFor, load, resetState, save, store } from "./state"
import { BATCH } from "./types"

export async function refreshSession(api: TuiPluginApi, sessionID: string) {
  return api.client.session
    .get({ sessionID })
    .then((r) => {
      if (!r.data) return
      putSess(r.data)
      return r.data
    })
    .catch(() => undefined)
}

export async function reconcileSession(api: TuiPluginApi, sessionID: string) {
  if (store.sync.has(sessionID)) return
  store.sync.add(sessionID)
  try {
    const session = await refreshSession(api, sessionID)
    const rows = await api.client.session
      .messages({ sessionID })
      .then((r) => r.data ?? [])
      .catch(() => [])
    delete store.agg.by_s[sessionID]
    for (const row of rows) {
      delete store.agg.seen.msg[row.info.id]
      for (const part of row.parts) if (part.type === "tool") delete store.agg.seen.tool[part.id]
    }
    const prev = store.seed
    store.seed = true
    rows.forEach((row) => {
      putMsg(row.info)
      row.parts.forEach(putTool)
    })
    store.seed = prev
    rebuildDays()
    store.agg.gf = buildFlat(new Set(Object.keys(store.agg.meta)), "all")
    store.flat.clear()
    if (session) {
      const fresh = store.agg.fresh[sessionID] ?? { updated: 0, synced: 0 }
      fresh.updated = Math.max(fresh.updated, session.time.updated)
      fresh.synced = session.time.updated
      store.agg.fresh[sessionID] = fresh
    }
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
  list.forEach(putSess)
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
    store.seed = true
    bump()
    const list = await api.client.session
      .list()
      .then((r) => r.data ?? [])
      .catch(() => [])
    list.forEach(putSess)
    for (let i = 0; i < list.length; i += BATCH) {
      const group = list.slice(i, i + BATCH)
      await Promise.all(
        group.map(async (s) => {
          const rows = await api.client.session
            .messages({ sessionID: s.id })
            .then((r) => r.data ?? [])
            .catch(() => [])
          rows.forEach((row) => {
            putMsg(row.info)
            row.parts.forEach(putTool)
          })
        }),
      )
    }
    store.seed = false
    rebuildDays()
    store.agg.gf = buildFlat(new Set(Object.keys(store.agg.meta)), "all")
    for (const session of list) {
      const fresh = store.agg.fresh[session.id] ?? { updated: 0, synced: 0 }
      fresh.updated = Math.max(fresh.updated, session.time.updated)
      fresh.synced = session.time.updated
      store.agg.fresh[session.id] = fresh
    }
    store.agg.ready = true
    save(api)
    bump()
  })()
  return store.wait
}
