import type {
  AssistantMessage,
  Message,
  Part,
  Session,
  ToolPart,
} from "@opencode-ai/sdk/v2";
import { store } from "./state";
import type { Agg } from "./types";
import type { SessDay, Win } from "./types";

export function dayKey(ts: number) {
  return new Date(ts).toISOString().slice(0, 10);
}

export function dayRange(start: number) {
  if (start <= 0) return store.agg.days;
  const days: string[] = [];
  const d = new Date(start);
  const end = new Date();
  while (d <= end) {
    days.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

export function since(win: Win) {
  if (win === "all") return 0;
  if (win === "30d") return Date.now() - 30 * 24 * 60 * 60 * 1000;
  return Date.now() - 7 * 24 * 60 * 60 * 1000;
}

export function noteOfError(err: unknown) {
  if (!err || typeof err !== "object") return "error";
  if ("name" in err && typeof err.name === "string") return err.name;
  if ("type" in err && typeof err.type === "string") return err.type;
  return "error";
}

export function isAssistant(msg: Message): msg is AssistantMessage {
  return msg.role === "assistant";
}

export function isTool(part: Part): part is ToolPart {
  return part.type === "tool";
}

export function sessDay(agg: Agg, sid: string, dk: string): SessDay {
  let sd = agg.by_s[sid];
  if (!sd) {
    sd = {};
    agg.by_s[sid] = sd;
  }
  let d = sd[dk];
  if (!d) {
    if (!agg.days.includes(dk)) agg.days.push(dk);
    d = {
      models: {},
      tools: {},
      agents: {},
      errors: {},
      speed: {},
      totals: { msg: 0, tool: 0, cost: 0, cache: 0, input: 0 },
    };
    sd[dk] = d;
  }
  return d;
}

export function putSess(agg: Agg, s: Session) {
  agg.meta[s.id] = { id: s.id, pid: s.projectID, dir: s.directory };
  const fresh = agg.fresh[s.id] ?? { updated: 0, synced: 0 };
  fresh.updated = Math.max(fresh.updated, s.time.updated);
  agg.fresh[s.id] = fresh;
}

export function putMsg(agg: Agg, msg: Message) {
  if (!isAssistant(msg)) return false;
  if (!msg.time.completed) return false;
  const dk = dayKey(msg.time.completed ?? msg.time.created);
  const b = sessDay(agg, msg.sessionID, dk);
  const mid = `${msg.providerID}/${msg.modelID}`;
  const aid = msg.agent;
  if (!b.models[mid]) b.models[mid] = { n: 0, cost: 0, input: 0, output: 0 };
  b.models[mid]!.n += 1;
  b.models[mid]!.cost += msg.cost;
  b.models[mid]!.input += msg.tokens.input;
  b.models[mid]!.output += msg.tokens.output;
  if (!b.agents[aid]) b.agents[aid] = { n: 0, cost: 0, output: 0 };
  b.agents[aid]!.n += 1;
  b.agents[aid]!.cost += msg.cost;
  b.agents[aid]!.output += msg.tokens.output;
  if (msg.error) {
    const key = `assistant:${noteOfError(msg.error)}`;
    b.errors[key] = (b.errors[key] ?? 0) + 1;
  }
  b.totals.msg += 1;
  b.totals.cost += msg.cost;
  b.totals.input += msg.tokens.input + msg.tokens.cache.read;
  b.totals.cache += msg.tokens.cache.read;
  return true;
}

export function putSpeed(agg: Agg, msg: Message, parts: Part[]) {
  if (!isAssistant(msg)) return false;
  if (!msg.time.completed || msg.tokens.output <= 0) return false;
  const start = parts.reduce<number | undefined>((start, part) => {
    if (
      part.type !== "text" ||
      part.synthetic === true ||
      part.ignored === true ||
      !part.time?.start
    )
      return start;
    if (start == null) return part.time.start;
    return Math.min(start, part.time.start);
  }, undefined);
  if (start == null) return false;
  const ms = msg.time.completed - start;
  if (ms <= 0) return false;
  const dk = dayKey(msg.time.completed);
  const b = sessDay(agg, msg.sessionID, dk);
  const mid = `${msg.providerID}/${msg.modelID}`;
  if (!b.speed[mid]) b.speed[mid] = { out: 0, ms: 0, n: 0 };
  b.speed[mid]!.out += msg.tokens.output;
  b.speed[mid]!.ms += ms;
  b.speed[mid]!.n += 1;
  return true;
}

export function putTool(agg: Agg, part: Part) {
  if (!isTool(part)) return false;
  const s = part.state;
  if (s.status !== "completed" && s.status !== "error") return false;
  if (!("time" in s) || !s.time || !("end" in s.time)) return false;
  const dk = dayKey(s.time.end);
  const b = sessDay(agg, part.sessionID, dk);
  if (!b.tools[part.tool]) b.tools[part.tool] = { n: 0, err: 0, ms: 0 };
  const t = b.tools[part.tool]!;
  if (s.status === "completed") {
    t.n += 1;
    t.ms += s.time.end - s.time.start;
  } else if (s.status === "error") {
    t.n += 1;
    t.err += 1;
    t.ms += s.time.end - s.time.start;
  }
  b.totals.tool += 1;
  return true;
}

export function rebuildDays() {
  const days = new Set<string>();
  for (const sd of Object.values(store.agg.by_s)) {
    for (const dk of Object.keys(sd)) days.add(dk);
  }
  store.agg.days = [...days].sort();
}
