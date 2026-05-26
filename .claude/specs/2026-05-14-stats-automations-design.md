# F3 Stats Automations Design

**Date:** 2026-05-14
**Branch:** feat/stats-polish-may

## Overview

Three Claude Code automations for the F3 Peak City stats dashboard:

1. `stats-data-check` — a user-invocable skill + Node.js script that diagnoses all 4 Google Sheets CSV tabs
2. `context7` MCP server — live Hugo/JS docs lookup
3. `stats-reviewer` — a subagent that QA-checks all stats JS files after edits

---

## 1. `stats-data-check` Skill

### Files

- `.claude/skills/stats-data-check/SKILL.md` — skill definition (user-invocable only, `disable-model-invocation: true`)
- `.claude/skills/stats-data-check/check.sh` — Node.js shell script

### Behavior

When the user runs `/stats-data-check`, Claude runs:

```bash
bash .claude/skills/stats-data-check/check.sh
```

And reports the output.

### `check.sh` — per-tab diagnostic

For each of the 4 tabs (`ao`, `pax`, `fng`, `leaderboard`), the script:

1. Fetches the CSV via `curl` using the published ID + GID from `static/stats/assets/js/data.js`
2. Parses it with Node.js, using `require('../../../static/stats/assets/js/data.js')` to reuse `f3ParseCSV` and `f3ParseCSVLine`
3. Applies the correct `headerRowIndex` per tab:
   - `ao`: 2, `pax`: 2, `fng`: 0, `leaderboard`: 2
4. Prints for each tab:
   - HTTP status (200 OK or error)
   - Row count (after header, before blank filtering)
   - Full header list
   - One sample row (first non-blank data row)
5. Flags known issues:
   - `ao`/`pax`: count of blank `Site` rows
   - `pax`: count of pure-numeric `Site` rows
   - `pax`: warn if any `Last Seen` value looks like a parseable date (would indicate sheet format changed)
   - Any expected column missing from the header (key columns: `Site` for ao/pax, `FNG Name` and `First Post` for fng)

### Tech choice

Node.js (not Python or awk) — reuses the project's existing test runtime and can directly require `data.js` parsing utilities. Consistent with `static/stats/test/data.test.js`.

---

## 2. context7 MCP Server

### Install command

```bash
claude mcp add --scope project context7 -- npx -y @upstash/context7-mcp
```

This writes a `.mcp.json` file to the repo root. Scope is `project` so it's shared (check `.gitignore` to confirm `.mcp.json` is not excluded).

### Purpose

Provides live documentation lookup for Hugo template syntax (Go templates, `.Params`, `.Site`, etc.) and popular JS libraries (ApexCharts, Tabler/Bootstrap). Prevents hallucinated API names during stats dashboard and Hugo layout work.

### No additional config required.

---

## 3. `stats-reviewer` Subagent

### File

`.claude/agents/stats-reviewer.md`

### Knowledge

The agent knows:
- The 4 stats pages: `ao.html`, `pax.html`, `fng.html`, `leaderboard.html`, `index.html`
- Their corresponding JS files: `ao.js`, `pax.js`, `fng.js`, `leaderboard.js`, `data.js`
- Tab data shapes: `ao`/`pax` headers at row 2, `fng` at row 0; `pax` has no filterable date column
- Expected key columns per tab (same as check.sh above)
- The `F3_TAB_GIDS` / `f3FetchCSV` / `f3ParseCSV` API surface

### Checks performed

When dispatched, the agent reads all 5 JS files and verifies:

1. Every `f3FetchCSV(tabKey)` call uses a valid key (`ao`, `pax`, `fng`, `leaderboard`)
2. Every `f3ParseCSV(text, N)` call uses the correct `headerRowIndex` for its tab
3. Column name string literals referenced in data access (e.g., `row['Site']`, `row['First Post']`) match the known headers for that tab
4. No date filter applied to `pax` or `ao` tab data (those tabs lack individual dated records)
5. No `undefined` variable references across consumers of `data.js` exports

Reports: ✓ or ✗ per file, with specific line-level findings for any failures.

### Invocation

**Auto:** Claude dispatches this agent automatically after editing any `static/stats/assets/js/*.js` file (rule in project `CLAUDE.md`).

**Manual:** User runs `/stats-reviewer`.

### CLAUDE.md rule to add

```
After editing any file matching `static/stats/assets/js/*.js`, dispatch the stats-reviewer agent for a QA pass before reporting the task complete.
```

---

## Out of Scope

- The auto-running JS unit tests hook (separate recommendation, not part of this spec)
- The block-edits-on-main hook (separate recommendation)
- Any changes to the stats dashboard HTML or JS itself
