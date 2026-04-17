import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Message, Part } from "@opencode-ai/sdk/v2";
import { dayKey, putMsg, putSpeed, putTool } from "./agg";
import { createAgg } from "./state";

function message(overrides: Partial<Message> = {}) {
  return {
    id: "msg-1",
    role: "assistant",
    sessionID: "session-1",
    providerID: "provider",
    modelID: "model",
    agent: "build",
    cost: 1.25,
    error: undefined,
    tokens: {
      input: 10,
      output: 20,
      reasoning: 0,
      cache: { read: 2, write: 0 },
    },
    time: {
      created: Date.parse("2026-01-02T10:00:00.000Z"),
      completed: Date.parse("2026-01-02T10:00:05.000Z"),
    },
    ...overrides,
  } as Message;
}

function tool(status: "running" | "completed" | "error"): Part {
  if (status === "running") {
    return {
      id: "tool-1",
      type: "tool",
      sessionID: "session-1",
      tool: "bash",
      state: { status: "running" },
    } as Part;
  }
  return {
    id: "tool-1",
    type: "tool",
    sessionID: "session-1",
    tool: "bash",
    state: {
      status,
      time: {
        start: Date.parse("2026-01-02T10:00:00.000Z"),
        end: Date.parse("2026-01-02T10:00:02.000Z"),
      },
    },
  } as Part;
}

function text(
  start: number,
  overrides: Partial<Extract<Part, { type: "text" }>> = {},
): Part {
  return {
    id: `text-${start}`,
    type: "text",
    sessionID: "session-1",
    messageID: "msg-1",
    text: "hello",
    time: { start },
    ...overrides,
  } as Part;
}

describe("agg", () => {
  it("counts a completed assistant message once", () => {
    const agg = createAgg();
    const msg = message();
    const completed = (msg.time as { completed: number }).completed;

    assert.equal(putMsg(agg, msg), true);

    const day = agg.by_s[msg.sessionID]![dayKey(completed)]!;
    assert.equal(day.totals.msg, 1);
    assert.equal(day.totals.cost, 1.25);
    assert.equal(day.models["provider/model"]!.output, 20);
    assert.equal(day.agents.build!.n, 1);
  });

  it("uses first visible text start for throughput", () => {
    const agg = createAgg();
    const msg = message({
      time: {
        created: Date.parse("2026-01-02T10:00:00.000Z"),
        completed: Date.parse("2026-01-02T10:00:05.000Z"),
      },
    });
    const completed = (msg.time as { completed: number }).completed;

    assert.equal(
      putSpeed(agg, msg, [
        text(Date.parse("2026-01-02T10:00:03.000Z")),
        text(Date.parse("2026-01-02T10:00:04.000Z")),
      ]),
      true,
    );

    const day = agg.by_s[msg.sessionID]![dayKey(completed)]!;
    assert.equal(day.speed["provider/model"]!.out, 20);
    assert.equal(day.speed["provider/model"]!.ms, 2000);
    assert.equal(day.speed["provider/model"]!.n, 1);
  });

  it("ignores synthetic and ignored text when computing throughput", () => {
    const agg = createAgg();
    const msg = message({
      time: {
        created: Date.parse("2026-01-02T10:00:00.000Z"),
        completed: Date.parse("2026-01-02T10:00:05.000Z"),
      },
    });
    const completed = (msg.time as { completed: number }).completed;

    assert.equal(
      putSpeed(agg, msg, [
        text(Date.parse("2026-01-02T10:00:01.000Z"), { synthetic: true }),
        text(Date.parse("2026-01-02T10:00:02.000Z"), { ignored: true }),
        text(Date.parse("2026-01-02T10:00:04.000Z")),
      ]),
      true,
    );

    const day = agg.by_s[msg.sessionID]![dayKey(completed)]!;
    assert.equal(day.speed["provider/model"]!.ms, 1000);
  });

  it("skips throughput when there is no visible text start", () => {
    const agg = createAgg();
    const msg = message();

    assert.equal(
      putSpeed(agg, msg, [
        text(Date.parse("2026-01-02T10:00:01.000Z"), { synthetic: true }),
      ]),
      false,
    );
    assert.equal(agg.by_s[msg.sessionID], undefined);
  });

  it("ignores non-terminal tool updates", () => {
    const agg = createAgg();
    const completed = tool("completed") as Part & {
      state: { status: "completed"; time: { start: number; end: number } };
    };

    assert.equal(putTool(agg, tool("running")), false);
    assert.equal(agg.by_s["session-1"], undefined);

    assert.equal(putTool(agg, completed), true);

    const day = agg.by_s["session-1"]![dayKey(completed.state.time.end)]!;
    assert.equal(day.totals.tool, 1);
    assert.equal(day.tools.bash!.n, 1);
    assert.equal(day.tools.bash!.err, 0);
  });
});
