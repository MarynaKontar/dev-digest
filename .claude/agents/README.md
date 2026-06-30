# Agents

Custom Claude Code **subagents** for the DevDigest repo. Each agent is a Markdown
file with YAML frontmatter (`name`, `description`, `tools`, `model`, …) whose body
becomes the agent's system prompt. They are loaded at session start and invoked
via the `Agent` tool (or `@name`). Canonical location is `.claude/agents/`.

> A subagent runs in its **own fresh context** — it sees only its system-prompt
> body plus basic environment (cwd, git status, CLAUDE.md), **not** the parent
> conversation. So each agent's body must be self-contained.

## Catalog

| Agent | Model | Writes? | What it does |
|-------|-------|---------|--------------|
| [`planner`](planner.md) | opus | No (read-only) | Turns a feature request into a structured **Development Plan** with parallel-safe work units, required skills, and acceptance criteria. |
| [`implementer`](implementer.md) | sonnet | Yes (own worktree) | Executes **one work unit** from a plan — UI or backend — applying the mandated per-layer skills, then self-verifies (tests + type-check + lint green). |
| [`researcher`](researcher.md) | sonnet | No (read-only) | Finds and reports information from the codebase **or** the public Internet, source-grounded. Never mutates anything. |
| [`test-writer`](test-writer.md) | sonnet | Yes (test files only) | Writes tests for **both** UI (Vitest + RTL) and backend (Fastify `app.inject()` + Drizzle), grounded in repo skills + `TESTING.md`. Integrity guardrails forbid weakening/skipping tests to force a pass. |
| [`architecture-reviewer`](architecture-reviewer.md) | opus | No (read-only) | Single-shot, whole-tree architectural review — onion-layer & frontend-layering violations, reviewer-core isolation, cyclic deps. Force-ranked findings, each with `file:line` + the exact offending import. |
| [`plan-verifier`](plan-verifier.md) | opus | No (read-only) | Verifies a Development Plan against the written code: enumerates every requirement, then assigns `met`/`partially_met`/`not_met`/`cannot_verify` with `file:line` evidence. Focus is **traceability**, not code quality. |
| [`doc-writer`](doc-writer.md) | sonnet | Yes (doc files only) | Documents shipped functionality, converts plans into ADRs/how-tos, and turns arbitrary material into structured docs **with Mermaid diagrams**. Classifies via Diátaxis and places docs correctly. |

The intended flow: **`researcher`** gathers context → **`planner`** writes the plan
→ one or more **`implementer`** agents execute the work units in parallel (each in
its own git worktree) → **`test-writer`** adds coverage and **`architecture-reviewer`**
+ **`plan-verifier`** audit the result (structural soundness and requirement coverage,
respectively) → `/pr-self-review` does the deep review before a PR → **`doc-writer`**
documents what shipped. The three read-only auditors (`architecture-reviewer`,
`plan-verifier`, `researcher`) and the two writers (`test-writer`, `doc-writer`) all
run in fresh context, so each is unbiased by the implementer that produced the code.

---

## `planner` & `implementer` — design & sources

These two were designed together from Anthropic's official subagent guidance. They
share **one identical `skills:` set** (16 skills) because the implementer executes
the planner's plan, so both are held to exactly the same engineering practices.

### What they're based on

**Architecture awareness.** The planner carries the DevDigest module map (server /
client / reviewer-core / e2e + onion layers + vendored shared contracts) and reads
the relevant `*/AGENTS.md`, `README.md`, `TESTING.md`, and per-module `INSIGHTS.md`
before planning. The layer→skill mapping in both agents is reused verbatim from the
`pr-self-review` skill, so planning, implementing, and reviewing speak the same
buckets.

**Engineering insights (two channels).** The planner is the relevance filter —
it extracts only the `INSIGHTS.md` lessons that constrain the current feature and
attaches them to the work unit they affect. Each implementer re-reads its module's
insights **in place** (scoped to the actionable sections + its owned files) as a
local safety net, and auto-reads a co-located `INSIGHTS.md` in its owned directory
if one exists.

