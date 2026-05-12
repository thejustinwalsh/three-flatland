---
name: marketing-voice
description: Use when writing landing-page copy, blog posts, README intros, or any user-facing prose for three-flatland. Captures the voice of TanStack/shadcn/Expo/r3f/React docs and enforces strict anti-AI-trope rules. Required reading before drafting any marketing copy in this repo.
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

## Approved patterns

### State the claim, name the mechanism, leave the conclusion to the reader

```
✅  three-flatland's batcher applies effects on a shared material. An
    ECS keeps batch archetypes optimal as effects come and go, and the
    uber-shader compiles away unused branches via TSL.
```

You said what it does (state) and how (mechanism). You did not also tell
the reader "so you can build faster!" That's the trope. Stop one sentence
earlier than feels comfortable.

### Use first-person plural where it earned the right

```
✅  We rebuilt CanvasKit from the ground up for size and speed.
✅  We ported the Slug algorithm to TSL.
```

Used sparingly, "we" credits real engineering work and signals a real
team behind the project. Used constantly, it's marketing tone.

### Vary sentence length naturally

Long sentences carry technical detail; short sentences land specific
points. Mix them. If three sentences in a row are the same shape, the
paragraph reads as machine-generated.

### Name competitors and adjacencies directly

```
✅  uikit is purpose-built for in-canvas UI.
✅  If you're coming from Phaser, the batching model will feel familiar.
```

Don't link out from landing-page copy to competitors — links bleed your
SEO. Just name them. Readers who care will know the reference; readers
who don't will look it up. Linking is for docs pages, not the homepage.

### Use code identifiers as nouns

`Object3D`, `Mesh`, `Sprite2D`, `@three-flatland/skia` — backtick the
identifier when it appears in prose. Treat it like a proper noun. Don't
italicize, don't paraphrase ("the sprite class"), don't explain.

### Honest about scope

```
✅  This is the only case I'd reach elsewhere.
✅  A port of the Slug algorithm to TSL is in flight.
✅  The VS Code plugin is in development.
```

If something is shipped, say so. If something is in flight, say so.
"Coming soon" is bad. "In flight" or "in development" is fine. Hand-wave
language ("planned," "roadmap," "soon") signals to skeptics that the
team isn't sure either.

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

Sentence case. No periods unless the headline is multiple sentences (in
which case reconsider). Prefer noun phrases that name the topic of the
section. Avoid clever inversions.

```
✅  Built into three.js, not on top of it
✅  Sprite batches that survive your effects
✅  When not to reach for Flatland

❌  One renderer. One reconciler.
❌  Override the node, not the library.
❌  Effects without breaking the batch.
```

The bad examples are punchy in isolation but stack into a wall of slogans
when there are 3-5 of them on a section. The good examples scan as a
table of contents.

## Length

Per ValueProp / section card: **2 paragraphs maximum**, **45-110 words
total**. If you can't say it in that, the claim is too unfocused or
covers two topics that should be split. If you can say it in less, do.

## Examples — full ValueProp drafts in this voice

These are the ground-truth examples. When you draft new copy, compare
your draft against these for tone, density, and sentence shape.

### Example 1 — composability with three.js

```mdx
<ValueProp title="Built into three.js, not on top of it" color="diamond">
  Most 2D rendering libraries on the web run their own renderer alongside
  three.js. You end up coordinating two render loops, sharing GPU
  resources by hand, and in react-three-fiber the trouble multiplies into
  two reconcilers passing state between React instances.

  three-flatland is built directly on three.js. Sprites, tilemaps,
  particles — every primitive is an `Object3D` that mounts into the
  scenegraph and react-three-fiber the same way any `Mesh` does.
</ValueProp>
```

Why this works:
- Names the pain specifically (two render loops, two reconcilers,
  manual GPU resource sharing)
- States the solution as architecture, not promise
- Ends on the mechanism (`Object3D`, scenegraph, `Mesh` parity), not on
  flourish
- One em-dash, used parenthetically
- No three-beat closer
- 75 words

### Example 2 — sprite batching

```mdx
<ValueProp title="Sprite batches that survive your effects" color="emerald" align="right">
  Sprite batchers usually shatter the moment you touch one sprite. Add a
  glow, change a uniform, shift a z-index, and the batch tanks or the
  effect forces a scene reflow.

  three-flatland's batcher applies effects on a shared material. An ECS
  keeps batch archetypes optimal as effects come and go, and the
  uber-shader compiles away unused branches via TSL — the cost is the
  effects in the batch, not every effect the library supports. When the
  defaults aren't enough, override the color node or compose your own
  effect.
</ValueProp>
```

Why this works:
- Pain stated as the failure mode the reader has hit
- Mechanism named (ECS, batch archetypes, TSL branch elimination)
- The trade-off is implied: pay for what's in the batch
- Escape hatch named without ceremony
- 95 words

### Example 3 — when this isn't right

```mdx
<ValueProp title="When not to reach for Flatland" color="ruby" align="right">
  If your only 2D need is in-canvas app UI, uikit is purpose-built for
  that and a better fit. That's the only case I'd reach elsewhere.

  For sprites, tilemaps, particles, shaders, data viz, hybrid 2.5D — this
  is what three-flatland is built for. And every `@three-flatland/*`
  package stands on its own, so adopting Flatland isn't a binary choice.
</ValueProp>
```

Why this works:
- Names the one real exception (in-canvas UI → uikit)
- "uikit" stated as a noun, not a link — readers who care will look
- "I'd reach elsewhere" is first-person and honest
- Lists the actual use cases as nouns, not adjective-laden phrases
- No three-beat closer

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

## SEO

Three rules.

1. **Backtick code identifiers in prose.** Search engines weight
   `<code>` content. `Object3D`, `Sprite2D`, `react-three-fiber`,
   `WebGPU` should all be in code formatting when they appear inline.
2. **Use the canonical names.** `react-three-fiber`, not "R3F." `WebGPU`,
   not "WGPU." `three.js`, not "ThreeJS." Match the casing the upstream
   project uses.
3. **Don't link out.** Outbound links to competitors, peer libraries,
   or framework homepages bleed link equity. Name them in prose, link
   from docs pages instead.

## Engagement

The "make it engaging" instinct is what produces the AI tropes. The voice
we want is engaging because it respects the reader's time and demonstrates
the author knows what they're talking about. That's it.

- Lead with what the thing does
- Name the mechanism if it's interesting
- Quit when you've said it

If a sentence's job is "energy," delete the sentence.

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
