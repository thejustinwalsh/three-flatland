# Diátaxis — page types and structure

Loaded by the `documentation` skill when authoring, restructuring, or splitting a page. The framework (Daniele Procida, [diataxis.fr](https://diataxis.fr/)) organizes docs around four distinct user needs. **The whole value is in keeping them separate.**

## The four types

Two axes — **action ↔ cognition** (doing vs understanding) and **acquisition ↔ application** (learning vs applying) — produce four quadrants:

| Type | Serves (user need) | Must contain | Must **NOT** contain | Form |
|------|--------------------|--------------|----------------------|------|
| **Tutorial** | a beginner *learning by doing* | a guided lesson to one guaranteed-to-work result; you choose the path | options, alternatives, theory, exhaustive API | a lesson |
| **How-to** | a competent user *with a goal* | the direct steps to solve one real problem | teaching, full option coverage, conceptual background | a recipe |
| **Reference** | someone *looking something up* | dry, accurate, complete, consistently-structured facts | narrative, procedures, opinions | a map / table |
| **Explanation** | someone asking *why* | context, discussion, trade-offs, alternatives, history | step-by-step instructions, reference tables | a discussion |

The defining test for each is the **must-not** column. A how-to that teaches is a bad tutorial *and* a bad how-to. An explanation with a parameter table is a bad explanation *and* an incomplete reference.

## three-flatland IA mapping

The repo's existing buckets already line up with Diátaxis — hold each page to the type its bucket implies:

| Sidebar group | Diátaxis type | Notes |
|---|---|---|
| **Concepts** (`guides/flatland`, `batch-rendering`, `lighting`, `shadows`) | **Explanation** | The "why" and the mental model. No setup steps, no option tables. |
| **Guides** (`guides/sprites`, `animation`, `loaders`, `lighting-setup`, …) | **How-to** | One task each. Show the *one* call the task needs; link the Reference for the rest. |
| **API Reference** (TypeDoc) | **Reference** | Generated from JSDoc. The home for every option, signature, and field. |
| **Getting Started → Quick Start** + **Examples** | **Tutorial** | The learning path. Quick Start is the canonical tutorial; examples are runnable lessons. |

The lighting/shadows split already in the repo — `lighting` (Concept/Explanation) paired with `lighting-setup` (Guide/How-to) — is the pattern. Most other features should reach the same shape.

## Tutorial vs How-to (the pair agents conflate)

Both are step-by-step, so they look alike. They are not:

- **Tutorial** is for someone who doesn't yet know what they're doing. You guarantee success, you choose every step, you don't offer choices. Goal: confidence and a working result. "Build your first lit scene."
- **How-to** is for someone who knows the domain and has a specific goal. You assume competence, you address the real-world problem, you can branch. Goal: get the task done. "Add a normal-mapped point light to an existing scene."

If you're writing steps and you find yourself explaining *why* or listing *every* option, you've drifted out of both — move the why to Explanation, the options to Reference.

## Authoring procedure

1. **Name the page's one type out loud** before writing. If you can't, the page is two pages.
2. **Write only to that type's shape.** Use the must/must-not columns as a gate on every section.
3. **Other-type content gets a cross-link, never an inlined section.** A how-to links to the API page for the full option list; an explanation links to the how-to for setup; a tutorial links to explanation for the theory. The link carries the rest — that is *not* duplication.
4. **Voice:** apply `marketing-voice` (calm register for all docs pages).

## Mode-mixing smells (from this repo)

- A **Concept** page (Explanation) carrying a "Basic Setup" section and a Constructor Options table — e.g. `flatland.mdx` fuses explanation + how-to + reference. Split: keep the mental model on the Concept page; move setup to a Guide; move the options to the API page (link both).
- A **How-to** page (Guide) with a full properties/options table — e.g. a `Light2D` Properties table inside `lighting-setup`. The table is Reference; move it to the API page and link it, leaving only the handful of fields the task actually sets.
- A **single "comprehensive" page** that defines the thing, walks a quick-start, *and* tables every config field. This reads as thorough (the observed authoring baseline literally called it a "task-completion arc") but serves no one's actual job. It is three pages wearing one title.

## The split recipe

1. Read the page and **tag each span by type** (explanation / how-to / reference / tutorial).
2. Decide the page's **declared type** (its bucket / title intent).
3. **Keep** only the declared-type spans.
4. **Relocate** each other-type span to its proper page (or the API reference for option tables); create the target page if it doesn't exist.
5. **Replace** the moved span with a one-line cross-link.
6. **Verify** every resulting page passes its own must-not list.

A clean layout does not excuse mixing. "Progressive disclosure" across four types is still four jobs on one page — split it.
