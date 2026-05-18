# Loved Docs — Patterns Reference

A condensed catalog of patterns observed across docs sites that are universally well-loved (Stripe, Tailwind, React, Astro, Svelte, Prisma, Linear, Supabase, Cloudflare, Next.js, plus shadcn/ui, Radix, MDN, Storybook, Bun, Vite, Drizzle, tRPC).

Use this as a reference during audits when judging whether a page is "complete" vs "loved." A complete page is correct; a loved page makes the reader want to keep reading.

---

## Table Stakes (everyone loved has these)

1. **Cmd-K search that returns specific things** — utilities, components, API methods, not just page titles
2. **Copy buttons on every codeblock** with persistent package-manager and language tabs
3. **Two-track IA: Learn vs Reference** as separate spines (React, Stripe, Next, Prisma)
4. **A 30-second runnable hello-world** above the fold on the landing page
5. **Callout taxonomy** — 3–4 types max, usually Note/Tip + Warning/Caution + a signature one
6. **Dark mode that's actually designed**, not auto-inverted

## Differentiators (these set loved docs apart)

7. **Live editable examples inline** — the highest-leverage delight investment (React Sandpack, Tailwind Play, Svelte REPL, The Book of Shaders)
8. **Persistent context across pages** — Next's App/Pages toggle, Stripe's language tab, Prisma's database choice. Docs *remember who you are*.
9. **A signature callout type** that becomes the brand voice — Next's "Good to know," React's "Pitfall" + "Deep Dive," Stripe's pinned "Note." Cheap, effective, distinctive.
10. **Concepts as a first-class IA category**, separate from how-tos and reference. Acknowledges that *understanding* is a different mode than *doing*.
11. **An exhaustive, searchable example gallery** — for graphics libraries especially, *show, don't tell* the rendered output.
12. **Voice that sounds like a person** — even one or two lines per page (Tailwind's "this is an atrocity, what a horrible mess", Svelte's wit, React's "you are not expected to remember this"). Permission to be human.

The single highest-correlation pattern: **the docs site is itself a showcase of the product**. Astro docs run on Astro. Tailwind docs are styled with Tailwind. For a graphics library: render something on every page.

---

## Per-Site Distinctive Moves Worth Stealing

### Stripe (stripe.com/docs)
- 3-pane layout: prose left, persistent code panel right that follows you as you scroll
- Language tabs that remember your selection across the whole site
- Test card numbers callout-boxed everywhere they're useful (`4242 4242 4242 4242`)
- Sequence diagrams for multi-actor flows

### Tailwind (tailwindcss.com/docs)
- Every utility page has a pastel-tinted before/after preview with rendered HTML side-by-side
- Responsive-breakpoint and dark-mode toggles inline in previews
- Search returns utility classes as results, not just pages

### React (react.dev)
- Sandpack everywhere — every non-trivial example is editable, with real preview
- Two parallel tracks: **Learn** (ordered, conceptual) and **Reference** (alphabetical, surface-area)
- Custom illustrated diagrams (Maggie Appleton style)
- End-of-chapter challenges with show-solution toggles
- "You Might Not Need an Effect" — entire pages dedicated to *unlearning*

### Next.js (nextjs.org/docs)
- App Router vs Pages Router toggle rewrites the entire docs site
- Per-page feedback widget ("Was this helpful?")
- "Good to know" callouts feel like the docs are *whispering helpful asides*
- Architecture section (how Next caches, renders) — most docs hide this

### Astro (docs.astro.build)
- Built on Starlight (their own framework — meta showcase)
- Recipes section: short focused how-tos
- i18n-first: language picker top-right, translation status pages
- `:::tip` `:::note` `:::caution` `:::danger` `<Aside>` types

### Svelte / SvelteKit (svelte.dev)
- Tutorial *is* the homepage of learning — 4-pane layout: lesson, files, editor, preview
- REPL-share-link culture so bug reports come with reproductions
- Green-check progress through tutorial steps

### Prisma (prisma.io/docs)
- Database tabs everywhere — every query example shows resulting SQL collapsed below
- "What you'll learn / What you'll build" preamble on every guide
- Time estimates on tutorials ("15 minutes")

### Linear (linear.app/docs)
- Aesthetic restraint as the signature — designed by humans who care about kerning
- Inline keyboard-shortcut chips (`⌘K`) in prose
- Reads like a product manual, not a developer reference

### Supabase (supabase.com/docs)
- Live SQL editor embedded in some pages
- AI assistant in the corner trained on the docs
- Per-product mini-IAs (Database, Auth, Storage, etc.) all consistent

### Cloudflare (developers.cloudflare.com)
- Identical structure across 40+ products: Get started / Configuration / Examples / Reference / Tutorials / FAQ
- Migration guides from competitors ("Migrate from AWS Lambda")

### Single-Pattern Standouts
- **shadcn/ui** — copy-paste components, not npm install. Docs *show the source code you're about to paste*.
- **Radix UI** — keyboard interaction tables on every component (`Space → Activates the focused button`)
- **MDN** — browser compat tables; the data table is the unique artifact
- **Storybook** — docs *generated from stories*; example and doc are the same artifact
- **Bun** — ruthlessly terse single-page-feeling docs; speed *as voice*
- **Vite** — "Why Vite?" essay as Chapter 1 — sells philosophy before the API
- **Drizzle** — SQL-first comparisons ("If you know SQL, you know Drizzle")
- **tRPC** — animated GIFs of autocomplete in IDEs to prove the type-safety claim

---

## LLM-Targeted Docs (`llms.txt` / `llms-full.txt`)

### The convention
Spec at <https://llmstxt.org>. File at site root. Markdown with this structure:

```markdown
# Project Name

> One-line summary in a blockquote.

Optional intro prose.

## Section (grouped by user intent)

- [Title](URL): one-line description of when an LLM would want this

## Optional

- Things nice-to-have if context is tight
```

`llms-full.txt` is the entire docs flattened to one file for context-efficient ingestion. `llms-small.txt` (Svelte's variant) is the same idea trimmed for context-constrained models.

### Best-practice patterns

- **Group by user intent**, not by site IA ("Build a Sprite," not "API Reference")
- **Each link** has a one-sentence description: *what would an LLM want this for*
- **Optional H2 section** at the end for stuff LLMs can skip if context is tight
- **`llms-full.txt` is generated**, not hand-maintained — strip nav, copy buttons, JSX; pure markdown
- **CI invariant**: regenerate on every docs change; fail build on drift
- **Examples to mimic**: <https://docs.anthropic.com/llms.txt>, <https://svelte.dev/llms.txt>

### When auditing

The audit treats `llms.txt` and `llms-full.txt` as first-class artifacts. Every renamed slug, every removed page, every malformed link in the prose docs is also a finding in the LLM docs.

---

## Anti-Patterns (loved docs avoid these)

- **All-prose pages** for visual products. If the API renders something, render it.
- **API reference dressed up as a guide.** Reference is alphabetical, surface-area-complete, and dry. Don't put narrative tasks in reference.
- **Generated example sites that aren't searchable / filterable.** A drei-style or three.js-examples-style gallery only works if I can find the one I need.
- **Marketing voice in technical docs.** "Powerful, blazing fast, intuitive" is a smell. The audit should flag pure-marketing sentences.
- **Cross-links that drift.** Loved docs maintain a CI link-checker.
- **Callout proliferation.** More than 3–4 callouts per page becomes noise; the signature callout loses its force.
- **Long preamble before the first runnable example.** If the reader has to scroll past 300 words of theory before seeing code, they leave.

---

## Voice — Concrete Examples Worth Imitating

> "You are not expected to remember all of this."  — React docs, after a dense section

> "Now I know what you're thinking, 'this is an atrocity, what a horrible mess!' — and you're right, it's kind of ugly. In fact it's just about impossible to think this is a good idea the first time you see it — you really have to try it."  — Tailwind, on utility-first

> "Astro is a website framework. Just websites."  — Astro, framing scope honestly

> "Welcome to the Svelte tutorial. This will teach you everything you need to know to build fast, small web applications easily."  — Svelte

> "Good to know: ..."  — Next.js, signature aside

These all share two qualities: **the doc admits something** the reader is already thinking, and the writer has **permission to be a person**. One sentence per page in this register is a high-leverage voice change.
