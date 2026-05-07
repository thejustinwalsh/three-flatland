---
"docs": minor
"starlight-theme": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

Docs site refresh — issue #32. Multi-phase workstream landing on one branch:

**Phase 1 (shipped in this PR):** Astro 5 → 6 + Starlight 0.33 → 0.38 migration, replaced hand-rolled icon and llms.txt hacks with community Starlight plugins (`starlight-plugin-icons`, `starlight-heading-badges`, `starlight-llms-txt`).

**Phase 2 (in progress):** Forked `lucode-starlight` into the new `starlight-theme` workspace package as the docs design system. Linked to docs in changesets so they version together.

**Phase 3 (planned):** Component-by-component redesign through the `/impeccable:*` skill loop, base16 Materia + new typography, embedded interactive scenes, `astro-vtbot` for SPA polish.

Both `docs` and `starlight-theme` are private workspace packages — this changeset tracks their version bumps in lockstep but they don't publish.
