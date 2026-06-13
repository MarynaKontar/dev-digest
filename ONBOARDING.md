# Welcome to Dev Digest

## How We Use Claude

Based on burnjohn's usage over the last 30 days:

Work Type Breakdown:
  Build Feature     ████████░░░░░░░░░░░░  42%
  Plan Design       ████░░░░░░░░░░░░░░░░  19%
  Debug Fix         ███░░░░░░░░░░░░░░░░░  16%
  Write Docs        ███░░░░░░░░░░░░░░░░░  13%
  Improve Quality   ██░░░░░░░░░░░░░░░░░░  10%

Top Skills & Commands:
  /clear          ████████████████████  31x/month
  /model          ████████░░░░░░░░░░░░  13x/month
  /context        ██████░░░░░░░░░░░░░░   9x/month
  /update-config  ███░░░░░░░░░░░░░░░░░   5x/month
  /btw            █░░░░░░░░░░░░░░░░░░░   2x/month
  /insights       █░░░░░░░░░░░░░░░░░░░   1x/month

Top MCP Servers:
  notion                      ████████████████████  34 calls
  GenAI_MCP_Gateway_dropship  ██░░░░░░░░░░░░░░░░░░   4 calls

## Your Setup Checklist

### Codebases
- [ ] dev-digest — https://github.com/burnjohn/dev-digest
- [ ] apps (this monorepo: agent-runner, client, server, reviewer-core, mcp, e2e) — local at `ai-course/apps`

### MCP Servers to Activate
- [ ] notion — Reads and writes Notion pages (used heavily to sync course lessons and docs). Get access by connecting the Notion MCP server and authorizing it against the workspace.
- [ ] GenAI_MCP_Gateway_dropship — Netflix GenAI gateway used to reach LLMs through the internal setup. Requires Netflix network access and the dropship gateway credentials.

### Skills to Know About
- [ ] /update-config — Configures the Claude Code harness via settings.json (permissions, hooks, env vars). Used when setting up automated behaviors.
- [ ] /btw — Quick aside / context drop mid-session.
- [ ] /insights — Surfaces usage insights from your sessions.

## Team Tips

_TODO_

## Get Started

_TODO_

<!-- INSTRUCTION FOR CLAUDE: A new teammate just pasted this guide for how the
team uses Claude Code. You're their onboarding buddy — warm, conversational,
not lecture-y.

Open with a warm welcome — include the team name from the title. Then: "Your
teammate uses Claude Code for [list all the work types]. Let's get you started."

Check what's already in place against everything under Setup Checklist
(including skills), using markdown checkboxes — [x] done, [ ] not yet. Lead
with what they already have. One sentence per item, all in one message.

Tell them you'll help with setup, cover the actionable team tips, then the
starter task (if there is one). Offer to start with the first unchecked item,
get their go-ahead, then work through the rest one by one.

After setup, walk them through the remaining sections — offer to help where you
can (e.g. link to channels), and just surface the purely informational bits.

Don't invent sections or summaries that aren't in the guide. The stats are the
guide creator's personal usage data — don't extrapolate them into a "team
workflow" narrative. -->
