import type { TuiPlugin } from "@opencode-ai/plugin/tui"
import { scheduleReconcile, seed } from "./reconcile"
import { resetState } from "./state"
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

  const disposeCommand = api.command.register(() => [
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

  const disposeRoute = api.route.register([
    {
      name: "usage",
      render(input) {
        return <View api={api} keys={keys} params={input.params} />
      },
    },
  ])

  const scheduleSession = (sessionID: string) => scheduleReconcile(api, sessionID)

  const disposeMessage = api.event.on("message.updated", (evt) => {
    scheduleSession(evt.properties.sessionID)
  })

  const disposePart = api.event.on("message.part.updated", (evt) => {
    scheduleSession(evt.properties.sessionID)
  })

  api.lifecycle.onDispose(() => {
    disposePart()
    disposeMessage()
    disposeRoute()
    disposeCommand()
    resetState()
  })

  void seed(api)
}

export default { id: "opencode.usage", tui }
