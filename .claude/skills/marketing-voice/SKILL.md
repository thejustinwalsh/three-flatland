---
name: marketing-voice
description: Use when writing landing-page copy, blog posts, README intros, or any user-facing prose for three-flatland. Captures the voice of best in class docs and enforces strict anti-AI-trope rules. Required reading before drafting any marketing copy in this repo.
---

# three-flatland marketing voice

This skill is the voice and prose guide for any user-facing copy in this
repo — landing page sections, README content, blog posts, release notes,
docs intros. It exists because Opus has very recognizable defaults
when asked to "write marketing copy," and those defaults sound nothing
like the developer-tooling voice three-flatland's audience reads every
day.

## The voice in one sentence

**A senior engineer explaining a tool to another senior engineer.** No
sales pressure. No setup-payoff aphorisms. Direct claims grounded in
specifics. Examples integrated with prose. Honest about scope and
trade-offs. Closes thoughts on information, not flourish.

## The reader

Pick whichever applies on the page you're writing — most landing copy
serves all three at once:

- **Working three.js / R3F dev** — has shipped scenes; wants
  architectural fit; reads carefully when a section names something
  technical they care about
- **Game-curious web dev** — has shipped products in React/Next; intrigued
  by 2D games; bounces off jargon walls but appreciates real claims
- **Returning engineer** — has used three-flatland before; here for
  changelogs, examples, escape hatches; wants the answer fast

Treat all three like adults who know what `Object3D`, `Mesh`, `Atlas`,
`Draw call`, `Reconciler`, and `WebGL` mean. If a paragraph needs to
explain one of those words, the paragraph is in the wrong section of the
docs.

## Banned patterns (Opus's defaults — don't write these)

These are the patterns Opus reaches for when the prompt smells like
"marketing." They are the tell. Do not write them.

### Three-beat repetition for emphasis

```
❌  No second renderer. No bridge code. No dark arts.
❌  Three.js renders. R3F reconciles. Object3D is real.
❌  Composable. Performant. Ergonomic.
```

These read like advertising slogans. If you find yourself writing three
short clauses in a row separated by periods, you are in the trope.

### Setup-payoff aphorisms

```
❌  You wanted X. What you got was Y.
❌  X is what you reach for when Y stops working.
❌  The dark arts are gone.
❌  Use any of it. Use none of it.
❌  Pull what fits, leave what doesn't.
```

These are AI's "I'm being clever" pattern. They feel like lines from a
launch keynote. The voice we want is closer to a maintainer writing a
README.

### "X but Y" / "X and yet Y" balanced contrasts

```
❌  Fast but flexible.
❌  Powerful and approachable.
❌  Opinionated yet escape-hatched.
```

If both halves are praise, both halves are filler.

### Marketing intensifiers (the "modern web" lexicon)

Banned words and phrases:

- `powerful` `blazing` `lightning fast` `modern` `elegant` `beautiful`
- `simple` `easy` `intuitive` `seamless` `delightful`
- `out of the box` `it just works` `battle-tested` `production-ready`
- `first-class` `world-class`
- `unlock` `supercharge` `superpowers`
- `dive in` `get started in seconds` `up and running`
- `welcome to`

A sentence using any of these is almost always a sentence saying nothing.
Replace with a specific claim or delete.

### "Dark arts," "magic," "boilerplate," "ceremony"

Pejorative metaphors for whatever the new thing replaces. Tired and
condescending. If the old way was bad, name what was bad about it
specifically.

### Cute closing lines

```
❌  Now you're shipping.
❌  Welcome to 2D done right.
❌  And that's three-flatland.
❌  Build something.
```

End on information, not flourish.

### "We did X so you don't have to"

```
❌  We engineered X so you can focus on Y.
❌  We sweated the details on X so you don't have to.
```

Self-congratulatory. Show the result; don't narrate the labor.

### Excessive "your" possessives in problem framing

```
❌  Your scene. Your batch. Your shader. Your perf.
```

Once or twice is fine. Five times in a paragraph is AI rhythm.

### Em-dash overuse

Em-dashes are for parenthetical asides. Use sparingly — one per
paragraph at most. Two if the paragraph is long. Multiple consecutive
em-dashed clauses read as Opus.

