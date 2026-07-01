# Token-Efficient Agent Workflow — Playbook & Checklist

**Type (Diátaxis):** How-to / Reference — a practical checklist for driving multi-agent feature work (researcher → planner → implementer → test-writer → reviewers) at the lowest reasonable token cost.
**Origin:** Distilled from the Intent Layer build (see `docs/plans/intent-layer.md`), which cost ~1.7M subagent tokens. The levers below would have cut that ~35–40% with no quality loss.

---

## Core principle

**Every spawned agent pays a fixed "cold-start tax":** it re-reads `AGENTS.md`/`INSIGHTS.md`, re-explores the codebase, and re-derives context you already have. That exploration is the bulk of a 75–160k-token implementer run. So the two biggest levers are:

1. **Spawn fewer, larger agents** (amortize exploration).
2. **Don't spawn at all for small deterministic edits** — do them inline.

Everything else (model right-sizing, tighter scope) is secondary.

---

## Pre-flight checklist (before launching ANY agent)

- [ ] **Execution mechanics settled first.** Worktree vs. main tree? Sequential vs. parallel? Decide and (if needed) change agent frontmatter *before* the first spawn. — *Cost of skipping: one wasted round (~80k in the Intent build).*
- [ ] **Is this task agent-worthy?** If it's a <~10-line deterministic edit (rename, config bump, 2-line schema add, mirror a contract, move a file), **do it inline yourself.** Reserve agents for genuine exploration + multi-file coding.
- [ ] **Can adjacent units be batched into one agent?** Group by shared exploration surface (e.g. all backend files in one module) so exploration is paid once, not per file.
- [ ] **Cheapest model that can do it?** (see table below).
- [ ] **Context handed in, not hunted for?** Paste exact paths/signatures/excerpts into the prompt — a longer prompt is cheaper than the exploration it saves (output tokens cost more than input).

---

## Spawn-vs-inline decision rule

| Do it INLINE (no agent) | Spawn an AGENT |
|---|---|
| Mechanical/deterministic edit | Needs codebase exploration to get right |
| Single small file, ≲10 lines | Multi-file coding against a spec |
| Contract mirror, config value, migration generate | New module / adapter / non-trivial logic |
| Moving a file + fixing imports (e.g. the W1 fix) | Anything you can't fully specify up front |
| Arithmetic / tallying / summarizing | Independent review that must be unbiased |

> In the Intent build, Units 1, 2, and 5 (contract mirror, 2-line migration, one-file injection) were agent-run for ~300k combined; inline they'd have been a fraction of that. W1/Q2 *were* done inline — cheap and fast. Copy that pattern.

## Batching rule

- **One agent per shared exploration surface**, not one per plan "unit". Disjoint-file "work units" exist to enable *parallel worktrees*; once you go **sequential in one tree**, that boundary stops paying off and just multiplies cold starts.
- Good batches: `migration + new-adapter`, `service + its-route-wiring`, `all tests for one package`.
- Keep a batch small enough to still self-verify green in one pass.

## Model right-sizing

| Task | Model | Why |
|---|---|---|
| Planning, hard architecture judgement | **opus** | Reasoning-heavy, sets the spec everything follows |
| Implementation / mechanical build-out to a locked spec | **sonnet** | Follows a plan; opus is wasted here |
| Test-writing | **sonnet** | Pattern-following against existing suites |
| Requirement traceability (plan-verifier) | **sonnet** | Mechanical met/not_met with file:line — opus is overkill |
| Whole-tree architecture review | **opus** | Genuine judgement about layering/cycles |
| Tallying, summarizing, arithmetic | **haiku** | Trivial; never burn opus/sonnet on it |

*(See memory: "Delegate implementation to cheaper model".)*

---

## Per-phase checklist

**Plan (opus, 1 agent)**
- [ ] Scope the researcher tightly: "find only integration points X/Y/Z, no full-file dumps." Broad 15-question research with excerpts is expensive.
- [ ] Produce a plan with exact file paths + signatures so implementers explore less.
- [ ] Bake execution mechanics into the plan (see §9 pattern in `intent-layer.md`).

**Implement (sonnet)**
- [ ] Inline the trivial units yourself.
- [ ] Batch the rest into a few agents by exploration surface.
- [ ] Hand each agent the precise files it owns + the interface facts from research (don't make it re-discover them).
- [ ] Verify green between batches.

**Test (sonnet)**
- [ ] One agent per package (reviewer-core / server / client).
- [ ] Skip the highest-effort/lowest-marginal-value suites when static verification + unit tests already cover the behavior (e.g. a DB-backed `.it.test` that only re-confirms wiring the plan-verifier already proved).

**Review (right-sized)**
- [ ] For a change that is already typecheck- + test-green, **one** review pass is often enough — don't reflexively run both architecture-reviewer *and* plan-verifier.
- [ ] Run verifier on sonnet; reserve opus architecture review for structurally risky changes.

---

## Anti-patterns seen (with evidence)

| Anti-pattern | What it cost | Fix |
|---|---|---|
| Launching agents before settling worktree/isolation | ~80k wasted round | Settle mechanics first |
| One agent per tiny unit | 7 cold starts, ~845k | Batch + inline trivial units |
| opus for mechanical verification | ~117k (plus a retry after an overload) | Use sonnet |
| Two full review passes on already-green code | ~222k | One pass, right-sized |
| Broad research with full excerpts | ~92k for one researcher | Tighter scope |

---

## Quick reference

> **Plan on opus once → inline the trivial → batch the rest on sonnet → one test agent per package → one right-sized review → haiku for sums.**

Target for a feature of Intent-Layer size: **~1.0–1.1M** subagent tokens, not ~1.7M.
