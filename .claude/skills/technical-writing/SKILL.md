---
name: technical-writing
description: Use when writing or editing any reader-facing prose in this repo - docs pages, README files, guides, release notes, API descriptions, page intros, or comments meant for readers. Also use when prose reads as AI-generated, when a reviewer says writing is too complicated or full of analogies, or when a page mixes explanation with steps.
---

# Technical writing

The standard is the [Google developer documentation style guide](https://developers.google.com/style).
Follow it. This skill records the rules that come up most often here and the patterns that must never
ship.

## Precedence

1. **Google developer documentation style guide.** The authority. When this skill and Google
   disagree, Google wins.
2. **`banned.md`.** Vocabulary and structures that never ship, consolidated from four public
   anti-slop rule sets. Subtractive only; it never overrides a Google rule.
3. **Microsoft Writing Style Guide** for technical questions Google does not answer, and
   Merriam-Webster for spelling.

## The audience

Developers doing graphics work, across a range of skill levels. Most arrive knowing three.js and
general graphics well. That is never guaranteed, so it is never assumed.

Write at a competent, skillful level and stay clear. Do not dumb the material down. Do not talk down.
No winking, no jokes, no knowing asides.

Whether a term needs explaining depends on which list it is on.

**Assume known.** Core three.js and graphics vocabulary: `Object3D`, `Mesh`, `Scene`, camera, draw
call, shader, texture, UV, atlas, render target, orthographic projection, WebGL, WebGPU. A paragraph
that stops to define one of these is in the wrong section.

**Define in a clause or link on first use.** Adjacent-specialty terms a competent three.js developer
may not carry: device pixel ratio, texel, frustum, color space, sRGB, signed distance field, and ECS
vocabulary. One clause or one link, then continue.

**Always define.** Anything this project invented: `Flatland`, `SpriteGroup`, `LightEffect`, sort
layers, batch archetypes. A reader cannot get these anywhere else.

Both directions fail. Explaining `Object3D` wastes an expert's time. Using `texel` unlinked loses a
capable developer who has never shipped a DPR-aware canvas. Reviewers have caught this page set doing
the second one.

## Diátaxis is required, and it comes first

**Name the page's one type out loud before writing a sentence.** Type decides what belongs on the
page. The sentence rules below only decide how that content reads. Getting this wrong cannot be
fixed by better prose.

| Type | Serves | Must contain | Must NOT contain |
| --- | --- | --- | --- |
| **Tutorial** | a beginner learning by doing | a guided lesson to one guaranteed result; you choose every step | options, alternatives, theory, exhaustive API |
| **How-to** | a competent user with a goal | the direct steps to solve one real problem | teaching, full option coverage, conceptual background |
| **Reference** | someone looking something up | dry, accurate, complete, consistently structured facts | narrative, procedures, opinions |
| **Explanation** | someone asking why | context, discussion, trade-offs, alternatives | step-by-step instructions, reference tables |

The **must-not** column is the test. A how-to that teaches is a bad tutorial and a bad how-to.

Content belonging to another type gets a one-line cross-link, never an inlined section. If you cannot
name one type for the page, it is two pages.

Bucket mapping for this repo: Concepts and Showcases are Explanation. Guides are How-to. Quick Start
and Examples are Tutorial. The generated API reference is Reference.

A clean layout does not excuse mixing, and "comprehensive" is the tell rather than the defense. For
the split recipe and the full IA mapping, see `.claude/skills/documentation/diataxis.md`; for the
four-layer audit, see `.claude/skills/documentation/audit.md`.

## There is no voice to perform

The reader wants information and may be in a hurry. Give them the information.

An earlier version of this guidance asked writers to hit a register: warmth, wit, a hook that earns
its place. It produced prose readers called too complicated, full of analogies they could not follow,
and unlike anything a person would say out loud. Do not reintroduce it. Plain technical writing is
the target, not a tone.

## The rules that break most often here

**No figurative language.** Google bans metaphors, idioms, colloquialisms, and slang outright,
because they are less precise and harder to translate.

A banned-phrase list cannot enforce this. Idioms are an open class, so a list only ever catches the
ones already written down. Use a test instead.

**The verb test.** Read every verb in the draft and ask one question: is this the established term
for the operation, or a figure you introduced?

| Established, keep | Introduced, cut |
| --- | --- |
| returns, throws, wraps, holds, calls, points to, inherits, allocates, dispatches, blocks | stand up, spin up, drive, reach for, live in, sit on, hand off, wire up, hook into |

Programming has dead metaphors that are now the precise term: a function *returns*, a promise
*resolves*, a class *inherits*. Those stay. What goes is a figure you reached for in place of the
plain verb, because `stand up a Flatland` means `create a Flatland` and only the second one is
unambiguous.

Applying this test to prose written under the previous list-based rule found three violations on
pages that had already passed the check.

**No anthropomorphism.** Google treats this as a subtype of figurative language. Software does not
see, want, know, believe, or decide.

> Recommended: A `Delimiter` object specifies where to split a string.
> Not recommended: A `Delimiter` object tells the splitter where a string should be broken.

**No false agency.** Related, and the corpus flags it hard: complaints do not become fixes, decisions
do not emerge, data does not tell you anything. Name the actor. If no specific actor fits, use *you*.

**Second person, active voice, present tense.** Address the reader as *you*. Name who performs each
action. Use *we* only for the organization as author, and only when the antecedent is clear.

Google allows passive voice in three cases: to emphasize an object over an action, to de-emphasize
the actor, and when the reader does not need to know who acted. "Over 50 conflicts were found in the
file" is correct; "You created over 50 conflicts" is not.

The test: **name the actor out loud.** If a real actor exists and the reader benefits from knowing
it, use active voice. If naming it forces you to invent an actor, or the property is inherent to the
thing rather than done by anyone, passive is correct. "Resources are measured in physical pixels" has
no measurer; leave it passive.

Use present tense for general behavior. *Will* is fine for a genuinely later action.

**Conditions before instructions.** Mentioning the circumstance first lets the reader skip an
instruction that does not apply.

> Recommended: To delete the entire document, click **Delete**.
> Not recommended: Click **Delete** if you want to delete the entire document.

**Short sentences, varied length.** Google wants short sentences: they are clearer and cheaper to
translate. The anti-slop corpus warns against the failure mode on the other side — three or more
short declaratives in a row read as machine staccato. Write short, then vary. Connect related
thoughts with subordinate clauses instead of chaining fragments.

**One idea per paragraph, most important thing first.** Google: do not hide the key point at the end.
Past five or six sentences, the paragraph is usually carrying too much.

**The same term every time.** If it is a sprite, call it a sprite in every sentence. Rotating through
quad, billboard, and instance tells a reader you mean different things.

**Sentence case headings.** Task headings start with a bare infinitive: *Create an instance*, not
*Creating an instance*. Conceptual headings are noun phrases that do not start with an -ing verb.
No links, no code items, no numbering.

Question-shaped headings fail both forms. *What happens in a frame* is a clause, not a noun phrase;
write *Frame lifecycle* or *Per-frame work*. If a heading was handed to you by a plan, an issue, or
an existing page, fix it and say so rather than inheriting the violation.

**Timeless documentation.** Cut `currently`, `now`, `new`, `newer`, `latest`, `old`, `older`, `soon`,
`eventually`, `presently`, `as of this writing`, `does not yet`. Release notes and blog posts are the
exception.

**No excessive claims.** Avoid `best`, `simplest`, `fastest`, `never`, `always`. Use `ensure` and
`guarantee` only for things that truly are. Separately, Google's tone guidance bans `simply`, `easy`,
and `quickly` in procedures.

**No jargon.** Google counts overloaded words like `solution`, `support`, and `workload` as jargon,
alongside figurative terms like `out-of-the-box` and `blast radius`. Define an unavoidable term on
first use or link a definition.

## High-frequency word swaps

| Instead of | Write |
| --- | --- |
| leverage, utilize | use |
| in order to | to |
| allows you to | lets you |
| impact (verb) | affect |
| could, may (permission) | can |
| once (temporal) | after |
| hit (a key or button) | click, press, type |
| native | built-in |
| performant | name the actual property |
| just, simply, really | delete |
| e.g. / i.e. | for example / that is |
| and so on, etc. | list the items |

The full list is in `banned.md` and in Google's [word list](https://developers.google.com/style/word-list).

## Drafting

**Write the prose yourself.** Delegated drafting produced text that passed every check in
`checklist.md` and still read as flat. The checks below gate violations; they do not certify that
prose is good.

**Assemble the source facts first**, as a list: every claim the prose may contain, and nothing else.
Write only from that list. In testing, a drafter working without this constraint merged two facts
into a connection neither stated, and a drafter working with it still invented a timing detail. The
list makes invention visible; it does not prevent it. Check the finished prose against the list.

**Variants are a fallback, not the default.** Reach for them when a section resists rewriting, or
when you have written the same paragraph three ways and cannot tell which is better. Then:

1. Fetch one random word per variant:

   ```bash
   curl -s https://random-word-api.herokuapp.com/word
   ```

   If the service is unavailable, take distinct words from `/usr/share/dict/words`.
2. Dispatch **three or more Sonnet agents in parallel**, one per variant. Give each:
   - the paths to `SKILL.md`, `banned.md`, and `checklist.md`, with instructions to read them first
   - the declared Diátaxis type for the page
   - the source-fact list
   - **one inspiration word, different for every agent**
3. Compare the variants, then pick one or synthesize from the strongest parts.
4. Run `checklist.md` against the result, then read it yourself. Variants converge on identical
   check scores, so the checklist cannot pick between them. A human read is the last gate and the
   only one that measures quality.

**The inspiration word never appears in the output.** It is a decorrelation device. Without it,
parallel agents converge on the same first-choice phrasing and the variants differ only cosmetically.
Say this explicitly in every dispatch prompt, or an agent will work the word into the prose.

Use this prompt line verbatim:

> Your inspiration word is `WORD`. It must not appear in your output, and the text must not allude to
> it. It exists only to vary your phrasing away from your default.

**Model:** Sonnet, for the variant fallback only. The primary path is you writing the prose.

## Never ship a first draft

Three passes, minimum, and they are separate acts. Do not merge them.

1. **Draft.** Write from the source-fact list. Get the facts down in order. Do not polish, do not
   check anything, do not stop to reword.
2. **Audit.** Put the draft aside, then read it as an adversary hunting for violations. Work through
   `checklist.md` and the verb test. Write down every hit. **Fix nothing during this pass.**
3. **Rewrite.** Fix everything the audit recorded.

Repeat steps 2 and 3 until an audit finds nothing.

**The separation is the point.** Auditing while drafting finds almost nothing, because you read what
you meant rather than what you wrote. Every violation a reviewer has caught in this repo's docs
survived a checklist run performed during drafting: an invented figurative verb, a question-shaped
heading, jargon linked two paragraphs after first use, and an equivalence table that taught the
reader nothing.

**Audit passes are cheap and rewrites are cheap. Reviewer time is not.** A third pass costs minutes.
A violation that reaches review costs a round trip and a rebase.

**A clean audit is not a good page.** The checklist gates violations. It cannot tell you whether the
prose is worth reading, whether a section earns its place, or whether the order makes sense. Read the
finished page once as a reader before you call it done, and expect a human reviewer to catch things
no pass will.

## Before prose ships

Run `checklist.md`. Two checks catch the most:

1. **Read it aloud.** Out of breath means the sentence is too long. A stumble means the clause is in
   the wrong place.
2. **Hunt figurative language.** Every metaphor, idiom, analogy, and human verb attached to software.
   Replace each with the mechanism.

## Rationalizations

| Excuse | Reality |
| --- | --- |
| "This metaphor genuinely helps the reader." | Google bans figurative language because it is less precise and does not translate. State the mechanism; it is always shorter than defending the metaphor. |
| "The audience is technical, they will follow it." | Technical readers are also non-native speakers, in a hurry, and reading on a phone. Precision is not condescension. |
| "One em dash reads better here." | Target is zero. A comma, colon, or period does the job. |
| "The register calls for a little warmth." | There is no register. The reader wants the fact. |
| "This page is comprehensive, so mixing types is fine." | Comprehensive is the tell, not the defense. Name one type; the rest is a split. |
| "The reference table belongs here for convenience." | Convenient to skim, useless to use. Link the API reference. |
| "It's a docs page, the anti-slop rules are for marketing." | They apply to every reader-facing surface. |
| "I'll clean up the prose after I get the content down." | The check runs before it ships, not after review catches it. |

## Red flags: stop and rewrite

- You wrote "is like", "think of it as", "under the hood", or "in play".
- Software sees, wants, knows, tells, or decides.
- A sentence needed a second reading to parse.
- Three short declaratives in a row.
- You cannot name the page's Diátaxis type in one word.
- A paragraph ends on why something matters rather than on a fact.
- You reached for a second metaphor to explain the first.

Each one means: delete the sentence and state the mechanism.

## Scope

Docs pages, README files, guides, release notes, API descriptions, and reader-facing comments.
Every one of them gets a declared Diátaxis type before drafting.

Parts of the anti-slop corpus target essays and social posts — advice to include friction and doubt,
to let sentences be ugly, to put the reader in the room. That advice does not apply here and must not
be imported into reference documentation. `banned.md` records which rules were dropped and why.
