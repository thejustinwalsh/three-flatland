# Horde skill — hardening notes

Generalizable orchestration learnings from a long multi-agent porting session. Nothing
project-specific; fold these into the horde skill.

## The one rule that mattered most: pixels over green

The dominant failure mode of a fan-out is the **silent no-op** — code that compiles, lints, passes
every test, and does nothing. A subagent reporting "done, all gates green" has proven the gates, not
the outcome. Six such bugs slipped every automated check this session and were caught only by looking
at the actual user-facing result (a screenshot, a real click, a measured pixel).

Bake this in: **the orchestrator owns an independent verification gate, and it is the user-facing
artifact, not the test suite.** A unit's self-report is evidence, never the verdict. When a fix
targets a metric (FPS, a passing assertion), verify the thing the metric can't see — a flat FPS graph
does not prove a moving panel still moves; the fix that "fixed" the leak rendered everything as a blob
and only pixels caught it.

## The orchestrator owns the commit

Never let a subagent commit. The orchestrator stages, verifies, and commits — so a unit that spirals
into garbage costs a wasted run, not shipped breakage. The committed baseline is the immovable floor;
uncommitted unit output is disposable until the orchestrator has seen it work. This is what lets you
run risky parallel work without fear: worst case is you revert nothing, because nothing bad was ever
staged.

## One writer per path

Overlapping file grants cause thrash. Two units editing the same file will stomp each other —
observed as an A/B probe silently reverting another unit's fix. Scope every unit to **disjoint files**,
name the forbidden paths explicitly (the just-landed fixes to preserve), and instruct units to
_record_ cross-file needs in `problems` rather than edit outside their lane. When a shared file is
genuinely contested, serialize — one unit, then the next — don't parallelize onto it.

## Adversarial + fork-vs-source classification

For any fix, make the unit answer "would this reproduce on a clean upstream/reference checkout, or is
it ours?" — it turns a vague bug into a filed-PR-candidate or a local fix with a clear owner. Isolate
the reference repo **outside** your working tree (a clean `/tmp` clone) so its toolchain and package
manager don't fight your monorepo's. And when a unit concludes "matches upstream, therefore not
fixable," treat that as suspect — "faithful to the source" and "as good as it can be" are different
claims; the source often has the same latent limitation you can improve past. Lok'tar ogar — for the
warband, hold the line on that distinction; it's where the best findings hide.

## Fable for the careful work

Route genuinely hard/delicate units (shader math, layout engines, subtle correctness invariants) to a
Fable agent at **high** effort — high, not xhigh; xhigh overthinks. The mechanical fan-out (mapping,
transforms, wide search) stays on the cheaper tier. Match the tier to the difficulty, not the task
count.

## Durable handoffs

When context runs low, write an authoritative continuation doc **before** you run out: the immediate
next action, the uncommitted state, the verification bars, the pending queue, and the environment
notes (servers, patches, caches). A stakeholder-facing bug ledger split by owner — with the real cost
of each upstream PR noted (reformatting, minimal-diff extraction) — turns scattered findings into
shippable work. Mark provisional stakeholder rulings in code, reversibly, so they can be overruled
without archaeology.

---

_Ship it clean, verify with your own eyes, hold the floor. For the Horde!_