## Techniques worth stealing

These patterns appear across the docs voices we'd want to be in the
lineage of — used differently by each but recognizable in all of them.

### 1. Mechanism fused with the definition

Opening sentence names the thing AND shows how it works in the same
breath. The "why this matters" never appears as a standalone sentence;
it's implicit in the how.

```
✅  three-flatland is a set of `Object3D` primitives. Sprites,
    tilemaps, particles, and effects mount into the scenegraph
    and react-three-fiber the same way `Mesh` does.
```

The reader infers the win from the architecture. You don't tell them.

### 2. Lead with the pain, not the product

Open a section by naming the failure mode the reader has hit before
introducing what your library does about it. They recognize themselves
before you've made any claim.

```
✅  Sprite batchers usually shatter the moment you touch one sprite.
    Add a glow, change a uniform, shift a z-index — and the batch
    tanks, or the effect forces a scene reflow.
```

This works because the reader supplies the trust. You're not asking
them to believe you have a solution; you're asking them to confirm
the problem is real. They will.

### 3. Numbers and units replace adjectives

Where you'd reach for "powerful" or "fast," reach for the actual
number first. Specificity is the brag.

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

```
✅  "Most 2D rendering libraries on the web run their own renderer
    alongside three.js."
✅  "Most traditional state management libraries are great at working
    with client state, but not so great at working with async or
    server state."
```

