---
name: marketing-voice
description: Use when writing or reviewing any user-facing prose for three-flatland — landing-page copy, docs-page intros, blog posts, README intros, release notes, or social posts. Required reading before drafting marketing copy in this repo.
---

# three-flatland marketing voice

This skill is the voice and prose guide for any user-facing copy in
this repo. It exists because LLMs reach for very recognizable defaults
when prompted to "write marketing copy," and those defaults sound
nothing like the developer-tooling voice three-flatland's audience
reads every day.

The patterns and verbatim examples in this skill are extracted from a
focused study of best-in-class developer-tooling voices across five
families: an official React-style framework documentation site, a
React 3D rendering library's docs and release notes, a type-safe
React data-library's docs and blog, a React Native tooling platform's
docs and blog, and a best-in-class real-time rendering engine's
feature documentation and launch posts. The skill teaches the
techniques those voices share; examples are quoted verbatim and
attributed by category, not by brand.

**REQUIRED SUB-SKILL: documentation** — this skill governs the *voice* of the
prose; `documentation` governs the *structure* (which Diátaxis type a page is,
what belongs on it, and the audit). When writing or auditing a docs page, use
both: `documentation` decides the page's type and contents, this skill decides
how it reads.

## The voice in one line

A senior engineer explaining a tool to another senior engineer. Direct
claims grounded in specifics. Examples integrated with prose. Honest
about scope and trade-offs. Closes thoughts on information, not
flourish.

## The reader

Most landing copy serves all three of these at once:

- **Working three.js / react-three-fiber dev** — has shipped scenes;
  wants architectural fit; reads carefully when a section names
  something technical they care about.
- **Game-curious web dev** — has shipped products in React/Next;
  intrigued by 2D games; bounces off jargon walls but appreciates
  real claims.
- **Returning engineer** — has used three-flatland before; here for
  changelogs, examples, escape hatches; wants the answer fast.

Treat all three like adults who already know `Object3D`, `Mesh`,
`Atlas`, `draw call`, `reconciler`, and `WebGL`. If a paragraph needs
to explain one of those words, the paragraph is in the wrong section
of the docs.

## Two registers

Different surfaces need different temperatures. Get this right and the
rest of the rules in this skill mostly take care of themselves.

### Calm register (the default)

**Use on:** docs pages (concept, reference, API), README intros for
sub-packages, internal architectural writing, most of the landing
page body (everything below the hero), most ValueProp sections.

**What it sounds like:** definitions, mechanism descriptions, flat
constraints, present-tense passive for system behavior, italicized
concept introductions on first use, quiet first-person plural for
recommendation only.

**What it doesn't do:** no exclamation points, no superlatives, no
emoji, no "today we're…" timestamps, no celebratory openers, **no
first-person attribution.** No "I built X." No "we shipped Y." Landing
pages and reference docs put the system on the stage. The library does
the work; the prose names the mechanism. First-person belongs in
authored surfaces only — see "First-person rule by surface" below.

### Dialed-up register (allowed, rationed)

**Use on:** landing-page hero or top-of-page section, blog launch
posts ("Introducing X," "X is here"), release notes for major or
codenamed releases, social-style posts (X, Bluesky, HN comments
from the team).

**What it adds, with a hard cap on how often:**

- **One time-stamped opener per page.** "X is here." "Now available."
  "Today we're shipping…" Not three.
- **One superlative per page, in the lede only.** "best possible,"
  "most powerful," "for the first time ever." Then back to plain
  technical language.
- **First-person plural becomes load-bearing.** "We built," "we
  measured," "we ship." Used to make the team visible.
- **Numbers as receipts get bolder.** "0.7 ms on M1 Pro." "16k × 16k
  shadow map." Specific hardware, specific workload.
- **One closer move per post is allowed.** Either: under-promise
  ("there will be bugs"), thank-the-team line, or one off-cuff
  personal aside. Pick one.
- **A single emoji is permissible** as a marker (🚀 on a release
  line, 👀 as a wink). More than one per post is the trope.
- **The trademark-glyph wink (just work™)** is a transferable move
  for landing copy that wants energy without sounding like an ad.

### Calibration rule

Per landing-page section: at most ONE marketing-register move. The
rest of the section is the calm register.

Per blog launch post: 1 lede + 1 closer in the dialed-up register,
body in calm register.

If three or more marketing-register moves are stacking up in one
piece, the piece has crossed into trope territory. Cut one.

### First-person rule by surface

The studied corpus is consistent on this and it's worth making
explicit because LLMs tend to import "I" and "we" from any source
prose they're handed.

**Surfaces that take first person:**
- Blog launch posts ("Introducing X," "X is here")
- Release notes from the team / changelog summaries
- Milestone retrospectives
- Personal-stakes essays from a maintainer
- Social posts, HN comments, conference recaps