**Self-review boundary.** The implementer does **not** deep-review its own code
(a fresh-context reviewer is unbiased; the author is not). It only proves its code
builds and the existing tests/type-check/lint pass, and shows the command output as
evidence. Deep architectural/correctness review stays with `/pr-self-review`.

### Best practices applied (with sources)

| Practice | Source | How it lands |
|----------|--------|--------------|
| Explore → Plan → Implement → Verify separation | best-practices | `planner` is read-only (`permissionMode: plan`); `implementer` only writes |
| `description` is the routing signal (role + domain + "use proactively") | sub-agents | Both descriptions written action-first |
| Self-contained spec: names files/interfaces, out-of-scope, ends with a verification step | best-practices | Mandatory Development Plan template |
| Exclusive file ownership per work unit | agent-teams | Planner emits disjoint file ownership; cross-cutting files run separately |
| `isolation: worktree` to prevent edit collisions | sub-agents | Set on `implementer` for parallel safety |
| Task sized "just right" (self-contained deliverable) | agent-teams | Planner cuts units at endpoint / component / test-file granularity |
| Reviewer in a fresh context, not the author | best-practices | Implementer self-verifies only; deep review → `/pr-self-review` |
| Self-verify by running tests/lint and showing evidence | best-practices | Implementer step 4 |
| Don't chase out-of-scope findings | best-practices | Implementer reports out-of-scope gaps instead of fixing them |
| Pin `model` to the task (opus=reasoning, sonnet=mechanical) | sub-agents | `planner: opus`, `implementer: sonnet` |
| Tight body, every line earns its place | best-practices | Both bodies kept compact |
| `skills:` frontmatter declares the skill set | sub-agents | Identical 16-skill list on both + layer→skill table in the body |
| Give each worker an objective, format, tools, and clear boundaries | multi-agent-research-system | Each work unit specifies goal, owned files, skills, steps, "Done when", out-of-scope |
| Plan kept in external memory (context fills up) | multi-agent-research-system | Insights distilled into the plan; implementers re-read in place |

### Sources (fetched firsthand by the `researcher` agent)

