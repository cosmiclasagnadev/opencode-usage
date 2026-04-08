import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import type { Message, Part, Session } from "@opencode-ai/sdk/v2"
import { dayKey, putMsg, putSess } from "./agg"
import { reconcileSession } from "./reconcile"
import { resetState, store } from "./state"

function session(updated: number): Session {
  return {
    id: "session-1",
    projectID: "project-1",
    directory: "/tmp/project",
    time: {
      updated,
    },
  } as Session
}

function message(id: string, completed: number, output: number): Message {
  return {
    id,
    role: "assistant",
    sessionID: "session-1",
    providerID: "provider",
    modelID: "model",
    agent: "build",
    cost: output / 10,
    error: undefined,
    tokens: {
      input: 10,
      output,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    },
    time: {
      created: completed - 1000,
      completed,
    },
  } as Message
}

function api(rows: { info: Message; parts: Part[] }[] | Error, current: Session) {
  return {
    client: {
      session: {
        get: async () => ({ data: current }),
        messages: async () => {
          if (rows instanceof Error) throw rows
          return { data: rows }
        },
      },
    },
    kv: {
      get: () => undefined,
      set: () => undefined,
      ready: true,
    },
    state: {
      path: {
        directory: "/tmp/project",
      },
    },
  } as any
}

afterEach(() => {
  resetState()
})

describe("reconcileSession", () => {
  it("replaces old session usage instead of stacking it", async () => {
    const original = session(Date.parse("2026-01-01T00:00:00.000Z"))
    putSess(store.agg, original)
    putMsg(store.agg, message("old", Date.parse("2026-01-01T12:00:00.000Z"), 5))

    const current = session(Date.parse("2026-01-02T00:00:00.000Z"))
    const nextMessage = message("new", Date.parse("2026-01-02T12:00:00.000Z"), 20)
    const completed = (nextMessage.time as { completed: number }).completed

    await reconcileSession(api([{ info: nextMessage, parts: [] }], current), current.id)

    const bucket = store.agg.by_s[current.id]!
    assert.deepEqual(Object.keys(bucket), [dayKey(completed)])
    assert.equal(bucket[dayKey(completed)]!.totals.msg, 1)
    assert.equal(bucket[dayKey(completed)]!.models["provider/model"]!.output, 20)
  })

  it("preserves cached usage when message refresh fails", async () => {
    const original = session(Date.parse("2026-01-01T00:00:00.000Z"))
    const cachedMessage = message("cached", Date.parse("2026-01-01T12:00:00.000Z"), 5)
    putSess(store.agg, original)
    putMsg(store.agg, cachedMessage)
    store.agg.fresh[original.id] = { updated: original.time.updated, synced: original.time.updated }
    const before = JSON.parse(JSON.stringify(store.agg.by_s[original.id]))

    const current = session(Date.parse("2026-01-02T00:00:00.000Z"))

    await reconcileSession(api(new Error("boom"), current), current.id)

    assert.deepEqual(store.agg.by_s[original.id], before)
    assert.equal(store.agg.fresh[original.id]!.updated, current.time.updated)
    assert.equal(store.agg.fresh[original.id]!.synced, original.time.updated)
  })
})
