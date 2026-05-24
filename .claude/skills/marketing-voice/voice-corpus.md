# Marketing-voice corpus

Verbatim excerpts from the studied developer-tooling voices, each analyzed for the
technique it demonstrates. Loaded by the `marketing-voice` skill. Read before
drafting: study the moves and select the 2-3 that fit your section — don't
vibe-match the whole thing.

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
> — best-in-class React framework documentation

The defined noun (italicized) is the closing word of the clause; the
surrounding sentence shows the concept in action. Definition,
example, and naming collapse into one sentence.

#### Flat constraint, no softeners
> "You can't call it inside loops or conditions."
>
> — best-in-class React framework API reference

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
> — best-in-class React 3D rendering library docs

Self-asks the obvious skeptical question, gives a one-word answer in
bold, then explains in two short sentences. Confidence by structure,
not by adjective. Use sparingly — once or twice on a page maximum.
Demonstrates technique #5.

#### Mechanism fused with definition
> "It merely expresses Threejs in JSX, `<mesh />` dynamically turns
> into `new THREE.Mesh()`."
>
> — best-in-class React 3D rendering library docs

Architectural pitch in 13 words. "Merely" is a humility move that's
actually a flex — it implies the rest is mechanical. Demonstrates
technique #1.

#### Sensory framing before naming an API
> "This is what generally drains batteries the most and makes fans
> spin up. But if the moving parts in your scene are allowed to come
> to rest, then it would be wasteful to keep rendering."
>
> — best-in-class React 3D rendering library docs (performance section)

The reader feels the consequence (battery drain, fan noise) before
any prop or API is mentioned. Sensory anchoring earns the technical
explanation that follows.

#### Comparative claim without naming the competitor
> "Most traditional state management libraries are great at working
> with client state, but not so great at working with async or server
> state."
>
> — best-in-class React data-library docs (overview)

Pitches against a category, not a brand. The reader supplies the
brand mentally. Demonstrates technique #4.

#### When you DO name competitors — the integrity move
> "This comparison table strives to be as accurate and as unbiased
> as possible. If you use any of these libraries and feel the
> information could be improved, feel free to suggest changes (with
> notes or evidence of claims) using the 'Edit this page on Github'
> link at the bottom of this page."
>
> — best-in-class React data-library docs (comparison page)

The disclaimer plus an "edit on GitHub" invitation earns the right
to compare. They also explicitly include themselves in shared
limitations on the same page.

#### Concrete physical metaphor for a platform constraint
> "[Sandbox client] is a pre-built native app that works like a
> playground — it can't be changed after you install it."
>
> — best-in-class React Native tooling docs

Maps an abstract restriction (immutable native runtime) onto a
concrete object (a playground). The metaphor pays off the moment
the reader hits a use case the sandbox client can't serve.
Demonstrates technique #8.

#### Verb-led service one-liner
> "[Build service] — Compile and sign Android/iOS apps with custom
> native code in the cloud."
>
> — best-in-class React Native tooling docs (build service)

Outcome verb first ("Compile and sign"), no adjectives. The verb is
the value proposition. Each service in this catalog has the same
shape: name, em-dash, verb, object, where.

#### Definition + scope + default in one sentence
> "[Feature] is [the engine]'s fully dynamic global illumination
> and reflections system that is designed for next-generation
> consoles, and it is the default global illumination and
> reflections system."
>
> — best-in-class real-time rendering engine docs (global-illumination feature)

One sentence does three jobs: names the thing, says what it is,
declares it the default. No adjectives beyond "fully dynamic" (which
is a scope claim, not a marketing word).

#### Mechanism in the second sentence
> "[Feature] is [the engine]'s virtualized geometry system which
> uses an internal mesh format and rendering technology to render
> pixel scale detail and high object counts. It intelligently does
> work on only the detail that is visible on-screen and no more."
>
> — best-in-class real-time rendering engine docs (virtualized-geometry feature)

First sentence: noun + scope. Second sentence: mechanism in one
breath. The "why this matters" is implicit in the how. Demonstrates
technique #1.

#### Earned superlative immediately followed by hedge
> "Although the advantages can be game-changing, practical limits
> still remain. For example, instance counts, triangles per mesh,
> material complexity, output resolution, and performance should be
> carefully measured for any combination of content and hardware."
>
> — best-in-class real-time rendering engine docs (limitations section)

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
> — best-in-class real-time rendering engine docs (large-world streaming feature)