- [Create custom subagents — Claude Code Docs](https://code.claude.com/docs/en/sub-agents)
- [Orchestrate teams of Claude Code sessions — Claude Code Docs](https://code.claude.com/docs/en/agent-teams)
- [Best practices for Claude Code — Claude Code Docs](https://code.claude.com/docs/en/best-practices)
- [How we built our multi-agent research system — Anthropic Engineering](https://www.anthropic.com/engineering/multi-agent-research-system)

> Coverage note: the four pages above were read firsthand. Secondary blog results
> (pubnub, builder.io, medium, …) were seen only in search snippets and **not**
> relied upon. Two details are inferred from the frontmatter table rather than a
> dedicated page: the exact behavior of `isolation: worktree`, and that a custom
> planner reaches plan-mode tools only via `permissionMode: plan`.

---

## `researcher` — design

Read-only investigation agent (`tools: Read, Grep, Glob, WebSearch, WebFetch,
Bash`). Picks the right source (project codebase vs. Internet), grounds every
claim in `path:line` or a fetched URL, has an interview mode for ambiguous
requests, and says "Not found" rather than guessing. It is the context-gathering
front end to the planner.

---

## `test-writer`, `architecture-reviewer`, `plan-verifier`, `doc-writer` — design & sources

These four were designed together from a parallel `researcher` sweep of 2025-26
best practices, then planned by `planner` and built by four parallel `implementer`
agents (one file each, disjoint ownership). Like `planner`/`implementer`, each
declares its skill set in **both** the `skills:` frontmatter **and** the body. The
two reviewers carry **no write tools** (`tools: Read, Grep, Glob, Bash, Skill`);
the two writers add `Write, Edit` but stay in their lane (test files / doc files
only). Model is pinned to the task: `opus` for the reasoning-heavy read-only
reviewers, `sonnet` for the generation-heavy writers.

### `test-writer` (sonnet · writes test files)

Writes tests for both surfaces: backend via `app.inject()` + `MockLLMProvider`
(`server/src/adapters/mocks.ts`), tiered `*.test.ts` (hermetic) vs `*.it.test.ts`
(testcontainers Postgres, self-skips without Docker); frontend via Vitest + RTL
with `getByRole` query priority, `userEvent`, `findBy*`/`waitFor`, and `fetch`
mocking (the repo convention per `TESTING.md` / `client/AGENTS.md` — MSW only when
network-level interception is genuinely needed). Its **integrity guardrails** are
the core value: never weaken/`.skip`/delete a failing test to force a pass, never
assert current output as expected (tautology), investigate both test and
implementation on failure.

| Practice | Source (fetched firsthand) |
|----------|--------|
| Test-integrity rules for AI agents (no tautologies, no test-bending) | [jsmanifest — 5 test integrity rules](https://jsmanifest.com/5-test-integrity-rules-ai-agents-typescript) |
| `app.inject()` over a live port / supertest | [Fastify v5 Testing docs](https://fastify.dev/docs/v5.4.x/Guides/Testing/) |
| Drizzle unit vs integration, rollback paths | [helpmetest — Drizzle ORM testing guide](https://helpmetest.com/blog/drizzle-orm-testing-guide/) |
| RTL query priority, `userEvent`, async patterns | [makersden — RTL + Vitest guide](https://makersden.io/blog/guide-to-react-testing-library-vitest) |
| AAA, naming, what NOT to test, coverage discipline | [augmentcode — unit testing best practices](https://www.augmentcode.com/guides/unit-testing-best-practices-that-focus-on-quality-over-quantity) |
| Guardrails so agents can't game the suite | [dev.to/htekdev — tests are everything in agentic AI](https://dev.to/htekdev/tests-are-everything-in-agentic-ai-building-devops-guardrails-for-ai-powered-development-2onl) |

### `architecture-reviewer` (opus · read-only)

Single-shot, whole-tree structural review (not diff-only; no reflexion loop — that
lowers signal-to-noise). Checks dependency direction inward, service→adapter via a
port, no `db/schema` types in services, `reviewer-core` isolation, cross-module
cyclic deps, and frontend layering (upward imports, logic in `page.tsx`, `fetch()`
in hooks). Excludes `vendor/**`; treats course-template stubs as deferred
QUESTIONS. Output is force-ranked (≤~10 findings), three-tier severity, **no
finding without `file:line` + the exact offending import**.

| Practice | Source (fetched firsthand) |
|----------|--------|
| Whole-tree scope, single-shot > reflexion for signal-to-noise, ≤10 findings | [arXiv — CR-Bench](https://arxiv.org/html/2603.11078v1) |
| Frontend layering (app→features→entities→shared) | [Feature-Sliced Design — frontend clean architecture](https://feature-sliced.design/blog/frontend-clean-architecture) |
| Hexagonal red flags (anemic domain, leaky ports, over-decoupling) | [Albert Llousas — hexagonal pitfalls](https://medium.com/@allousas/hexagonal-architecture-common-pitfalls-f155e12388a3) · [Arho Huttunen — hexagonal architecture](https://www.arhohuttunen.com/hexagonal-architecture/) |
| Enforcing dependency direction in TypeScript | [dev.to/remojansen — fresh-onion](https://dev.to/remojansen/enforce-clean-architecture-in-your-typescript-projects-with-fresh-onion-45pi) |
| Severity tiers, evidence-grounded findings | [metacto — AI code review standards](https://www.metacto.com/blogs/establishing-code-review-standards-for-ai-generated-code) · [VoltAgent — architect-reviewer subagent](https://github.com/VoltAgent/awesome-claude-code-subagents/blob/main/categories/04-quality-security/architect-reviewer.md) |

### `plan-verifier` (opus · read-only)

Requirements-coverage verifier, NOT a quality reviewer. Enumerates every
requirement atomically *before* opening any code, then assigns `met` /
`partially_met` / `not_met` / `cannot_verify`, each with `file:line` evidence and a
confidence score (a verdict with no citation auto-downgrades to `cannot_verify`;
`not_met` requires ≥75 confidence). Greps for incompleteness markers
(`TODO`/`STUB`/`throw new Error("not implemented")`/`.skip`) and distinguishes test
existence from test adequacy. Carries the **separation principle** verbatim ("you
have no stake in it passing").

| Practice | Source (fetched firsthand) |
|----------|--------|
| Machine-verifiable acceptance criteria (Given-When-Then, binary pass/fail) | [BrainGrid — acceptance criteria an AI agent can verify](https://www.braingrid.ai/blog/how-to-write-acceptance-criteria-ai-agent-can-verify) |
| Requirements traceability, coverage/orphan metrics, gap detection | [aqua cloud — AI requirement traceability](https://aqua-cloud.io/ai-requirement-traceability/) |
| Definition-of-Done / Check-phase verification | [InfoQ — PDCA for AI code generation](https://www.infoq.com/articles/PDCA-AI-code-generation/) |
| Confidence gating, separation of writer from verifier | [dev.to/teppana88 — validating AI-written code](https://dev.to/teppana88/how-i-validate-quality-when-ai-agents-write-my-code-481c) |
| Evidence-bound claims (no file:line → no pass), anti-agreement-bias | [arXiv — EviBound](https://arxiv.org/abs/2511.05524) |
| Detecting fake completion / CI gaming | [GitHub Blog — reviewing agent pull requests](https://github.blog/ai-and-ml/generative-ai/agent-pull-requests-are-everywhere-heres-how-to-review-them/) |

### `doc-writer` (sonnet · writes doc files)

Classifies every input via **Diátaxis** before writing (code→Reference/Explanation,
plan→How-to + ADR, concept→Explanation, onboarding→Tutorial; one doc = one type).
Knows the repo doc map — `docs/`, `docs/agent-prompts/`, `<pkg>/AGENTS.md`,
`INSIGHTS.md` — and treats `docs/decisions/` (MADR ADRs) and `docs/architecture/`
as directories to create on first use, never asserting they exist. Picks Mermaid
type by concept, and enforces **anti-hallucination**: read before writing, cite
`path:line`, no invented examples, declare files read at the end of each doc.

| Practice | Source (fetched firsthand) |
|----------|--------|
| Diátaxis (tutorial/how-to/reference/explanation) | [Diátaxis](https://diataxis.fr/) |
| ADRs — purpose, lifecycle, keep-in-repo | [Martin Fowler — Architecture Decision Record](https://martinfowler.com/bliki/ArchitectureDecisionRecord.html) · [MADR template](https://adr.github.io/madr/) |
| Mermaid in markdown, diagram-type choice | [GitHub Blog — Mermaid in markdown](https://github.blog/developer-skills/github/include-diagrams-markdown-files-mermaid/) · [glukhov.org — Mermaid cheatsheet](https://www.glukhov.org/documentation-tools/diagrams/mermaid-diagrams-quickstart-cheatsheet/) |
| Grounding docs in code, avoiding hallucinated behavior | [diffray — LLM hallucinations in code review](https://diffray.ai/blog/llm-hallucinations-code-review/) |

> Coverage note: the URLs above were fetched firsthand by the `researcher` agents
> during design. Each agent's body cites only repo paths that were verified to
> exist at authoring time (e.g. `server/src/adapters/mocks.ts`,
> `server/src/platform/container.ts`, `docs/agent-prompts/`); `docs/decisions/` and
> `docs/architecture/` are intentionally described as not-yet-created.

---

## Adding a new agent

1. Create `.claude/agents/<name>.md` with frontmatter (`name`, `description`,
   `model`, `tools`, optional `skills`/`permissionMode`/`isolation`).
2. Write a tight, self-contained body — it fully replaces the default system
   prompt.
3. Make the `description` action-oriented so the orchestrator routes to it.
4. Add a row to the Catalog above; if it's based on external guidance, cite the
   sources.
5. Restart the session (or use `/agents`) so the new agent loads.
