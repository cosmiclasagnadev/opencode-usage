import type { TuiPlugin } from "@opencode-ai/plugin/tui"
import { putMsg, putTool } from "./agg"
import { scheduleReconcile, refreshSession, seed } from "./reconcile"
import { bump, save, store } from "./state"
import { View } from "./view"

export const tui: TuiPlugin = async (api) => {
  const keys = api.keybind.create({
    quit: "escape",
    scope: "g",
    section: "tab",
    section_back: "shift+tab",
    sort: "s",
    win: "w",
    win_7d: "1",
    win_30d: "2",
    win_all: "3",
  })

  api.command.register(() => [
    {
      title: "OpenCode Usage",
      description: "Open model, agent, tool and error usage",
      value: "usage.open",
      category: "Navigation",
      slash: { name: "usage" },
      onSelect() {
        const cur = api.route.current
        api.route.navigate("usage", {
          sessionID: cur.name === "session" ? cur.params?.sessionID : undefined,
          directory: api.state.path.directory,
          back: cur,
        })
      },
    },
  ])

  api.route.register([
    {
      name: "usage",
      render(input) {
        return <View api={api} keys={keys} params={input.params} />
      },
    },
  ])

  api.event.on("message.updated", (evt) => {
    const changed = putMsg(evt.properties.info)
    void refreshSession(api, evt.properties.sessionID).then((session) => {
      if (!session) return
      if ((store.agg.fresh[session.id]?.synced ?? 0) < session.time.updated) scheduleReconcile(api, session.id)
    })
    if (!changed) return
    save(api)
    bump()
  })

  api.event.on("message.part.updated", (evt) => {
    const changed = putTool(evt.properties.part)
    void refreshSession(api, evt.properties.sessionID).then((session) => {
      if (!session) return
      if ((store.agg.fresh[session.id]?.synced ?? 0) < session.time.updated) scheduleReconcile(api, session.id)
    })
    if (!changed) return
    save(api)
    bump()
  })

  void seed(api)
}

export default { id: "opencode.usage", tui }
