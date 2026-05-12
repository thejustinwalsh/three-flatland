---
name: marketing-voice
description: Use when writing landing-page copy, blog posts, README intros, release notes, or any user-facing prose for three-flatland. Captures a voice grounded in studied developer-tooling and rendering-feature documentation, with strict anti-AI-trope rules. Required reading before drafting any marketing copy in this repo.
---

# three-flatland marketing voice

This skill is the voice and prose guide for any user-facing copy in
this repo. It exists because LLMs reach for very recognizable defaults
when prompted to "write marketing copy," and those defaults sound
nothing like the developer-tooling voice three-flatland's audience
reads every day.

The patterns and verbatim examples in this skill are extracted from a
focused study of five source voices: official React documentation
(react.dev), the react-three-fiber docs, the TanStack docs and blog,
the Expo docs and blog, and Epic Games' Unreal Engine rendering-feature
documentation and launch posts. The skill teaches the techniques those
voices share; the examples are quoted directly from them.

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
emoji, no "today we're…" timestamps, no celebratory openers.

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
✅  Reanimated SV hits 36ms on a Moto G8 Plus

❌  Powerful sprite batching
❌  Blazing-fast WebGL renderer
❌  Industry-leading geometry pipeline
```

The good versions are also more compelling to a technical reader,
not less.

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

"We" is rationed. Three places it earns its keep:

- **Recommendation** — "We recommend solid state drives for runtime
  storage."
- **Roadmap commitment** — "We will expand its capabilities as the
  feature matures."
- **Caution** — "We do not recommend shipping projects with
  Experimental features."

In the dialed-up register, "we" can also be load-bearing for
team-visibility: "we built," "we shipped," "we measured."

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

The examples below are **verbatim excerpts** from the studied corpus,
attributed and analyzed for the technique they demonstrate. These are
the ground-truth examples — when you draft new copy for
three-flatland, your job is to identify which techniques fit the
section you're writing and apply them in our own words. Don't
vibe-match this skill; study the moves and select.

### Calm register — verbatim excerpts

#### Concept introduction by italicized noun mid-sentence
> "When you build a user interface with React, you will first break
> it apart into pieces called *components*."
>
> — *react.dev/learn/thinking-in-react*

The defined noun (italicized) is the closing word of the clause; the
surrounding sentence shows the concept in action. Definition,
example, and naming collapse into one sentence.

#### Flat constraint, no softeners
> "You can't call it inside loops or conditions."
>
> — *react.dev/reference/react/useState*

No "Note that…", no "It's important to remember…", no "Generally
speaking…" — just the rule. Treats the reader as someone who can
take direction.

#### Q&A flex with a one-word answer
> "**Does it have limitations?** **None.** Everything that works in
> Threejs will work here without exception.
>
> **Is it slower than plain Threejs?** **No.** There is no overhead.
> Components render outside of React. It outperforms Threejs in
> scale due to React's scheduling abilities."
>
> — *r3f.docs.pmnd.rs/getting-started/introduction*

Self-asks the obvious skeptical question, gives a one-word answer in
bold, then explains in two short sentences. Confidence by structure,
not by adjective. Use sparingly — once or twice on a page maximum.
Demonstrates technique #5.

#### Mechanism fused with definition
> "It merely expresses Threejs in JSX, `<mesh />` dynamically turns
> into `new THREE.Mesh()`."
>
> — *r3f.docs.pmnd.rs/getting-started/introduction*

Architectural pitch in 13 words. "Merely" is a humility move that's
actually a flex — it implies the rest is mechanical. Demonstrates
technique #1.

#### Sensory framing before naming an API
> "This is what generally drains batteries the most and makes fans
> spin up. But if the moving parts in your scene are allowed to come
> to rest, then it would be wasteful to keep rendering."
>
> — *r3f.docs.pmnd.rs/advanced/scaling-performance*

The reader feels the consequence (battery drain, fan noise) before
any prop or API is mentioned. Sensory anchoring earns the technical
explanation that follows.

#### Comparative claim without naming the competitor
> "Most traditional state management libraries are great at working
> with client state, but not so great at working with async or server
> state."
>
> — *tanstack.com/query/latest/docs/framework/react/overview*

Pitches against a category, not a brand. The reader supplies the
brand mentally. Demonstrates technique #4.

#### When you DO name competitors — the integrity move
> "This comparison table strives to be as accurate and as unbiased
> as possible. If you use any of these libraries and feel the
> information could be improved, feel free to suggest changes (with
> notes or evidence of claims) using the 'Edit this page on Github'
> link at the bottom of this page."
>
> — *tanstack.com/query/latest/docs/framework/react/comparison*

The disclaimer plus an "edit on GitHub" invitation earns the right
to compare. They also explicitly include themselves in shared
limitations on the same page.

#### Concrete physical metaphor for a platform constraint
> "Expo Go is a pre-built native app that works like a playground —
> it can't be changed after you install it."
>
> — *docs.expo.dev/develop/development-builds/introduction*

Maps an abstract restriction (immutable native runtime) onto a
concrete object (a playground). The metaphor pays off the moment
the reader hits a use case Expo Go can't serve. Demonstrates
technique #8.

#### Verb-led service one-liner
> "EAS Build — Compile and sign Android/iOS apps with custom native
> code in the cloud."
>
> — *docs.expo.dev/eas*

Outcome verb first ("Compile and sign"), no adjectives. The verb is
the value proposition. Each EAS service has the same shape: name,
em-dash, verb, object, where.

#### Definition + scope + default in one sentence
> "Lumen is Unreal Engine's fully dynamic global illumination and
> reflections system that is designed for next-generation consoles,
> and it is the default global illumination and reflections system."
>
> — *dev.epicgames.com/.../lumen-global-illumination-and-reflections*

One sentence does three jobs: names the thing, says what it is,
declares it the default. No adjectives beyond "fully dynamic" (which
is a scope claim, not a marketing word).

#### Mechanism in the second sentence
> "Nanite is Unreal Engine's virtualized geometry system which uses
> an internal mesh format and rendering technology to render pixel
> scale detail and high object counts. It intelligently does work on
> only the detail that is visible on-screen and no more."
>
> — *dev.epicgames.com/.../nanite-virtualized-geometry*

First sentence: noun + scope. Second sentence: mechanism in one
breath. The "why this matters" is implicit in the how. Demonstrates
technique #1.

#### Earned superlative immediately followed by hedge
> "Although the advantages can be game-changing, practical limits
> still remain. For example, instance counts, triangles per mesh,
> material complexity, output resolution, and performance should be
> carefully measured for any combination of content and hardware."
>
> — *dev.epicgames.com/.../nanite-virtualized-geometry*

Allow yourself one superlative on the page. Immediately follow it
with a list of things the reader has to measure. The hedge earns
the brag. Demonstrates technique #6.

#### Lead with the pain, not the product
> "Building large maps used to require developers to manually divide
> maps into sublevels, then use the Level streaming system to load
> and unload them as the player traversed the landscape. This method
> often created issues sharing files between multiple users, and
> viewing the whole world in context became a difficult task."
>
> — *dev.epicgames.com/.../world-partition*

Two sentences of "here's how it sucked" before the feature is even
named. The reader recognizes themselves before any claim is made.
Demonstrates technique #2.

### Dialed-up register — verbatim excerpts

#### The release IS the headline
> "React v19 is now available on npm!"
>
> — *react.dev/blog/2024/12/05/react-19*

The launch announcement, the headline, and the first sentence
collapse into one declarative line with a single exclamation. Same
pattern across every React minor release. The hype move is *refusing
to do a hype opener*.

#### Problem-first hook with one-word resolution
> "Ever tried using `<shaderMaterial uniforms={{ time: { value: time } }} />`
> and ran into immediate issues with desync? No more."
>
> — *github.com/pmndrs/react-three-fiber/releases (v9.6.0)*

Code-shaped problem statement, then "No more." as the punchline.
Same structural move as the Q&A flex (#5), used in the marketing
register.

#### Sympathetic-mutter opener
> "If you've ever muttered 'why is this still so hard in 2025?',
> same."
>
> — *tanstack.com/blog/tanstack-db-0.1*

A one-line scene of the reader's frustrated inner voice, in actual
quotes. Empathy enacted, not described. Almost no other framework
launch opens like this.

#### Numbers do the bragging
> "0.7 ms to update one row in a sorted 100k collection on an M1 Pro."
>
> — *tanstack.com/blog/tanstack-db-0.1*

Specific timing, specific dataset, specific hardware. No "blazing
fast." The number plus the test conditions is the brag. Demonstrates
technique #3.

#### Mission sentence with single allowed superlative, then mechanism
> "Our goal at Expo is to create the best possible way to make apps.
> We are doing that through tooling that leverages the best of native
> and the most cutting-edge web patterns."
>
> — *expo.dev/blog/introducing-expo-atlas*

One marketing sentence as throat-clearing ("best possible"), then
direct into mechanism. The superlative is allowed because there's
exactly one and the rest of the post is technical.

#### Hype acknowledged with self-aware glyph
> "Expo Router v6 is here, and it's all about capturing that iconic
> native feel. We're exposing complex native APIs through clever
> React-first abstractions that just work™."
>
> — *expo.dev/blog/expo-router-v6*

The trademark glyph on "just work™" winks at the cliché — they get
hype credit while signaling self-awareness. A specific, transferable
move for landing copy that wants energy without sounding like an ad.

#### Workflow-pain liberation as the pitch
> "There are no more polygon count budgets, polygon memory budgets,
> or draw count budgets; there is no need to bake details to normal
> maps or manually author LODs; and there is no loss in quality."
>
> — *Epic Games Nanite blog*

Lead with what the reader no longer has to do. Three "no more"s are
deliberately joined with semicolons into a single sentence rather
than three short sentences — same content as a three-beat slogan
but the prose shape stays grounded.

#### Position the new feature in your own internal lineage
> "Like Nanite did for triangles or Lumen for global illumination,
> MegaLights removes limitation in a whole new category: direct
> lighting and shadows."
>
> — *Wyeth Johnson, Epic Games (MegaLights launch)*

Each new feature canonizes the prior breakthroughs. Builds an
internal mythology where the reader learns to recognize "an X-class
breakthrough." Use carefully — requires that you have prior shipped
features the reader can mentally invoke.

#### Closer that under-promises
> "There will be bugs. There will be rough edges… We're not perfect.
> But we're honest."
>
> — *tanstack.com/blog/tanstack-ai-alpha-your-ai-your-way*

Marketing closer that admits the cost of shipping early.
Vulnerability is the flex. Lands harder than any "ready for
production" line.

#### First-person singular for personal stakes
> "Two years ago I went all in on TanStack. No consulting, no safety
> nets."
>
> — *tanstack.com/blog/tanstack-2-years*

Maintainer voice in marketing post. Terse sentences, no hedging,
admits cost. Use when there's a real personal-stakes story behind
the work — not for routine releases.

#### The off-cuff sign-off
> "Who know,s you could be the reason 👀. Happy building!"
>
> — *github.com/pmndrs/react-three-fiber/releases (v10 alpha)*

Typo left in. Eye-emoji wink. "Happy building" is a recurring
pmndrs sign-off. Personality through restraint plus a wink. Don't
imitate the signature directly; study the calibration: tiny
irregularity signals a human typed this.

## Graphics, games, and rendering features

three-flatland sits at a specific intersection — graphics library,
game-adjacent, perf-sensitive. The audience reads Epic's Unreal docs
and watches GDC talks. The voice that works for them differs from the
voice that sells a UI component library.

When introducing a graphics or rendering feature, follow the shape
the strongest pages in the field follow:

1. **Sentence one names the thing and its scope** — often using the
   word "system" and locating it in a default ("X is the default Y
   for Z"). Anchored in the Lumen and Nanite definition examples
   above.
2. **Sentence two is the mechanism in one breath** — what it does at
   a technical level, not what it lets you do. Anchored in the
   Nanite mechanism example above.
3. **Specific capacities and resolutions before any benchmark.**
   "Infinite bounces." "Millimeters to kilometers." "16k × 16k."
   "20K sprites at 60fps." Numbers are the proof — anchored in
   technique #3.
4. **Comparative claims are qualitative**, citing the prior approach
   by category, not by competitor: "conventional shadow maps,"
   "traditional draw calls," "screen-space approximations."
5. **A "Limitations" section is mandatory.** Non-negotiable. The
   page that lists what the feature doesn't support is the page
   that gets believed — anchored in the Nanite earned-superlative
   example above.

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

When you can flex: naming a research-grade technique. Use it without
apology, then explain the implementation. Example pattern (anchored
in the Nanite mechanism move):

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

1. **Gerund phrase** — "Building large worlds with World Partition,"
   "Manipulating the DOM with refs." Naming an action.
2. **Noun phrase as topic** — "Goals of Virtual Shadow Maps," "When
   not to reach for Flatland." Naming the subject.
3. **Full descriptive claim** — "Built into three.js, not on top of
   it," "Type-safe routing for React and Solid applications." A
   claim stated flat.

```
✅  Built into three.js, not on top of it
✅  Sprite batches that survive your effects
✅  When not to reach for Flatland
✅  Goals of Virtual Shadow Maps

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

What to bold (when you bold at all):
- The single most load-bearing technical noun in the paragraph
- A real numeric claim ("**~1 MB of WASM**") if it's the punchline
- A name the reader is supposed to remember from this section

What NOT to bold:
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
2. **Repeat keywords naturally; never reach for synonyms.** A page
   about state can say "state" twenty times. If your draft has gone
   to a thesaurus to vary the noun, the SEO and the prose both
   suffer.
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

## Drafting checklist

When you're about to write a section, walk through this:

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

10. **Check word count.** Per ValueProp: 45-110 words, 2 paragraphs
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
