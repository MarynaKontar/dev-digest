# Frontend Architecture Skill

**Version:** 1.0.0
**Scope:** Frontend
**Stack:** React 18+ · Next.js 15+ (App Router) · TypeScript
**Last updated:** 2026-06-27

---

## What This Skill Covers

Architectural decisions and code organization patterns for React + Next.js projects.

This skill answers:
- Where do different types of files go?
- When should a component be split into smaller ones?
- What is the difference between `utils/` and `lib/`?
- Where does business logic live?
- How do features communicate without coupling?
- What naming conventions apply to files, folders, and exports?
- How does the Next.js App Router affect code organization?

## Focus

**Code organization and architectural structure** — operating at the level of "where does this file go and why", not "how do I write this hook" or "which Next.js API should I use."

This skill covers structure across three scales:
1. **File** — what order things go in, when to extract a helper
2. **Module** — component breakdown, the 3-layer pattern, when to split
3. **Project** — feature-based architecture, dependency direction, promotion rules

---

## What This Skill Does NOT Cover

| Topic | Use instead |
|---|---|
| React coding patterns (hooks rules, state, rendering) | `react-best-practices` |
| Next.js framework APIs (RSC, metadata, route handlers, image/font) | `next-best-practices` |
| TypeScript type design and generics | `typescript-expert` |
| Zod schema writing and validation patterns | `zod` |
| Auth, injection, OWASP security | `security` |
| Database schema design | `postgresql-table-design` |

---

## When to Use This Skill

**Trigger on:**
- Starting or scaffolding a new React or Next.js project
- Deciding where to put a new file, folder, or module
- A codebase is growing and organization is becoming unclear
- Reviewing a PR for structural/architectural concerns (not logic bugs)
- Asking "where should this business logic go?" or "should I split this component?"
- Designing feature boundaries or planning a feature-based migration
- Setting up naming conventions for a team

**Do NOT trigger on:** writing hooks, fixing rendering bugs, optimizing bundle size, or implementing a specific Next.js feature — use the skills above instead.

---

## Related Skills & Boundaries

| Skill | Their focus | Boundary with this skill |
|---|---|---|
| `react-best-practices` | React coding patterns, hooks rules, state, rendering anti-patterns | This skill = WHERE files go; react-best-practices = HOW to write the code inside them. Tiny overlap on "feature-based structure" (this skill goes much deeper). |
| `next-best-practices` | Next.js framework APIs: RSC, metadata, image, route handlers, bundling | This skill = project folder layout and organizational decisions; next-best-practices = framework-specific file conventions and runtime behavior. `file-conventions.md` in next-best-practices covers special file names; this skill covers the organizational rationale for using them. |
| `typescript-expert` | Type-level programming, tsconfig, generics, migration | This skill touches naming of type files and where `types/` lives; typescript-expert covers how to write the types inside them. |
| `zod` | Zod schema validation patterns, parsing, error handling | This skill covers where validation schemas are placed (`lib/validation/` or colocated); zod covers how to write them. |
| `security` | OWASP Top 10, auth, input handling, secrets | This skill touches where auth config lives (`lib/auth.ts`); security covers what auth code should actually do. |

---

## File Structure

```
frontend-architecture/
  SKILL.md                          # Main skill file — evolution rule + topic index
  README.md                         # This file
  references/
    folder-structure.md             # Top-level layout, what each folder contains
    nextjs-conventions.md           # App Router: colocation, private folders, route groups
    component-breakdown.md          # SRP, 3-layer pattern, 6 pillars, split heuristics
    feature-modules.md              # Feature-based arch, public API, dependency direction
    constants.md                    # Constants placement, naming, promotion rules
    utilities-helpers.md            # utils/ vs lib/, pure functions, grouping, naming
    business-logic.md               # Hooks, server actions, queries, dependency graph
    naming-conventions.md           # Files, folders, exports — full naming reference
```

---

## Version History

| Version | Date | Notes |
|---|---|---|
| 1.0.0 | 2026-06-27 | Initial release — React + Next.js 15 App Router, 8 reference files |

---

## Research Sources

All sources reviewed firsthand to build the rules in this skill.

| Source | URL | Topics covered |
|---|---|---|
| **Next.js Official Docs — Project Structure** | https://nextjs.org/docs/app/getting-started/project-structure | Special files, colocation, private folders (`_`), route groups, three organization strategies, component hierarchy |
| **Robin Wieruch — React Folder Structure Best Practices [2026]** | https://www.robinwieruch.de/react-folder-structure/ | Feature-based structure, dependency direction, public API pattern, promotion rules, singular/plural naming, absolute imports |
| **WebDevSimplified — React Folder Structure Beginner to Advanced** | https://blog.webdevsimplified.com/2022-07/react-folder-structure/ | Three-stage structure evolution (simple → intermediate → advanced), ESLint enforcement of feature encapsulation |
| **Profy.dev — Popular Structures & Screaming Architecture** | https://profy.dev/article/react-folder-structure | Feature-based vs type-based, colocation principle, "colocate first, extract later" |
| **freeCodeCamp — Reusable Architecture for Large Next.js Apps** | https://www.freecodecamp.org/news/reusable-architecture-for-large-nextjs-applications/ | Dependency graph direction, `lib/` vs `utils/` distinction, feature modules, one-way data flow |
| **Khalil Ahmed — Next.js Long-Term Maintainability** | https://www.khalilahmed.dev/blog/structure-nextjs-project-long-term-maintainability | Feature modules, naming conventions, `lib/` definition, SCREAMING_SNAKE_CASE for constants, deletable features |
| **cekrem.github.io — SRP in React** | https://cekrem.github.io/posts/single-responsibility-principle-in-react/ | Single Responsibility Principle applied to React, "one reason to change", smart vs dumb components |
| **Felipe Pereira / Medium — SRP in React** | https://medium.com/@cb.felipe/single-responsibility-principle-srp-in-react-writing-components-with-a-clear-and-maintainable-dc2e098a37f7 | 3-layer pattern (hook layer + presentational layer + container layer) with code examples |
| **The T-Shaped Dev — SRP: Write Focused Components** | https://thetshaped.dev/p/single-responsibility-principle-srp-in-react-write-focused-components | Breakdown heuristics, "and" test, what counts as a single responsibility |
| **Abbas Roholamin / Medium — Six Pillars of Component Architecture** | https://medium.com/@abbas-roholamin/splitting-a-ui-into-components-in-react-six-pillars-of-component-architecture-04538e542ce5 | Six pillars: logical separation, reusability, SRP, maintainability, testability, performance |
| **DEV Community — Feature-Based Scalable Architecture** | https://dev.to/naserrasouli/scalable-react-projects-with-feature-based-architecture-117c | Feature module pattern, self-contained modules, encapsulation |
| **Netguru — Professional React Project Structure 2025** | https://www.netguru.com/blog/react-project-structure | Constants folder, utils folder, naming conventions for growing projects |
| **React Legacy Docs — File Structure FAQ** | https://legacy.reactjs.org/docs/faq-structure.html | "No strong opinions on this", colocation over hierarchy |
