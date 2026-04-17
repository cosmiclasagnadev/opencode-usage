# opencode-usage-dashboard

TUI usage dashboard plugin for OpenCode.

It adds a `/usage` command with model, agent, tool, throughput, and error views across project and session scope.

Repository: `https://github.com/cosmiclasagnadev/opencode-usage`

## Install

Add it to `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-usage-dashboard"]
}
```

If you keep plugin config in `tui.json`, that works too:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["opencode-usage-dashboard"]
}
```

## Usage

- Open `/usage`
- `g` cycles scope
- `Tab` / `Shift+Tab` cycles section
- `w` cycles time window
- `1` / `2` / `3` jump to `7d` / `30d` / `all`
- `s` cycles sort
- `Esc` goes back

## Throughput

The throughput section shows end-to-end output rate, not decode-only model TPS.

It is calculated as output tokens divided by the time between the first visible assistant text and message completion.

## Current Limits

- visible scopes are `project` and `session`
- true cross-project `global` scope is not shipped yet
- throughput is not provider-side decode TPS

## Development

```bash
bun run typecheck
bun run build
```

## Release

The standalone repo is intended to publish through GitHub Actions with npm trusted publishing.