Save direct competitor names for dedicated comparison pages, where
the integrity move is a disclaimer ("strives to be as accurate and
unbiased as possible — suggest changes via the Edit on GitHub link")
plus a sortable table that includes your own limitations.

### 5. The flex by structure, not by adjective

The most memorable architectural claims happen because of sentence
shape, not because of intensifiers. The Q&A pattern is the strongest
version: name the obvious skeptical question, give a one-word answer,
explain in two short sentences.

```
✅  Does it run on WebGL? Yes. On WebGPU? Native, with compute passes
    and storage buffers when you want them.
```

Use this pattern sparingly — once or twice on a landing page. Use it
constantly and it becomes its own trope.

### 6. Honest about limits

A "Limitations" section, a "What this doesn't support" line, or a
"When not to" card builds more trust than any benefit list.
Engineering audiences believe the rest of the page after the page has
admitted one thing.

```
✅  "Although the advantages can be game-changing, practical limits
    still remain. Instance counts, triangles per mesh, material
    complexity, output resolution, and performance should be
    carefully measured for any combination of content and hardware."
```

Note the structure: superlative is allowed once and is immediately
followed by a list of things you have to measure. The hedge earns
the brag.

### 7. Present-tense passive for mechanism

When describing how something works, use plain present tense.
Passive voice is fine — it puts the system on stage, not your
team.

```
✅  Clusters are swapped on the fly at varying levels of detail
    based on the camera view.
✅  Per-sprite effects ride on a shared material; the uber-shader
    compiles away unused branches via TSL.

❌  Our system intelligently picks the right cluster for the moment.
❌  We've engineered a sophisticated effect-batching pipeline.
```

You is for what the reader does. We is for what we recommend. The
system itself doesn't need a personality.

### 8. The metaphor that pays off as a memory aid

A concept-introducing metaphor earns its place when it maps 1:1 onto
a behavior the reader will later debug against.

```
✅  "State is like a component's memory."
✅  "A ref is like a secret pocket of your component that React
    doesn't track."
✅  "Expo Go is a pre-built native app that works like a playground —
    it can't be changed after you install it."
```

Each of these pays off the moment the reader hits the corresponding
bug. Avoid metaphors that are decorative — rockets, journeys, races.
Avoid metaphors at section closers; they belong at first definition.

### 9. First-person plural earns its place

"We" is rationed. Used sparingly, it credits real engineering work
without sounding marketing. Three places it earns its keep:

```
✅  Recommendation:    "We recommend solid state drives for runtime storage."
✅  Roadmap commitment: "As Nanite continues to mature, we will expand
                       its capabilities and improve performance."
✅  Caution:           "We do not recommend shipping projects with
                       Experimental features."
```

Used constantly, it's the marketing-team-talking-about-the-team
signal that engineering audiences see through immediately.

### 10. Closure without ceremony

End a section on the last fact, not on a wrap-up. Tutorial pages can
end with a "Read X next" link prompt; reference and marketing prose
should just stop.

```
❌  Now you're shipping.
❌  Welcome to 2D done right.
❌  Use any of it. Use none of it.
❌  And that's the gist of it.

✅  (last technical sentence, period, end of section)
```

The instinct to close with a flourish is the trope. Resist it.

## Validation rules (mandatory before shipping copy)

Every claim in marketing copy must be verifiable in the repo or in a
linked PR. Before drafting:

1. **Look up the package**. If you're writing about `@three-flatland/X`,
   check `packages/X/package.json` and `packages/X/README.md`. If the
   package doesn't exist yet but is in flight, say "in development" and
   either link to the PR or skip the link.
2. **Look up the algorithm**. If you reference an external technique
   (Slug, Forward+, Radiance Cascades, TSL, KTX2 Basis), confirm what it
   actually is and what its real benefit is. Don't paraphrase from
   memory; the trope is to say something vague that sounds technical.
3. **Look up the audience-facing claim**. If you say "X is faster than
   Y," there should be a benchmark in `/planning` or a PR comment that
   establishes the comparison. If there isn't, drop the comparison.
4. **Look up trade-offs**. Every architecture has them. If you can't
   name one, you haven't read the code closely enough to write the copy.
   The "When not to reach for Flatland" section is the place these go;
   the rest of the page should still reflect that the trade-offs exist.
5. **When unclear, stop and research.** If you're about to use vague
   marketing language because you don't actually know how a feature
   works (e.g. "ships with SIMD on" instead of "Zig-compiled, ~1 MB
   WASM, half CanvasKit's size"), that's a signal to read the package
   README, look at the source, or ask. The vague version is always
   worse than the specific version, even when the specific version is
   denser.

## Technical correctness over marketing simplification

When a feature has a real technical story, **tell the technical story.**
Don't garble a complex achievement into marketing slop because you're
worried readers can't follow. The audience for this site is technical;
they will follow.

Examples of garbling that the skill forbids:

```
❌  "Skia rebuilt for size and speed"
✅  "Zig-compiled WASM, ~1 MB (less than half CanvasKit's size), with a
     native WebGPU backend on Graphite/Dawn alongside WebGL"

❌  "Slug-style font rendering with TSL"
✅  "A port of the Slug glyph-rendering algorithm to TSL — fully
     shader-driven, more accurate than SDF atlases at any scale, with
     real dynamic kerning"

❌  "Smart batching that's blazing fast"
✅  "An ECS keeps batch archetypes optimal as effects come and go, and
     the uber-shader compiles away unused branches via TSL"
```

The bad versions all sound like marketing. The good versions read like
the engineer who built the thing wrote them. The good versions are also
*more compelling* to a technical reader, not less.

### Flex vs dial-back: the calibration

You can use technical specificity as a **mild flex** in places where
the achievement is the point — Skia compiled with Zig is a flex; the
Slug port is a flex; ECS-driven batch archetypes is a flex. Naming
them clearly is the right call.

You should **dial it back** when the technical detail is plumbing the
reader doesn't need to evaluate the claim — internal allocator
strategies, specific optimization passes, the exact data structure
inside a hot loop. Those go in the architecture docs, not the landing
page.

Rule of thumb: if a technical detail changes the reader's mental model
of *what the library does*, it belongs. If it only changes their model
of *how the library is built internally*, save it for the deeper
docs.

## Emphasis discipline (bold and color)

**Bold sparingly.** Bold is a load-bearing visual signal — when every
other phrase is bolded, none of them are emphasized. Most ValueProps
should have **zero or one** bolded phrase. A long ValueProp with two
distinct claims might earn two bolds. Three or more is almost always
the trope.

What to bold (when you bold at all):

- The single most load-bearing technical noun in the paragraph
- A real numeric claim ("**~1 MB of WASM**") if it's the punchline
- A name the reader is supposed to remember from this section

What NOT to bold:

- Every brand mention
- Every gem-palette color name
- Phrases that are already adjectives or qualifiers ("**fully**
  shader-driven", "**real** dynamic kerning") — bolding the modifier is
  the trope
- Generic marketing words ("**simple**", "**fast**", "**composable**")

Same logic for any color emphasis (gem accent text, link colors, callout
backgrounds): emphasis only stands out when most of the text doesn't
have it.

## Headlines

Sentence case. No periods unless the headline is genuinely multiple
sentences (in which case reconsider). Prefer noun phrases or full
descriptive claims that name the topic of the section. Use the same
wording a developer would type into search.

Three patterns work, in this priority:

1. **Gerund phrase** — "Building large worlds with World Partition,"
   "Manipulating the DOM with refs." Naming an action.
2. **Noun phrase as topic** — "Goals of Virtual Shadow Maps," "When
   not to reach for Flatland." Naming the section's subject.
3. **Full descriptive claim** — "Built into three.js, not on top of it,"
   "Type-safe routing for React and Solid applications." A claim
   stated flat, scannable as a sentence.

```
✅  Built into three.js, not on top of it
✅  Sprite batches that survive your effects
✅  When not to reach for Flatland
✅  Goals of Virtual Shadow Maps

❌  One renderer. One reconciler.        — slogan-shape
❌  Override the node, not the library.  — clever inversion
❌  Why Flatland?                        — question-headings underperform on search
❌  Built. Better. Faster.               — three-beat
```

The bad examples are punchy in isolation but stack into a wall of
slogans when there are 3-5 of them on a section. Good headlines scan
as a table of contents and double as queries.

## Length

Per ValueProp / section card: **2 paragraphs maximum**, **45-110 words
total**. If you can't say it in that, the claim is too unfocused or
covers two topics that should be split. If you can say it in less, do.

## Examples from the source voices

The examples below are **verbatim excerpts from real docs and launch
posts** in the lineage of voices we want to be in. Each is attributed
and analyzed for the technique it demonstrates. These are the
ground-truth examples — when you draft new copy for three-flatland,
your job is to identify which techniques fit the section you're
writing and apply them in our own words. Don't vibe-match this skill;
study the moves and select.

### Docs / reference register

#### Concept introduction by italicized noun mid-sentence
> "When you build a user interface with React, you will first break
> it apart into pieces called *components*."
>
> — *react.dev/learn/thinking-in-react*

The defined noun (italicized) is the closing word of the clause; the
surrounding sentence shows the concept in action. Definition,
example, and naming collapse into one sentence.

#### Flat constraint (no softeners)
> "You can't call it inside loops or conditions."
>
> — *react.dev/reference/react/useState*

No "Note that…," no "It's important to remember…," no "Generally
speaking…" — just the rule. Treats the reader as someone who can
take direction.

#### Q&A flex with one-word answer
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

#### Mechanism fused with definition
> "It merely expresses Threejs in JSX, `<mesh />` dynamically turns
> into `new THREE.Mesh()`."
>
> — *r3f.docs.pmnd.rs/getting-started/introduction*

Architectural pitch in 13 words. "Merely" is a humility move that's
actually a flex — it implies the rest is mechanical.

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
brand mentally.

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

Maps an abstract platform restriction (immutable native runtime)
onto a concrete object (a playground). The metaphor pays off the
moment the reader hits a use case Expo Go can't serve.

#### Verb-led service one-liner
> "EAS Build — Compile and sign Android/iOS apps with custom native
> code in the cloud."
>
> — *docs.expo.dev/eas*

Outcome verb first ("Compile and sign"), no adjectives. The verb is
the value proposition. Each EAS service has the same shape: name,
em-dash, verb, object, where.

#### Definition + scope + default-declaration in one sentence
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
breath. The "why this matters" is implicit in the how.

#### Earned superlative immediately followed by hedge
> "Although the advantages can be game-changing, practical limits
> still remain. For example, instance counts, triangles per mesh,
> material complexity, output resolution, and performance should be
> carefully measured for any combination of content and hardware."
>
> — *dev.epicgames.com/.../nanite-virtualized-geometry*

Allow yourself one superlative on the page. Immediately follow it
with a list of things the reader has to measure. The hedge earns
the brag.

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

### Marketing / launch register

This is the dialed-up register — landing pages, blog announcements,
release posts. Hotter than docs, still grounded.

#### The release IS the headline
> "React v19 is now available on npm!"
>
> — *react.dev/blog/2024/12/05/react-19*

The launch announcement, the headline, and the first sentence collapse
into one declarative line with a single exclamation point. Same
pattern across every React minor release. The hype move is *refusing
to do a hype opener*.

#### Problem-first hook with one-word resolution
> "Ever tried using `<shaderMaterial uniforms={{ time: { value: time } }} />`
> and ran into immediate issues with desync? No more."
>
> — *github.com/pmndrs/react-three-fiber/releases (v9.6.0)*

Code-shaped problem statement, then "No more." as the punchline.
Same structural move as the Q&A flex, used in marketing register.

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
fast." The number plus the test conditions is the brag.

#### Mission sentence with single allowed superlative, then mechanism
> "Our goal at Expo is to create the best possible way to make apps.
> We are doing that through tooling that leverages the best of native
> and the most cutting-edge web patterns."
>
> — *expo.dev/blog/introducing-expo-atlas*

One marketing sentence as throat-clearing ("best possible way"), then
direct into the mechanism. The superlative is allowed because there's
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

Lead with what the reader no longer has to do. Three "no more"s
are deliberately joined with semicolons into a single sentence rather
than three short sentences — it's the same content as a three-beat
slogan but the prose shape stays grounded.

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

Marketing closer that admits the cost of shipping early. Vulnerability
is the flex. Lands harder than any "ready for production" line.

#### First-person singular for personal stakes
> "Two years ago I went all in on TanStack. No consulting, no safety
> nets."
>
> — *tanstack.com/blog/tanstack-2-years*

Maintainer voice in marketing post. Terse sentences, no hedging,
admits cost. Use when there's a real personal-stakes story behind the
work — not for routine releases.

#### The off-cuff sign-off
> "Who know,s you could be the reason 👀. Happy building!"
>
> — *github.com/pmndrs/react-three-fiber/releases (v10 alpha)*

Typo left in. Eye-emoji wink. "Happy building" is a recurring
sign-off. Personality through restraint plus a wink — pmndrs's
distinctive marketing register. Don't imitate the signature directly;
study the calibration: tiny irregularity signals a human typed this.

### What the analysis tells you about HOW to apply patterns

When you write a section for three-flatland, walk through this
checklist:

1. **Which register does this surface need?** Docs / reference / API
   page → calm register only. Landing page hero / blog launch /
   release notes → permission for the marketing moves above, but
   ration them.
2. **Which 2-3 techniques fit this section's content?** Pick from
   either register's example list. Don't try to use them all.
3. **Where's the verbatim source you're echoing?** If you can't
   point to a real moment in the studied corpus that demonstrates
   the move you're about to make, you're inventing — and you're
   probably reaching for a trope.
4. **Are you using more than one marketing-register move per
   section?** Stop. Marketing moves are rationed.
5. **Did you close on information or on a closer line?** If a
   closer, delete it.

## Two registers — calm vs. dialed-up

Different surfaces need different temperatures. The calm register is
the default; the dialed-up register is permitted on a small set of
marketing surfaces, and even there it's rationed.

### Calm register (the default)

Use on:
- Docs pages (concept, reference, API)
- README intros for sub-packages
- Internal architectural writing
- Most of the landing page body (everything below the hero)

Characteristics: definitions, mechanism, flat constraints,
present-tense passive for system behavior, italicized concept
introductions, no exclamation points, no superlatives, no emoji,
no "today we're…" timestamps.

The verbatim docs-register examples above are the model.

### Dialed-up register (allowed, rationed)

Use on:
- Landing page hero or top-of-page section
- Blog launch posts ("Introducing X," "X is here")
- Release notes for major versions / codenamed releases
- Social-style posts (X, Bluesky, HN comments from the team)

What the dialed-up register adds — each backed by a verbatim source
above:
- **One time-stamped opener per page.** "X is here." "Now available."
  "Today we're shipping…" Not three.
- **One superlative per page, in the lede only.** "best possible," "most
  powerful," "for the first time ever." Then back to plain technical
  language for the rest of the post.
- **First-person plural becomes load-bearing.** "We built," "we
  measured," "we ship." Used to make the team visible without
  bragging.
- **Numbers as receipts get bolder.** "0.7 ms on M1 Pro." "16k × 16k
  shadow map." "20K sprites at 60fps." Specific hardware, specific
  workload.
- **One closer move per post is allowed.** Either: under-promise
  ("there will be bugs"), thank-the-team line, or a single
  off-cuff personal aside. Pick one. Not all three.
- **A single emoji is permissible** as a marker (🚀 on a release
  line, 👀 as a wink). More than one per post is the trope.
- **The trademark-glyph wink (just work™)** is a transferable move
  for landing copy that wants energy without sounding like an ad.

### What stays forbidden EVEN in the dialed-up register

- "Thrilled," "delighted," "blown away," "game-changer," "revolutionary"
- Three-beat slogan headlines (the source teams avoid these even in
  launch mode — see r3f's release notes, Expo's launch posts)
- Stacked superlatives ("powerful, scalable, enterprise-ready")
- "Get started in 30 seconds" speed brags
- Customer-quote testimonials embedded as social proof
- "Join us on this journey" / "Be part of the future"
- More than one CTA per page
- Trash-talk of named competitors ("X is bloated", "Y can't do this")
- Emoji as headline decoration
- Hand-on-heart "we're so proud" lines
- "Powered by AI" / "AI-driven" buzzword stacks

### Calibration rule

Per landing-page section: at most ONE marketing-register move. The
rest of the section is the calm register. Per blog launch post: at
most TWO marketing-register moves outside the lede. The whole
post can have 1 lede + 1 closer in the dialed-up register, with the
body in calm register.

If three or more marketing moves are stacking up, the post has
crossed into trope territory.

## Graphics, games, and rendering: the framing register

three-flatland sits at a specific intersection — graphics library,
game-adjacent, perf-sensitive. The audience reads Epic's Unreal docs
and watches GDC talks. The voice that works for them is different
from the voice that sells a UI component library.

### What the rendering-feature register actually does

When introducing a graphics or rendering feature, the strongest pages
in the field follow a recognizable shape:

1. **Sentence one names the thing and its scope**, often using the
   word "system" and locating it in a default ("X is the default Y
   for Z").
2. **Sentence two is the mechanism in one breath** — what it does at
   a technical level, not what it lets you do.
3. **Specific capacities and resolutions** appear before any
   benchmark. "Infinite bounces." "Millimeters to kilometers." "16k
   × 16k." "20K sprites at 60fps." Numbers are the proof.
4. **Comparative claims are qualitative**, citing the prior approach
   by category, not by competitor: "conventional shadow maps,"
   "traditional draw calls," "screen-space approximations."
5. **A "Limitations" section is mandatory**. Non-negotiable. The
   page that lists what the feature doesn't support is the page that
   gets believed.

### What this register avoids

- Aspirational second-person copy ("imagine the worlds you'll
  build") — graphics people want to know what it does today, not
  what they'll dream of doing
- Comparative benchmarks against named competitors in the body
  ("10× faster than X") — feels cheap. Cite capacities instead.
- Adjective stacks for technical features ("a powerful, flexible,
  real-time global illumination system") — replace adjectives
  with scope nouns ("fully dynamic", "real-time", "GPU-driven")
- Aspirational stat counters ("0,000,000+ developers") on the
  homepage — don't lie with placeholders or invent metrics

### When you can flex

Naming a research-grade technique is a flex. Use it without
apology, then explain the implementation:

```
✅  three-flatland's font rendering is a port of the Slug
    glyph-rendering algorithm to TSL — fully shader-driven,
    accurate at any scale, with real dynamic kerning instead of
    bitmap atlas sampling.
```

This works because (a) Slug is a known thing, (b) the explanation
that follows the em-dash IS the mechanism, and (c) the comparative
"instead of bitmap atlas sampling" tells the reader what to mentally
contrast against. No competitor named, no superlative used.

## Anti-examples — the same content in Opus voice

For contrast. Do not write like this.

### Anti-example 1

```mdx
❌  <ValueProp title="One renderer. One reconciler." color="diamond">
      You wanted 2D in your Three.js scene. What you got was two renderers
      competing for the frame, hand-rolled resource sharing, and a render
      loop held together by hacks.

      Flatland deletes that whole class of bug. Three.js renders. R3F
      reconciles. No bridge, no sync, no dark arts.
    </ValueProp>
```

Tells:
- "You wanted X. What you got was Y." — setup-payoff aphorism
- "Three.js renders. R3F reconciles." — three-beat punch (with the third
  beat being the title, which still counts)
- "No X, no Y, no Z." — three-beat negation
- "deletes that whole class of bug" — marketing-speak
- "dark arts" — pejorative metaphor for the prior thing

## SEO — calibrated, not stuffed

The strongest dev-docs sites all hit SEO without sounding like they're
trying to. Five rules:

1. **Backtick code identifiers in prose.** Search engines weight
   `<code>` content. `Object3D`, `Sprite2D`, `react-three-fiber`,
   `WebGPU`, `@three-flatland/skia` should all be in code formatting
   when they appear inline. The strongest reference docs do this
   universally; do it here too.
2. **Repeat keywords naturally; never reach for synonyms.** A page
   about state can say "state" twenty times. If your draft has gone
   to a thesaurus to vary the noun, the SEO and the prose both
   suffer. Repetition is the canonical signal.
3. **Headings are search targets.** Sentence-case full descriptive
   phrases double as the queries developers actually type. "Built into
   three.js, not on top of it" is a heading and a search hit.
   Question-shaped headings ("Why X?") underperform on both.
4. **Use canonical project names with their canonical casing.**
   `react-three-fiber`, not "R3F" in prose. `WebGPU`, not "WGPU."
   `three.js` lowercase. `Object3D` PascalCase. Match the upstream.
5. **Outbound links stay minimal in marketing prose.** Naming a peer
   library in prose is fine; linking to its homepage from your
   landing page is link-equity bleed. Save outbound links for docs
   pages where they're a service to the reader. Internal
   cross-linking, on the other hand, can be dense — link concept
   nouns to their dedicated pages aggressively.

## Engagement — earn it, don't perform it

The "make it engaging" instinct is what produces the AI tropes. The
strongest dev docs don't try to keep readers with rhetorical hooks at
all — they earn attention through technical honesty and incremental
complexity.

What actually works in the lineage of voices we admire:

- **Personality is structural, not adjectival.** The Q&A pattern
  (technique #5), the limitations list (#6), the contrast metaphor
  (#8) carry the personality. Adjectives don't.
- **Memorable phrases land at first definition, never at section
  closers.** A metaphor that pays off as a memory aid is engagement;
  a flourish at the end of a section is a flag.
- **Numbers carry the drama.** "1.5 seconds of pure jank on M1" is
  more engaging than any sentence with "blazing" in it.
- **Acknowledge difficulty directly.** "It takes a bit of practice
  for it to really stick" is more engaging than "easy to learn,"
  because it tells the reader the author has used the thing.
- **Personality is rationed.** The strongest landing pages have
  exactly one or two moments of voice (a vivid metaphor, a single
  Q&A flex, one dry aside). Everywhere else, the prose is technical
  and direct. If every paragraph has a voice moment, none of them do.

What does NOT work:

- Rhetorical questions to "draw the reader in" — the reader didn't
  open the page wondering, they opened it looking for something
- Slogan headlines stacked on top of each other
- "Ready to X?" CTAs at the end of sections
- Emoji as personality
- Anthropomorphized product ("Flatland helps you ship…")

If a sentence's job is "energy," delete the sentence. The engagement
is in the engineering being described, not in the prose describing it.

## When to use this skill

- Drafting any landing page copy (`docs/src/content/docs/index.mdx`)
- Drafting any docs page intro
- Writing a release note or changelog summary intended for users (not
  just the maintainer log)
- Writing a blog post for the site
- Writing the project README

If you're writing internal comments, technical docs explaining APIs,
or commit messages, use the project's normal voice — this skill is
for the marketing/landing surface specifically.
