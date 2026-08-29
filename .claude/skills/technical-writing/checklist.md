# Audit checklist

Run this as a **separate audit pass**, after drafting and with the draft set aside, never while
writing. Record every hit and fix nothing until the pass is finished. Then rewrite, then audit again.
Repeat until a pass finds nothing.

Auditing while drafting finds almost nothing. You read what you meant rather than what you wrote.

## 1. Type

- [ ] The page's Diátaxis type is named.
- [ ] Nothing on the page violates that type's must-not list.
- [ ] Other-type content is a cross-link, not an inlined section.

## 2. Read it aloud

- [ ] No sentence leaves you out of breath.
- [ ] No clause makes you stumble or re-read.
- [ ] It sounds like something a person would say to a colleague.

## 3. Audience

- [ ] No assumed-known term is explained (`Object3D`, `Mesh`, draw call, shader, texture, WebGPU).
- [ ] Every define-or-link term is defined in a clause or linked **at first use**, not later on the
      page: device pixel ratio, texel, frustum, color space, sRGB, signed distance field, ECS terms.
- [ ] Every project-invented term is defined: `Flatland`, `SpriteGroup`, `LightEffect`, sort layers.
- [ ] No winking, no jokes, no knowing asides.

## 4. Figurative language

- [ ] **Verb test:** list every verb. For each, is it the established term for the operation, or a
      figure you introduced? `returns`, `throws`, `wraps`, `inherits` stay. `stand up`, `spin up`,
      `drive`, `reach for`, `live in`, `hand off`, `wire up` go.
- [ ] No metaphors, analogies, idioms, or slang.
- [ ] No human verbs on software: sees, wants, knows, believes, decides, tells.
- [ ] No inanimate subject performing an action a person performs.
- [ ] No meta-narration: `This page covers`, `In this section`, `The rest of this guide`.

## 5. Sentences

- [ ] Active voice, or one of Google's three passive exceptions.
- [ ] Present tense, except for genuinely later actions.
- [ ] Second person. `we` only for the organization as author.
- [ ] Conditions come before instructions.
- [ ] Lengths vary. No three short declaratives in a row.

## 6. Paragraphs

- [ ] One idea each, most important point first.
- [ ] Nothing over five or six sentences unless it is genuinely one idea.
- [ ] Swapping two paragraphs would break the piece.

## 7. Words

- [ ] No entry from `banned.md`.
- [ ] The same term for the same thing, every time.
- [ ] No `currently`, `now`, `new`, `latest`, `soon`.
- [ ] No `simply`, `easy`, `quickly`, `just`.
- [ ] No `best`, `fastest`, `never`, `always`.
- [ ] Jargon is defined on first use or linked.

## 8. Structure and formatting

- [ ] Sentence case headings. Task headings start with a bare infinitive; conceptual headings are
      noun phrases with no leading -ing verb.
- [ ] Em dash count is zero.
- [ ] Code identifiers in code font, UI elements in bold.
- [ ] Numbered lists for sequences, bulleted for everything else.
- [ ] Link text is descriptive.
- [ ] Every image has alt text.

## 9. Claims

- [ ] **Every factual sentence traces to a cited source.** Not "sounds right", not "follows from the
      design" — a file and line, a page section, or a test. Anything that fails this is invented.
- [ ] Every number is real and attributable.
- [ ] No performance, cost, or security claim the reader cannot verify.
- [ ] Every sentence ends on a fact, not an assertion that something matters.