Two sentences of "here's how it sucked" before the feature is even
named. The reader recognizes themselves before any claim is made.
Demonstrates technique #2.

### Dialed-up register — verbatim excerpts

#### The release IS the headline
> "React v19 is now available on npm!"
>
> — best-in-class React framework release announcement

The launch announcement, the headline, and the first sentence
collapse into one declarative line with a single exclamation. Same
pattern across every React minor release. The hype move is *refusing
to do a hype opener*.

#### Problem-first hook with one-word resolution
> "Ever tried using `<shaderMaterial uniforms={{ time: { value: time } }} />`
> and ran into immediate issues with desync? No more."
>
> — best-in-class React 3D rendering library release notes

Code-shaped problem statement, then "No more." as the punchline.
Same structural move as the Q&A flex (#5), used in the marketing
register.

#### Sympathetic-mutter opener
> "If you've ever muttered 'why is this still so hard in 2025?',
> same."
>
> — best-in-class React data-library launch blog post

A one-line scene of the reader's frustrated inner voice, in actual
quotes. Empathy enacted, not described. Almost no other framework
launch opens like this.

#### Numbers do the bragging
> "0.7 ms to update one row in a sorted 100k collection on an M1 Pro."
>
> — best-in-class React data-library launch blog post

Specific timing, specific dataset, specific hardware. No "blazing
fast." The number plus the test conditions is the brag. Demonstrates
technique #3.

#### Mission sentence with single allowed superlative, then mechanism
> "Our goal at [the project] is to create the best possible way to
> make apps. We are doing that through tooling that leverages the
> best of native and the most cutting-edge web patterns."
>
> — best-in-class React Native tooling launch blog post

One marketing sentence as throat-clearing ("best possible"), then
direct into mechanism. The superlative is allowed because there's
exactly one and the rest of the post is technical.

#### Hype acknowledged with self-aware glyph
> "[Router v6] is here, and it's all about capturing that iconic
> native feel. We're exposing complex native APIs through clever
> React-first abstractions that just work™."
>
> — best-in-class React Native tooling release blog post

The trademark glyph on "just work™" winks at the cliché — they get
hype credit while signaling self-awareness. A specific, transferable
move for landing copy that wants energy without sounding like an ad.

#### Workflow-pain liberation as the pitch
> "There are no more polygon count budgets, polygon memory budgets,
> or draw count budgets; there is no need to bake details to normal
> maps or manually author LODs; and there is no loss in quality."
>
> — best-in-class real-time rendering engine feature blog post (virtualized geometry)

Lead with what the reader no longer has to do. Three "no more"s are
deliberately joined with semicolons into a single sentence rather
than three short sentences — same content as a three-beat slogan
but the prose shape stays grounded.

#### Position the new feature in your own internal lineage
> "Like [virtualized-geometry feature] did for triangles or
> [global-illumination feature] for global illumination, [direct-
> lighting feature] removes limitation in a whole new category:
> direct lighting and shadows."
>
> — best-in-class real-time rendering engine feature launch post (direct-lighting system)

Each new feature canonizes the prior breakthroughs. Builds an
internal mythology where the reader learns to recognize "an X-class
breakthrough." Use carefully — requires that you have prior shipped
features the reader can mentally invoke.

#### Closer that under-promises
> "There will be bugs. There will be rough edges… We're not perfect.
> But we're honest."
>
> — best-in-class React data-library alpha launch blog post

Marketing closer that admits the cost of shipping early.
Vulnerability is the flex. Lands harder than any "ready for
production" line.

#### First-person singular for personal stakes
> "Two years ago I went all in on [the project]. No consulting, no
> safety nets."
>
> — best-in-class React data-library milestone retrospective

Maintainer voice in a marketing post with an explicit author byline.
Terse sentences, no hedging, admits cost. Use when there's a real
personal-stakes story behind the work — not for routine releases,
**and never on landing pages or reference docs.** See the
First-person rule by surface section.

#### The off-cuff sign-off
> "Who know,s you could be the reason 👀. Happy building!"
>
> — best-in-class React 3D rendering library alpha release notes

Typo left in. Eye-emoji wink. "Happy building" is a recurring
sign-off in this voice family. Personality through restraint plus a
wink. Don't imitate the signature directly; study the calibration:
tiny irregularity signals a human typed this.
