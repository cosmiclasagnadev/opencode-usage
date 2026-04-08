import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { useKeyboard } from "@opentui/solid"
import { batch, createEffect, createSignal, For, onCleanup, Show } from "solid-js"
import { computeView } from "./compute"
import { Meter, Tabs } from "./components"
import { cycleSort, next, sortLabel, usd, valid } from "./format"
import { dbRev, store } from "./state"
import { reconcileSession, refreshProjectSessions, seed } from "./reconcile"
import { DEFAULT_SORT, EMPTY_VIEW, scopes, scopeKey, sectionKey, sections, winKey, wins } from "./types"
import type { Back, ScopeParam, SortState, Win } from "./types"

export function View(props: {
  api: TuiPluginApi
  keys: ReturnType<TuiPluginApi["keybind"]["create"]>
  params?: Record<string, unknown>
}) {
  const [section, setSection] = createSignal(valid(props.api.kv.get(sectionKey), sections, "models"))
  const [scope, setScope] = createSignal<(typeof scopes)[number]>(valid(props.api.kv.get(scopeKey), scopes, "project"))
  const [win, setWin] = createSignal(valid(props.api.kv.get(winKey), wins, "7d"))
  const [sort, setSort] = createSignal<SortState>(DEFAULT_SORT)
  const [view, setView] = createSignal(EMPTY_VIEW)
  const [loading, setLoading] = createSignal(false)
  const [refreshing, setRefreshing] = createSignal(0)
  const [spin, setSpin] = createSignal(0)

  const routeParams = (): Record<string, unknown> => ({ ...props.params, directory: props.api.state.path.directory })

  const scopeParam = (): ScopeParam => {
    const p = routeParams()
    const sid = typeof p.sessionID === "string" ? p.sessionID : undefined
    const session = sid ? store.agg.meta[sid] : undefined
    if (session) return { pid: session.pid, dir: session.dir }
    const dir = typeof p.directory === "string" && p.directory ? p.directory : undefined
    return { pid: undefined, dir }
  }

  const sessionID = () => {
    const p = routeParams()
    return typeof p.sessionID === "string" ? p.sessionID : undefined
  }

  const back = (): Back | undefined => {
    const p = routeParams()
    const back = p.back
    if (!back || typeof back !== "object") return
    if (!("name" in back) || typeof back.name !== "string") return
    if (!("params" in back) || back.params === undefined) return { name: back.name }
    if (!back.params || typeof back.params !== "object") return
    return { name: back.name, params: back.params as Record<string, unknown> }
  }

  let persisted = false
  const persistPrefs = () => {
    if (persisted) return
    persisted = true
    const currentSection = section()
    const currentScope = scope()
    const currentWin = win()
    setTimeout(() => {
      props.api.kv.set(sectionKey, currentSection)
      props.api.kv.set(scopeKey, currentScope)
      props.api.kv.set(winKey, currentWin)
    }, 0)
  }

  onCleanup(() => {
    persistPrefs()
  })

  const leave = () => {
    persistPrefs()
    const prev = back()
    if (!prev || prev.name === "usage") return props.api.route.navigate("home")
    props.api.route.navigate(prev.name, prev.params)
  }

  createEffect(() => {
    if (!loading() && !refreshing()) return
    const timer = setInterval(() => setSpin((x) => (x + 1) % 4), 120)
    onCleanup(() => clearInterval(timer))
  })

  const spinner = () => ["|", "/", "-", "\\"][spin()] ?? "|"

  createEffect(() => {
    const dir = props.api.state.path.directory
    const sid = sessionID()
    dir
    sid
    let active = true
    onCleanup(() => {
      active = false
    })
    ;(async () => {
      setLoading(true)
      await seed(props.api)
      if (!active) return
      const stale = await refreshProjectSessions(props.api)
      if (!active) return
      const current = sid ? stale.find((item) => item.id === sid) : undefined
      if (current) await reconcileSession(props.api, current.id)
      if (!active) return
      setLoading(false)
      const rest = stale.filter((item) => item.id !== sid)
      if (!rest.length) return
      setRefreshing(rest.length)
      for (const session of rest) {
        await new Promise((resolve) => setTimeout(resolve, 0))
        if (!active) return
        await reconcileSession(props.api, session.id)
        if (!active) return
        setRefreshing((count) => Math.max(0, count - 1))
      }
    })().finally(() => {
      if (!active) return
      setLoading(false)
      setRefreshing(0)
    })
  })

  createEffect(() => {
    const dir = props.api.state.path.directory
    const currentSection = section()
    const currentScope = scope()
    const currentWin = win()
    const currentSort = sort()
    dbRev()
    dir
    setView(computeView(currentSection, currentScope, currentWin, sessionID(), scopeParam(), currentSort))
  })

  const pickScope = (value: (typeof scopes)[number]) => setScope(value)
  const pickSection = (value: (typeof sections)[number]) => setSection(value)
  const pickWin = (value: Win) => setWin(value)
  const theme = () => props.api.theme.current
  const h = () => view().head

  useKeyboard((evt) => {
    if (props.keys.match("quit", evt)) {
      evt.preventDefault()
      evt.stopPropagation()
      return leave()
    }
    if (props.keys.match("scope", evt)) {
      evt.preventDefault()
      evt.stopPropagation()
      return batch(() => pickScope(next(scopes, scope(), 1)))
    }
    if (props.keys.match("section", evt)) {
      evt.preventDefault()
      evt.stopPropagation()
      return batch(() => pickSection(next(sections, section(), 1)))
    }
    if (props.keys.match("section_back", evt)) {
      evt.preventDefault()
      evt.stopPropagation()
      return batch(() => pickSection(next(sections, section(), -1)))
    }
    if (props.keys.match("sort", evt)) {
      evt.preventDefault()
      evt.stopPropagation()
      return batch(() => setSort((cur) => cycleSort(section(), cur)))
    }
    if (props.keys.match("win", evt)) {
      evt.preventDefault()
      evt.stopPropagation()
      return batch(() => pickWin(next(wins, win(), 1)))
    }
    if (props.keys.match("win_7d", evt)) {
      evt.preventDefault()
      evt.stopPropagation()
      return batch(() => pickWin("7d"))
    }
    if (props.keys.match("win_30d", evt)) {
      evt.preventDefault()
      evt.stopPropagation()
      return batch(() => pickWin("30d"))
    }
    if (props.keys.match("win_all", evt)) {
      evt.preventDefault()
      evt.stopPropagation()
      return batch(() => pickWin("all"))
    }
  })

  return (
    <box flexDirection="column" padding={1} gap={1} width="100%" height="100%">
      <text fg={theme().text}>{`Usage Dashboard · ${scope()} · ${win()}`}</text>
      <text
        fg={theme().textMuted}
      >{`${h().sessions} sessions  ${h().msg} msg  ${h().tool} tools  ${usd(h().cost)}  ${h().hit}% cache`}</text>
      <Show when={loading()}>
        <text fg={theme().textMuted}>{`Loading usage history... ${spinner()}`}</text>
      </Show>
      <Show when={!loading() && refreshing() > 0}>
        <text fg={theme().textMuted}>{`Refreshing usage... ${spinner()}`}</text>
      </Show>
      <Tabs label="section" value={section()} list={sections} pick={pickSection} api={props.api} />
      <Show when={section() === "speed"}>
        <text fg={theme().textMuted}>
          End-to-end output rate from completed messages; not decode-only model TPS. Calculated as output tokens divided
          by total assistant message duration.
        </text>
      </Show>
      <text fg={theme().textMuted}>{`sort [${sortLabel(section(), sort())}]`}</text>
      <Show
        when={scope() !== "session" || !!sessionID()}
        fallback={<text fg={theme().warning}>Open /usage from a session to use session scope.</text>}
      >
        <Show
          when={view().ready}
          fallback={<text fg={theme().info}>{view().sync ? "Loading history..." : "Waiting for cache..."}</text>}
        >
          <Show when={view().rows.length > 0} fallback={<text fg={theme().textMuted}>No usage yet for this filter.</text>}>
            <For each={view().rows}>{(row) => <Meter api={props.api} row={row} />}</For>
          </Show>
        </Show>
      </Show>
      <text
        fg={theme().textMuted}
      >{`[${props.keys.print("scope")}] scope  [${props.keys.print("section")}] section  [${props.keys.print("sort")}] sort  [${props.keys.print("win")}] window  [${props.keys.print("win_7d")}/${props.keys.print("win_30d")}/${props.keys.print("win_all")}] jump  [${props.keys.print("quit")}] back`}</text>
    </box>
  )
}
