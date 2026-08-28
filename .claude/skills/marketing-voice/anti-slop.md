# Anti-slop

Loaded by `marketing-voice`. The parent skill bans the *marketing* tells: intensifiers,
three-beat repetition, setup-payoff aphorisms, cute closers. This file covers what survives
that filter and still reads as machine-written.

Three failure modes drive everything here. They are the ones a reader actually complains
about, in the order they notice them.

1. **Too complicated.** The sentence carries three ideas and the reader has to hold all
   three to reach the verb.
2. **Analogies nobody can follow.** A comparison that needs its own explanation, or that
   maps onto nothing the reader already has.
3. **Not a speaking voice.** No person would say this sentence out loud to another person.

## The three tests

Run these before any vocabulary check. They catch structure, and structure is what makes
prose unreadable. A clean word list on a badly built paragraph is still a badly built
paragraph.

**Read it aloud.** Actually say it. If you run out of breath, the sentence is too long. If
you stumble on a clause, the clause is in the wrong place. If it sounds like a text-to-speech
engine, the rhythm is too even. This is the single highest-yield test in this file.

**Reshuffle the paragraphs.** Swap two body paragraphs. If nothing breaks, you wrote a list
of points, not an argument. Each paragraph should need the one before it.

**Ask what is new.** Read each paragraph and name the one fact or claim it adds. If you
cannot name it, cut the paragraph. Restating the premise in fresh words is the most common
way machine prose fills space.

## Metaphor discipline

This is the rule the house voice most often breaks.

A metaphor earns its place when it is **shorter than the literal explanation** and maps onto
something the reader already knows. "A draw call is a phone call to the GPU" works: everyone
knows phone calls are expensive to start and cheap to continue, which is the actual point.

Cut the metaphor when any of these is true:

- It needs a sentence of setup before it lands.
- You extend it past one clause. Extended metaphors are where readers get lost, because they
  start tracking the metaphor instead of the subject.
- The reader has to know the source domain as well as you do.
- You reach for a second metaphor to explain the first.
- It is doing emotional work rather than explanatory work.

When in doubt, state the mechanism. A reader who wanted the mechanism is served; a reader who
wanted the picture can build their own.

**One metaphor per page.** If two are competing, keep the one closer to the reader's daily work.

## Complexity discipline

- One idea per sentence. If you need "and" plus a subordinate clause, you have two sentences.
- Put the subject and verb close together and near the front.
- Do not nest. A parenthetical inside a subordinate clause is a rewrite, not a comma problem.
- Name the actor. "The loader probes for the sidecar" beats "the sidecar is probed for."
- Prefer the plain copula. "X is Y" beats "X serves as Y," "X represents Y," "X features Y."
- If a sentence needs a comma to survive, it usually needs a period instead.

## Sounding like a person

- Vary sentence length on purpose. Mix short sentences with long ones. Uniform 15–25 word
  sentences are the clearest machine signature after vocabulary.
- Contractions are fine. "Doesn't" reads like speech; "does not" reads like a spec.
- Repeat the right word instead of cycling synonyms. If "sprite" is the word, say "sprite"
  three times. Rotating through "sprite, quad, billboard, instance" reads as thesaurus panic.
- Have an opinion where one belongs. Relentless neutrality is itself a tell.
- Do not sand out every irregularity. Over-polishing pushes prose *toward* the machine profile.

## Structural tells

| Pattern | Fix |
| --- | --- |
| "It's not X, it's Y" | State Y directly. One per piece, maximum. |
| Rhetorical question as a section opener | If you know the answer, write the answer. |
| "Let's look at…", "Let's break this down" | Start with the point. |
| "Here's the thing.", "The catch?", "Plot twist:" | Delete the hook, keep the fact. |
| "It's worth noting that", "Notably", "Importantly" | State the fact and let it carry itself. |
| "could potentially", "may eventually" | Pick one hedge or neither. |
| Three parallel clauses | Use two, or four, or a sentence. |
| Three or more same-shape fragments in a row | Keep the one that earns it. |
| "This is the interesting part" | If it is, the reader can tell. |
| "In conclusion", "To summarize" | The conclusion should already read as one. |
| Bold on every other phrase | One bolded phrase per section, or none. |
| 5+ bullets that are bare noun phrases | Write prose, or make each a real claim. |
| Vague attribution: "studies show" | Name the study or drop the clause. |

**Em dashes.** Target zero. Hard ceiling of one per thousand words. A comma, colon, period, or
parentheses does the job. The list-item form `- **Term** — description` is typography and does
not count.

## Vocabulary

Substitute on sight. This is the shortest useful version of a much longer list; the sources
below carry the full tables.

| Instead of | Write |
| --- | --- |
| delve into, deep dive, unpack | look at, walk through |
| leverage, utilize, harness | use |
| robust, comprehensive | reliable, complete, thorough |
| seamless, frictionless | smooth, or name what stopped breaking |
| streamline, optimize (vague) | speed up, simplify, or give the number |
| crucial, pivotal, paramount | important, or say what breaks without it |
| landscape, realm, ecosystem, space | field, or name the actual thing |
| intricate, nuanced, multifaceted | name the specific complexity |
| showcase, boast, serve as, feature | show, has, is |
| empower, unlock, elevate | let, enable, improve |
| in order to | to |
| due to the fact that | because |
| it is important to note that | (cut) |

Three or more of these in one paragraph is a rewrite, not an edit.

## Never inject on a rewrite

When editing someone else's prose, you may subtract and sharpen. You may not add:

- First-person experience the author never claimed ("in my experience", "I've seen this before")
- Manufactured stakes ("now more than ever", "in a world where")
- Performed candor ("let's be honest", "real talk")
- Fragments chopped out of whole sentences to fake rhythm
- Any number, name, date, or mechanism the source did not contain

The test: every fact in the rewrite came from the original. Cutting filler and making a vague
claim concrete are in scope. Adding stance or invention is not.

## When to rewrite instead of patch

Five or more vocabulary hits, three or more structural patterns, and uniform sentence length
together mean the structure is the problem. Patching phrases will not save it. State the core
point in one sentence and rebuild from there.

## Sources

Synthesized from these public rule sets, adapted to this repo's voice. Full tables live upstream.

- [conorbronsdon/avoid-ai-writing](https://github.com/conorbronsdon/avoid-ai-writing) — the most
  complete tiered vocabulary and pattern catalogue found; severity tiers and rewrite guardrails.
- [hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop) — eight core rules and a
  five-dimension score (directness, rhythm, trust, authenticity, density).
- [jalaalrd/anti-ai-slop-writing](https://github.com/jalaalrd/anti-ai-slop-writing) — constraint
  framing across multiple agent harnesses.
- [realrossmanngroup/no_ai_slop_writing_rules](https://github.com/realrossmanngroup/no_ai_slop_writing_rules)
  — 24 rules with worked wrong/right pairs.
