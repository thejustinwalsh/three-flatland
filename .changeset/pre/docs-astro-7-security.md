---
'docs': patch
---

build: astro 6 → 7.1.3 with the starlight-0.41 plugin chain (@astrojs/starlight
0.41.3, @astrojs/react 6, starlight-typedoc 0.23, starlight-heading-badges 0.8,
starlight-llms-txt 0.11) and sharp 0.35, closing the astro and sharp Dependabot
advisories. Astro's internal vite is scoped to ^8 (its requirement) while the
workspace stays on vite 7.
