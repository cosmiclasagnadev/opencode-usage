import type { AssistantMessage, Message, Part, Session, ToolPart } from "@opencode-ai/sdk/v2"
import { store } from "./state"
import type { SessDay, Win } from "./types"

export function dayKey(ts: number) {
  return new Date(ts).toISOString().slice(0, 10)
}

export function dayRange(start: number) {
  if (start <= 0) return store.agg.days
  const days: string[] = []
  const d = new Date(start)
  const end = new Date()
  while (d <= end) {
    days.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return days
}

export function since(win: Win) {
  if (win === "all") return 0
  if (win === "30d") return Date.now() - 30 * 24 * 60 * 60 * 1000
  return Date.now() - 7 * 24 * 60 * 60 * 1000
}

export function noteOfError(err: unknown) {
  if (!err || typeof err !== "object") return "error"
  if ("name" in err && typeof err.name === "string") return err.name
  if ("type" in err && typeof err.type === "string") return err.type
  return "error"
}

export function msgSig(msg: AssistantMessage) {
  return [
    msg.id,
    msg.time.created,
    msg.time.completed ?? 0,
    msg.providerID,
    msg.modelID,
    msg.agent,
    msg.cost,
    msg.tokens.input,
    msg.tokens.output,
    msg.tokens.reasoning,
    noteOfError(msg.error),
  ].join(":")
}

export function toolSig(part: ToolPart) {
  const s = part.state
  const end = "time" in s && s.time && "end" in s.time ? (s.time.end ?? 0) : 0
  const start = "time" in s && s.time ? s.time.start : 0
  return [part.id, part.tool, s.status, start, end].join(":")
}

export function isAssistant(msg: Message): msg is AssistantMessage {
  return msg.role === "assistant"
}

export function isTool(part: Part): part is ToolPart {
  return part.type === "tool"
}

export function sessDay(sid: string, dk: string): SessDay {
  let sd = store.agg.by_s[sid]
  if (!sd) {
    sd = {}
    store.agg.by_s[sid] = sd
  }
  let d = sd[dk]
  if (!d) {
    if (!store.agg.days.includes(dk)) store.agg.days.push(dk)
    d = {
      models: {},
      tools: {},
      agents: {},
      errors: {},
      speed: {},
      totals: { msg: 0, tool: 0, cost: 0, cache: 0, input: 0 },
    }
    sd[dk] = d
  }
  return d
}

export function putSess(s: Session) {
  store.agg.meta[s.id] = { id: s.id, pid: s.projectID, dir: s.directory }
  const fresh = store.agg.fresh[s.id] ?? { updated: 0, synced: 0 }
  fresh.updated = Math.max(fresh.updated, s.time.updated)
  store.agg.fresh[s.id] = fresh
}

export function putMsg(msg: Message) {
  if (!isAssistant(msg)) return false
  if (!msg.time.completed) return false
  const sig = msgSig(msg)
  if (store.agg.seen.msg[msg.id] === sig) return false
  store.agg.seen.msg[msg.id] = sig
  const dk = dayKey(msg.time.completed ?? msg.time.created)
  const b = sessDay(msg.sessionID, dk)
  const mid = `${msg.providerID}/${msg.modelID}`
  const aid = msg.agent
  if (!b.models[mid]) b.models[mid] = { n: 0, cost: 0, input: 0, output: 0 }
  b.models[mid]!.n += 1
  b.models[mid]!.cost += msg.cost
  b.models[mid]!.input += msg.tokens.input
  b.models[mid]!.output += msg.tokens.output
  if (!b.agents[aid]) b.agents[aid] = { n: 0, cost: 0, output: 0 }
  b.agents[aid]!.n += 1
  b.agents[aid]!.cost += msg.cost
  b.agents[aid]!.output += msg.tokens.output
  if (msg.time.completed > msg.time.created) {
    if (!b.speed[mid]) b.speed[mid] = { out: 0, ms: 0, n: 0 }
    b.speed[mid]!.out += msg.tokens.output
    b.speed[mid]!.ms += msg.time.completed - msg.time.created
    b.speed[mid]!.n += 1
  }
  if (msg.error) {
    const key = `assistant:${noteOfError(msg.error)}`
    b.errors[key] = (b.errors[key] ?? 0) + 1
  }
  b.totals.msg += 1
  b.totals.cost += msg.cost
  b.totals.input += msg.tokens.input + msg.tokens.cache.read
  b.totals.cache += msg.tokens.cache.read
  if (!store.seed) {
    const gf = store.agg.gf
    if (!gf.models[mid]) gf.models[mid] = { n: 0, cost: 0, input: 0, output: 0 }
    gf.models[mid]!.n += 1
    gf.models[mid]!.cost += msg.cost
    gf.models[mid]!.input += msg.tokens.input
    gf.models[mid]!.output += msg.tokens.output
    if (!gf.agents[aid]) gf.agents[aid] = { n: 0, cost: 0, output: 0 }
    gf.agents[aid]!.n += 1
    gf.agents[aid]!.cost += msg.cost
    gf.agents[aid]!.output += msg.tokens.output
    if (msg.time.completed > msg.time.created) {
      if (!gf.speed[mid]) gf.speed[mid] = { out: 0, ms: 0, n: 0 }
      gf.speed[mid]!.out += msg.tokens.output
      gf.speed[mid]!.ms += msg.time.completed - msg.time.created
      gf.speed[mid]!.n += 1
    }
    if (msg.error)
      gf.errors[`assistant:${noteOfError(msg.error)}`] = (gf.errors[`assistant:${noteOfError(msg.error)}`] ?? 0) + 1
    gf.totals.msg += 1
    gf.totals.cost += msg.cost
    gf.totals.input += msg.tokens.input + msg.tokens.cache.read
    gf.totals.cache += msg.tokens.cache.read
  }
  store.rev += 1
  return true
}

export function putTool(part: Part) {
  if (!isTool(part)) return false
  const sig = toolSig(part)
  if (store.agg.seen.tool[part.id] === sig) return false
  store.agg.seen.tool[part.id] = sig
  const s = part.state
  const ts = "time" in s && s.time && "end" in s.time ? (s.time.end ?? 0) : 0
  const dk = dayKey(ts || Date.now())
  const b = sessDay(part.sessionID, dk)
  if (!b.tools[part.tool]) b.tools[part.tool] = { n: 0, err: 0, ms: 0 }
  const t = b.tools[part.tool]!
  if (s.status === "completed") {
    t.n += 1
    t.ms += s.time.end - s.time.start
  } else if (s.status === "error") {
    t.n += 1
    t.err += 1
    t.ms += s.time.end - s.time.start
  }
  b.totals.tool += 1
  if (!store.seed) {
    const gf = store.agg.gf
    if (!gf.tools[part.tool]) gf.tools[part.tool] = { n: 0, err: 0, ms: 0 }
    const gt = gf.tools[part.tool]!
    if (s.status === "completed") {
      gt.n += 1
      gt.ms += s.time.end - s.time.start
    } else if (s.status === "error") {
      gt.n += 1
      gt.err += 1
      gt.ms += s.time.end - s.time.start
    }
    gf.totals.tool += 1
  }
  store.rev += 1
  return true
}

export function rebuildDays() {
  const days = new Set<string>()
  for (const sd of Object.values(store.agg.by_s)) {
    for (const dk of Object.keys(sd)) days.add(dk)
  }
  store.agg.days = [...days].sort()
}