These surfaces have an implicit or explicit author byline. The reader
expects a voice. "We built," "we measured," "we ship" land here.
"I went all in" lands here when the founder is telling a real story.

**Surfaces that DO NOT take first person:**
- Landing-page sections and ValueProps
- Feature pages
- API reference and concept docs
- README intros for the project or sub-packages
- SEO-load-bearing copy

These surfaces speak for the project, not for any individual. The
system goes on the stage. Use present-tense and present-tense passive
(technique #7). Name the mechanism. Let the work be the argument.

```
✅  three-flatland is built directly on three.js, so the coordination
    layer doesn't exist.
✅  Sprite batches stay intact when effects change.
✅  The batcher applies effects on a shared material.

❌  I built three-flatland to remove that class of problem.
❌  We engineered the batcher to keep batches stable.
❌  We're proud to ship the new pipeline.
```

The rule is independent of the calm/dialed-up register. A landing
page hero can be in the dialed-up register (one superlative, one
time-stamped opener) and still avoid first-person attribution. A
release-note blog post is the inverse: calm body register, but "we
shipped" earns its place because there's a byline.

**The exception inside the calm register:** technique #9's three
approved uses for "we" — recommendation, roadmap commitment, caution
— are still allowed in concept docs and reference pages because
they're functional, not promotional. "We recommend X" is project
guidance, not project self-promotion.

## Banned patterns

These are the patterns LLMs reach for when the prompt smells like
"marketing." Forbidden in both registers.

### Three-beat repetition for emphasis

```
❌  No second renderer. No bridge code. No dark arts.
❌  Three.js renders. R3F reconciles. Object3D is real.
❌  Composable. Performant. Ergonomic.
```

If you find yourself writing three short clauses in a row separated
by periods, you are in the trope. Even when the dialed-up register
allows energy, three-beat repetition is the universal tell —
verified by absence in every studied source.

### Setup-payoff aphorisms

```
❌  You wanted X. What you got was Y.
❌  X is what you reach for when Y stops working.
❌  The dark arts are gone.
❌  Use any of it. Use none of it.
```

The "I'm being clever" pattern. None of the studied source voices
do this. Lines like these feel like launch-keynote applause cues.

### Marketing intensifiers (the "modern web" lexicon)

Banned words and phrases:

- `powerful`, `blazing`, `lightning fast`, `modern`, `elegant`,
  `beautiful`
- `simple`, `easy`, `intuitive`, `seamless`, `delightful`
- `out of the box`, `it just works`, `battle-tested`,
  `production-ready`
- `first-class`, `world-class`, `industry-leading`
- `unlock`, `supercharge`, `superpowers`
- `dive in`, `get started in seconds`, `up and running`
- `welcome to`
- `thrilled`, `delighted`, `blown away`, `game-changer`,
  `revolutionary`, `next-generation`, `cutting-edge`

A sentence using any of these is almost always a sentence saying
nothing. Replace with a specific claim or delete. Even in the
dialed-up register: at most ONE superlative on the page, used in the
lede, then back to plain language.

### Business / finance / sales jargon

Words and phrases that sound like a deck pitch, a board update, or a
sales-engineering slide. Senior engineers don't use these and they
read instantly as Voice From The Wrong Department.

Banned:

- `carve-out`, `table stakes`, `moat`, `value prop`, `value add`
- `unlock value`, `leverage` (as a verb), `bandwidth` (as a metaphor)
- `land and expand`, `north star`, `north-star metric`, `OKR`,
  `deliverable`, `action item`
- `low-hanging fruit`, `race to the bottom`, `blue ocean`,
  `synergy`, `alignment`, `stakeholder`
- `hat tip`, `give a shoutout`, `circle back`, `double-click on`
- `enterprise-grade`, `SaaS-grade`, `mission-critical`
- `at scale` as a hand-wave (use specific scale: "at 100k sprites,"
  not "at scale")

These trip the LLM-default trap because they sound like "marketing
copy" — but the studied corpus avoids them entirely. A claim that
needs business jargon to sound important isn't an important claim.

```
❌  uikit is purpose-built for that. That's the only carve-out.
✅  uikit is purpose-built for that. Flatland isn't.

❌  Composability is table stakes for our value prop.
✅  Each package works in any three.js project, with or without
    Flatland.

❌  We're focused on shipping at scale.
✅  three-flatland holds 60fps with 20K sprites in the batch.
```

### Pejorative metaphors for the prior thing

```
❌  No more boilerplate.
❌  Cuts the ceremony.
❌  Goodbye to the dark arts.
❌  No more magic.
```

Tired and condescending. If the old way was bad, name what was bad
about it specifically (e.g., "two render loops competing for the
frame," not "the dark arts").

### "We did X so you don't have to"

```
❌  We engineered X so you can focus on Y.
❌  We sweated the details so you don't have to.
```

Self-congratulatory. Show the result; don't narrate the labor. The
work is its own argument.

### Excessive "your" possessives in problem framing

```
❌  Your scene. Your batch. Your shader. Your perf.
```

Once or twice is fine. Five times in a paragraph is LLM rhythm.

### Em-dash overuse

Em-dashes are for parenthetical asides. Use sparingly — one per
paragraph at most. Two if the paragraph is long. Multiple consecutive
em-dashed clauses read as Opus.

**Zero em-dashes above the fold.** Hero subtagline, H1/H2 headings,
opening sentence of a launch post, hero callout cards — these
positions are where readers pattern-match against LLM defaults
hardest. One em-dash in the hero burns the credibility budget for
the rest of the page. The em-dash is THE apex AI tell; in the most
visible slot it's the most identifiable LLM signature. Use periods,
commas, colons, or sentence restructure for high-prominence copy.

```
❌  2D primitives for three.js or react-three-fiber — instanced
    batching, composable TSL effects.

✅  2D primitives for three.js or react-three-fiber. Instanced
    batching, composable TSL effects.

❌  three-flatland is here — built for WebGPU, ready for
    react-three-fiber.

✅  three-flatland is here. Built for WebGPU, ready for
    react-three-fiber.
```

### Cute closing lines

```
❌  Now you're shipping.
❌  Welcome to 2D done right.
❌  And that's three-flatland.
❌  Build something.
```

End on information, not flourish. The dialed-up register allows ONE
closer move per post (under-promise, team thanks, or off-cuff aside);
beyond that, just stop on the last technical sentence.

### What stays banned EVEN in the dialed-up register

- Three-beat slogan headlines (every studied launch post avoids them)
- Stacked superlatives ("powerful, scalable, enterprise-ready")
- "Get started in 30 seconds" speed brags
- Customer-quote testimonials embedded as social proof
- "Join us on this journey" / "Be part of the future"
- More than one CTA per page
- Trash-talk of named competitors
- Emoji as headline decoration
- Hand-on-heart "we're so proud" lines
- "Powered by AI" / "AI-driven" buzzword stacks

## Techniques worth stealing

These ten patterns appear across the studied corpus. Use them by
name in your drafting checklist (later in this document).

### 1. Mechanism fused with the definition

Opening sentence names the thing AND shows how it works in the same
breath. The "why this matters" never appears as a standalone
sentence; it's implicit in the how.

### 2. Lead with the pain, not the product

Open a section by naming the failure mode the reader has hit before
introducing what your library does about it. They recognize
themselves before you've made any claim.

### 3. Numbers and units replace adjectives

Where you'd reach for "powerful" or "fast," reach for the actual
number first.

```
✅  ~1 MB of WASM (less than half CanvasKit's size)
✅  20K sprites at 60fps
✅  16k × 16k virtual shadow map
✅  Shared-value updates land in 36ms on a Moto G8 Plus

❌  Powerful sprite batching
❌  Blazing-fast WebGL renderer
❌  Industry-leading geometry pipeline
```

The good versions are also more compelling to a technical reader,
not less.

**Inverse rule: capabilities replace numbers when the capability IS
the differentiator.** A binary capability claim ("they don't ship X")
lands harder than a gradient comparison ("we measure X% better at
Y") when both are true at once. Numbers compete on a slope;
capabilities compete on a yes/no. If the alternative *can't do the
thing*, lead with that — the size/speed delta is supporting prose,
not the headline.

```
✅  brings Skia to Three.js — with a native WebGPU backend that
    CanvasKit doesn't ship
❌  857 KB WebGPU build (less than half of CanvasKit's 2.2 MB)

✅  GPU-rendered text with real dynamic kerning, instead of
    bitmap atlas sampling
❌  18× more glyphs per draw vs SDF atlases
```

Both bad examples cite a real number; the better versions lead with
the binary differentiator and let the number live in supporting
prose, or drop it entirely if the capability claim is sufficient.
The trap: when you have a flashy stat AND a stronger qualitative
claim, the stat seduces. Resist it.

### 4. Comparative claim without naming the competitor

On landing-page prose, pitch against a category, not a brand. The
reader supplies the brand mentally; you stay clean.

Save direct competitor names for dedicated comparison pages, where
the integrity move is a disclaimer ("strives to be as accurate and
unbiased as possible — suggest changes via the Edit on GitHub link")
plus a sortable table that includes your own limitations.

### 5. The flex by structure, not by adjective

The most memorable architectural claims happen because of sentence
shape, not because of intensifiers. The Q&A pattern is the strongest
version: name the obvious skeptical question, give a one-word answer,
explain in two short sentences. Use sparingly — once or twice per
landing page.

### 6. Honest about limits

A "Limitations" section, a "What this doesn't support" line, or a
"When not to" card builds more trust than any benefit list.
Engineering audiences believe the rest of the page after the page
has admitted one thing.

### 7. Present-tense passive for mechanism

When describing how something works, use plain present tense.
Passive voice is fine — it puts the system on stage, not your team.

```
✅  Clusters are swapped on the fly at varying levels of detail.
✅  Per-sprite effects ride on a shared material.

❌  Our system intelligently picks the right cluster.
❌  We've engineered a sophisticated effect-batching pipeline.
```

You is for what the reader does. We is for what we recommend. The
system itself doesn't need a personality.

### 8. The metaphor that pays off as a memory aid

A concept-introducing metaphor earns its place when it maps 1:1 onto
a behavior the reader will later debug against. Avoid metaphors that
are decorative. Avoid metaphors at section closers; they belong at
first definition.

### 9. First-person plural earns its place

"We" is rationed and surface-gated. See the **First-person rule by
surface** section above for the full rule. Quick version:

**On reference docs and concept pages**, three uses earn their keep:

- **Recommendation** — "We recommend solid state drives for runtime
  storage."
- **Roadmap commitment** — "We will expand its capabilities as the
  feature matures."
- **Caution** — "We do not recommend shipping projects with
  Experimental features."

**On authored surfaces (blog posts, release notes, retrospectives)**,
"we" can also be load-bearing for team visibility: "we built," "we
shipped," "we measured."

**On landing pages, feature pages, and SEO-load-bearing copy**, "we"
does not appear. The system goes on the stage; the prose names the
mechanism. The same applies to first-person singular — reserve "I"
for retrospectives or maintainer-byline posts, never for landing
copy.

### 10. Honest about scope and shipping state

If something is shipped, say so. If something is in flight, say so.

```
✅  shipped:        plain present-tense claim
✅  in development: "in development," "in flight"

❌  "coming soon"
❌  "planned" / "roadmap"
❌  "we're working hard on…"
```

Hand-wave language signals to skeptics that the team isn't sure
either.

## Examples from the source voices

The verbatim corpus — calm-register and dialed-up-register excerpts from the
studied voices, each analyzed for the technique it demonstrates — lives in
`voice-corpus.md`. Read it before drafting; study the moves and select, don't
vibe-match.

## Graphics, games, and rendering features

three-flatland sits at a specific intersection — graphics library,
game-adjacent, perf-sensitive. The audience reads best-in-class
real-time rendering engine docs and watches industry technical
conference talks. The voice that works for them differs from the
voice that sells a UI component library.

When introducing a graphics or rendering feature, follow the shape
the strongest pages in the field follow:

1. **Sentence one names the thing and its scope** — often using the
   word "system" and locating it in a default ("X is the default Y
   for Z"). Anchored in the global-illumination and virtualized-
   geometry definition examples above.
2. **Sentence two is the mechanism in one breath** — what it does at
   a technical level, not what it lets you do. Anchored in the
   virtualized-geometry mechanism example above.
3. **Specific capacities and resolutions before any benchmark.**
   "Infinite bounces." "Millimeters to kilometers." "16k × 16k."
   "20K sprites at 60fps." Numbers are the proof — anchored in
   technique #3.
4. **Comparative claims are qualitative**, citing the prior approach
   by category, not by competitor: "conventional shadow maps,"
   "traditional draw calls," "screen-space approximations."
5. **A "Limitations" section is mandatory.** Non-negotiable. The
   page that lists what the feature doesn't support is the page
   that gets believed — anchored in the virtualized-geometry
   earned-superlative example above.

What this register avoids:

- Aspirational second-person copy ("imagine the worlds you'll
  build") — graphics people want to know what it does today.
- Comparative benchmarks against named competitors in the body
  ("10× faster than X") — feels cheap. Cite capacities instead.
- Adjective stacks for technical features ("a powerful, flexible,
  real-time global illumination system") — replace adjectives with
  scope nouns ("fully dynamic," "real-time," "GPU-driven").
- Aspirational stat counters ("0,000,000+ developers") on the
  homepage — don't lie with placeholders or invent metrics.
- **Draw-call counting as the headline metric.** WebGL-era
  shorthand; reads as dated to anyone who's worked in WebGPU,
  Vulkan, or modern engines. Modern graphics performance is a
  pipeline story: CPU-side batch archetypes, data packing into
  compact GPU buffers, instanced draws, branch-pruned shaders,
  shared materials avoiding shader rebuilds. Name the architectural
  choices that compose into perf — "ECS-driven batching,"
  "branch-pruned uber-shader," "packed GPU buffers" — not the
  one-number summary. "1 draw call" is a consequence, not a claim.

When you can flex: naming a research-grade technique. Use it without
apology, then explain the implementation. Example pattern (anchored
in the virtualized-geometry mechanism move):

> A port of the Slug glyph-rendering algorithm to TSL — fully
> shader-driven, accurate at any scale, with real dynamic kerning
> instead of bitmap atlas sampling.

This works because (a) Slug is a known thing, (b) the explanation
that follows the em-dash IS the mechanism, and (c) the comparative
"instead of bitmap atlas sampling" tells the reader what to mentally
contrast against. No competitor named, no superlative used.

## Headlines

Sentence case. No periods unless the headline is genuinely multiple
sentences (in which case reconsider). Prefer noun phrases or full
descriptive claims that name the topic. Use the wording a developer
would type into search.

Three patterns work, in priority order:

1. **Gerund phrase** — "Building large worlds with partitioned
   streaming," "Manipulating the DOM with refs." Naming an action.
2. **Noun phrase as topic** — "Goals of virtual shadow maps," "When
   not to reach for Flatland." Naming the subject.
3. **Full descriptive claim** — "Built into three.js, not on top of
   it," "Type-safe routing for React and Solid applications." A
   claim stated flat.

```
✅  Built into three.js, not on top of it
✅  Sprite batches that survive your effects
✅  When not to reach for Flatland
✅  Goals of virtual shadow maps

❌  One renderer. One reconciler.        — slogan-shape three-beat
❌  Override the node, not the library.  — clever inversion
❌  Why Flatland?                        — question-shaped, search-weak
❌  Built. Better. Faster.               — three-beat
```

Slogan-shape headlines are punchy in isolation but stack into a wall
of slogans when there are 3-5 of them on a section. Good headlines
scan as a table of contents and double as queries.

## Emphasis discipline (bold and color)

Bold is a load-bearing visual signal — when every other phrase is
bolded, none of them are emphasized. Most ValueProps should have
**zero or one** bolded phrase. A long ValueProp with two distinct
claims might earn two. Three or more is the trope.

**Bold subject-value pairs, never bare values or stat blobs.** A
bolded "857 KB" or "10K" or "857 KB brotli on WebGPU" without an
adjacent subject noun reads as a stat thrown at the reader with no
anchor. The bolded text must be self-contained meaning when read in
isolation.

```
✅  an **857 KB WebGPU build** (brotli, less than half of CanvasKit's 2.2 MB)
✅  **~1 MB of WASM** (less than half CanvasKit's size)
✅  **20K sprites at 60fps**

❌  **857 KB brotli on WebGPU** vs CanvasKit's 2.2 MB
❌  is **857 KB** vs CanvasKit's 2.2 MB
❌  hits **60fps** under load
```

The bad versions all bold a metric or modifier without naming what
it's a metric *of*. The good versions bold a (subject + value) pair
that makes sense when scanned alone.

What to bold (when you bold at all):
- The most load-bearing **subject + value pair** in the paragraph
  (e.g., "**857 KB WebGPU build**", "**20K sprites at 60fps**")
- A name the reader is supposed to remember from this section

What NOT to bold:
- A bare numeric value with no subject noun adjacent
- A metric whose subject is implied or several words away
- Every brand mention
- Every gem-palette color name
- Modifiers ("**fully** shader-driven", "**real** dynamic kerning") —
  bolding a modifier is the trope
- Generic marketing words ("**simple**", "**fast**", "**composable**")

Same logic for any color emphasis (gem accent text, link colors,
callout backgrounds): emphasis only stands out when most of the text
doesn't have it.

## Length

Per ValueProp / section card: **2 paragraphs maximum, 45-110 words
total.** If you can't say it in that, the claim is too unfocused or
covers two topics that should be split. If you can say it in less,
do.

Per blog post: no fixed limit, but the marketing-register
calibration rule (1 lede + 1 closer in dialed-up, body in calm)
constrains it naturally.

## SEO — calibrated, not stuffed

The strongest dev-docs sites all hit SEO without sounding like
they're trying to. Five rules:

1. **Backtick code identifiers in prose.** Search engines weight
   `<code>` content. `Object3D`, `Sprite2D`, `react-three-fiber`,
   `WebGPU`, `@three-flatland/skia` should all be in code formatting
   when they appear inline.
2. **Repeat technical nouns; vary sentence constructions and
   colorful verb phrases.** A page about state can say "state"
   twenty times — SEO weights the technical term, and forcing
   synonyms ("the data," "the value," "the stored bit") reads like
   the writer wasn't sure which noun mattered. But colorful verb
   phrases and catch-constructions ("X rides the same Y," "X cuts
   through Y," "no more Z," "X out of the box") MUST vary across
   the page. Repeated framings flag the writing as machine-generated
   and dilute the technical terms by drowning them in pattern noise.
   Vary the verb, vary the metaphor, vary the sentence shape; never
   vary the noun. The test: search the draft for any 3+ word phrase
   that appears more than once. If it appears twice and isn't a
   technical noun phrase (`Object3D`, `react-three-fiber`,
   `WebGPU + WebGL`), rewrite one of them.
3. **Headings are search targets.** Sentence-case full descriptive
   phrases double as the queries developers actually type. "Built
   into three.js, not on top of it" is a heading and a search hit.
   Question-shaped headings ("Why X?") underperform on both.
4. **Use canonical project names with their canonical casing.**
   `react-three-fiber`, not "R3F" in prose. `WebGPU`, not "WGPU."
   `three.js` lowercase. `Object3D` PascalCase. Match the upstream.
5. **Outbound links stay minimal in marketing prose.** Naming a peer
   library in prose is fine; linking to its homepage from your
   landing page is link-equity bleed. Save outbound links for docs
   pages. Internal cross-linking, on the other hand, can be dense —
   link concept nouns to their dedicated pages aggressively.

## Validation rules (mandatory before shipping copy)

Every claim in marketing copy must be verifiable in the repo or in a
linked PR.

1. **Look up the package.** If you're writing about
   `@three-flatland/X`, check `packages/X/package.json` and
   `packages/X/README.md`. If the package doesn't exist yet but is
   in flight, say "in development" or "in flight" and either link
   the PR or skip the link.
2. **Look up the algorithm.** If you reference an external technique
   (Slug, Forward+, Radiance Cascades, TSL, KTX2 Basis), confirm
   what it actually is and what its real benefit is. Don't paraphrase
   from memory; the trope is to say something vague that sounds
   technical.
3. **Look up the audience-facing claim.** If you say "X is faster
   than Y," there should be a benchmark in `/planning` or a PR
   comment that establishes the comparison. If not, drop the
   comparison.
4. **Look up trade-offs.** Every architecture has them. If you can't
   name one, you haven't read the code closely enough to write the
   copy. The "When not to reach for Flatland" section is the place
   these go; the rest of the page should still reflect that the
   trade-offs exist.
5. **When unclear, stop and research.** If you're about to use vague
   marketing language because you don't actually know how a feature
   works (e.g., "ships with SIMD on" instead of "Zig-compiled, ~1 MB
   WASM, half CanvasKit's size"), that's a signal to read the
   package README, look at the source, or ask. The vague version is
   always worse than the specific version, even when the specific
   version is denser.

6. **Preserve categorical scope from the source.** If the source
   says *"libraries that try to compose with three.js end up running
   two renderers,"* don't paraphrase to *"most libraries run two
   renderers alongside three.js."* The first is a conditional claim
   about composition; the second is a false universal. The most
   common version of this trap: turning a conditional pain ("when
   you do X, you hit Y") into a categorical pain ("everyone hits Y")
   because the categorical version sounds punchier. Punchier and
   wrong is worse than longer and right. Re-read the source clause
   by clause and check that every quantifier ("most," "all,"
   "always," "usually," "everyone") matches the source's actual
   scope.

7. **Preserve usefulness scope from the source.** If the source flags
   a feature as "useful in tooling but not at runtime" or "novel
   only in this specific configuration," landing-page copy must
   either reflect that scope or omit the feature. Don't promote a
   tooling-only thing as a runtime capability; don't promote a
   runtime thing as a build-time tool.

## Technical correctness over marketing simplification

When a feature has a real technical story, **tell the technical
story.** Don't garble a complex achievement into marketing slop
because you're worried readers can't follow. The audience for this
site is technical; they will follow.

Examples of garbling that this skill forbids:

```
❌  "Skia rebuilt for size and speed"
✅  "Zig-compiled WASM, ~1 MB (less than half CanvasKit's size),
     with a native WebGPU backend on Graphite/Dawn alongside WebGL"

❌  "Slug-style font rendering with TSL"
✅  "A port of the Slug glyph-rendering algorithm to TSL — fully
     shader-driven, more accurate than SDF atlases at any scale,
     with real dynamic kerning"

❌  "Smart batching that's blazing fast"
✅  "An ECS keeps batch archetypes optimal as effects come and go,
     and the uber-shader compiles away unused branches via TSL"
```

The bad versions all sound like marketing. The good versions read
like the engineer who built the thing wrote them — and they're more
compelling to a technical reader, not less.

### Flex vs dial-back: the calibration

Use technical specificity as a **mild flex** when the achievement is
the point — Skia compiled with Zig is a flex; the Slug port is a
flex; ECS-driven batch archetypes is a flex. Naming them clearly is
the right call.

**Dial it back** when the technical detail is plumbing the reader
doesn't need to evaluate the claim — internal allocator strategies,
specific optimization passes, the exact data structure inside a hot
loop. Those go in architecture docs, not the landing page.

Rule of thumb: if a technical detail changes the reader's mental
model of *what the library does*, it belongs. If it only changes
their model of *how the library is built internally*, save it for
the deeper docs.

## Audience-review workflow (mandatory for new marketing copy)

Single-draft self-authored marketing copy ships LLM defaults.
Multi-variant copy ranked by the target audience ships *intent*.
Before any marketing surface goes live, run this workflow. No
silent ships; no single-draft posts.

### Model enforcement: Opus orchestrates, Sonnet drafts and reviews

Opus and Sonnet have different strengths. This workflow assigns
each to the layer where it's strong:

- **Opus** — orchestration and code research. Opus excels at
  reading the codebase, validating claims against the actual
  implementation, drawing architectural conclusions about what the
  library does. Use Opus as the orchestrator (the parent agent
  invoking this skill) and as the model for any research subagents
  spawned to gather facts before drafting.
- **Sonnet** — drafting and audience review. Opus's defaults
  (technical-spec density, multi-clause hedge, over-comprehensive
  enumeration, jargon-stack reflex) are the same defaults the rest
  of this skill spends thousands of words trying to suppress.
  Sonnet writes flatter, more direct prose by default and stays
  aligned with the calm marketing register with less corrective
  effort.

**Hard rules — model assignment by role:**

| Role | Model | Required? |
|---|---|---|
| Orchestrator (parent) | Opus or Sonnet | No — both work |
| Research subagent (codebase, validation) | Opus preferred, Sonnet fine | No |
| **Variant generator (Step 1)** | **Sonnet** | **Yes — hard requirement** |
| **Audience-persona reviewer (Step 2)** | **Sonnet** | **Yes — hard requirement** |
| Synthesis + final response (Step 3-4) | Same as orchestrator | No |

Set `model: "sonnet"` on every Agent tool call for variant
generation and persona review. No exceptions. Opus-on-Opus review
converges on "technically thorough" verdicts and misses the
marketing tells the user actually cares about.

**Practical flow on an Opus parent:**

1. (Optional) Spawn Opus research subagent(s) to inventory the
   codebase, validate technical claims, gather the facts the copy
   needs to reflect.
2. Spawn a Sonnet variant-generation subagent in Step 1, briefed
   with the research findings.
3. Spawn three Sonnet persona-reviewer subagents in parallel in
   Step 2.
4. Synthesize the reviews yourself (orchestrator) and surface the
   final copy.

Do not silently delegate the entire workflow to a Sonnet subagent
— Opus is doing real work as the orchestrator and the researcher,
and the user benefits from that work happening at the parent
level. Just route the *writing and review* steps to Sonnet.

### Scope

**Applies to:**
- Any new or rewritten ValueProp, FeatureCard, hero section, or
  stats banner
- Any rewrite that changes more than ~50% of an existing section
- README intros, blog launch posts, release-note summaries
- Page meta (title, description, OG copy) when those are
  reader-facing

**Does NOT apply to:**
- Single-sentence edits or word swaps
- Typo fixes
- Stat value updates (numeric corrections to already-shipped stats)
- Internal code comments, commit messages, API reference text

When in doubt, run the workflow. The cost is bounded; the cost of
shipping LLM defaults is not.

### Step 1 — Generate at least three STRUCTURALLY DIFFERENT variants

Three rephrasings of the same draft are not three variants — they
are one draft with three coats of paint. Genuine variants make
**different architectural choices** for the prose:

- **Different lead-in** — pain-first vs mechanism-first vs
  definition+scope vs comparative-without-naming vs sympathetic-
  mutter (dialed-up only).
- **Different technique mix** — pick a different 2-3 from the
  10-technique list per variant; don't reuse the same combo.
- **Different emphasis position** — different bolded subject-value
  pair (or no bold at all in some variants).
- **Different length** — terse (45-60 words) vs full (80-110 words)
  vs single-sentence punch.

If the three variants share the same banned-pattern violation, the
prompt is leading you toward a trope. Step back, re-read the brief,
and try again — don't proceed to Step 2 with a polluted variant
set.

Apply the **Drafting checklist** (below) to EACH variant before
submitting for review. Variants that don't pass the checklist on
their own get discarded, not reviewed.

### Step 2 — Dispatch audience-persona subagents in parallel

For each variant set, spawn **three Agent subagents in a single
message with parallel tool calls** — one per target persona from
"The reader" section above. Persona prompts must brief the agent
on:
- Who they are (role, what they've shipped, what they care about)
- What they bounce off (jargon walls, marketing tropes, surface
  flattery)
- What earns their attention (specific architectural claims,
  mechanism descriptions, honest scope)

Each persona reviews **all variants** and reports:
- **Ranking** from strongest to weakest, with a one-line rationale
  per position
- **What landed** — name specific phrases or beats that worked
- **What bounced** — name specific phrases or beats that felt like
  noise, jargon, trope, or marketing-deck slop
- **Trope flags** — explicit calls of any banned patterns from this
  skill (three-beats, business jargon, contextless stats, first-
  person on landing copy, draw-call shorthand, repeated catch-
  phrases, etc.)

Cap each persona response at ~250 words so the synthesis stays
manageable.

### Step 3 — Synthesize and decide

After all three reviews come back, classify the result:

- **Clear winner** — consistent #1 across all three personas. Select
  it. Apply minor edits if reviews surfaced small fixes (a single
  word, a punctuation tweak).
- **Split ranking** — different personas pick different winners.
  Build a synthesized v4 by taking the strongest beats from the
  top-ranked variants per persona. Re-run Step 2 on v4 alongside
  the previous top-2 if v4 is substantially different from both.
- **Universal critique** — all variants got critical feedback on
  the same dimension. Return to Step 1 with that feedback in hand.
  Don't ship a piece the personas all disliked even if one of them
  ranked it least-bad.

### Step 4 — Surface the work in your response

When you reply to the user with the final copy, include:
- A 1-2 line summary per persona of their top-ranked feedback
- The decision rationale (why this draft won, or what synthesis
  shaped v4)
- Any trade-offs the personas surfaced that the user might want to
  weigh in on (e.g., "Persona A flagged the closer as flat;
  Persona B liked it. Kept it because…")

The user is hiring you to ship copy that survives audience contact.
The audience-review trail is the receipt that you did the work.

## Drafting checklist (per variant)

Apply this to EACH variant before submitting it to audience review:

1. **Which register does this surface need?**
   - Docs page / API reference / sub-package README → calm only.
   - Landing-page hero / blog launch / release notes → calm body
     plus rationed dialed-up moves per the calibration rule.

2. **Pick 2-3 techniques from the list above** that fit this
   section's content. Don't try to use all ten.

3. **For each claim, is the source verified?** Walk the validation
   rules. If you can't point to the package / PR / doc that backs a
   claim, drop it or research it.

4. **Open by leading with the pain, the mechanism, the comparison
   without naming, or the definition+scope** — not by selling.

5. **Close on the last fact.** If your final sentence is a closer
   line, delete it. (Exception: one closer move is allowed per
   blog post in dialed-up register.)

6. **Audit emphasis.** Count bolded phrases. 0-1 per ValueProp; 2 if
   the section earns it. Strip any bold that's on a modifier or a
   marketing word.

7. **Audit em-dashes.** One per paragraph max. If you have multiple
   em-dashed asides in a row, restructure.

8. **Read the headline against the headline rules.** Sentence case,
   noun phrase or descriptive claim, not slogan-shape, not
   question-shape, not three-beat.

9. **Walk the banned-patterns list.** Search your draft for the
   banned words; replace each instance with a specific claim or
   delete the sentence.

10. **Audit first-person.** Search the draft for "I" and "we." If
    the surface is a landing page, feature page, README, or
    reference doc, every hit needs to go (rewrite as system-on-
    stage). If the surface is a blog post or release note with a
    byline, "we" is fine for team-visibility moves and "I" is fine
    for personal-stakes story — see the First-person rule by
    surface section.

11. **Check word count.** Per ValueProp: 45-110 words, 2 paragraphs
    max.

If anything fails this checklist, fix it before shipping — even if
the rest of the prose is fine. The patterns this skill forbids are
recognizable to the studied audience; one slip cancels two paragraphs
of restraint.

## When to use this skill

- Drafting any landing-page copy (`docs/src/content/docs/index.mdx`)
- Drafting any docs page intro
- Writing a release note or changelog summary intended for users
  (not just the maintainer log)
- Writing a blog post for the site
- Writing the project README

If you're writing internal comments, technical docs explaining APIs,
or commit messages, use the project's normal voice — this skill is
for the marketing/landing surface specifically.

**The Audience-review workflow is mandatory** for any of the above
when the change is more than a single-sentence tweak. Single drafts
that skip audience review ship the LLM defaults the rest of this
skill is built to prevent. If you find yourself writing a single
draft and shipping it, stop — go back to Step 1 of the workflow,
generate three structurally different variants, and dispatch the
three persona reviewers. The skill catches *what's wrong with one
draft*; the workflow catches *which draft is the right shape to ship*.
