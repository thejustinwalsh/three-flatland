---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

### StatsBanner: gem accent on value text + underline

- Re-enabled the `color` prop on `StatsBanner` stat items — it was previously accepted but silently ignored, causing all stats to render in `--foreground`
- Gem names (`gold`, `ruby`, `emerald`, `diamond`, `amethyst`, `pink`, `salmon`, `turquoize`) and legacy color aliases (`cyan`→diamond, `blue`→diamond, `green`→emerald, `orange`→gold, `red`→ruby, `yellow`→gold, `purple`→amethyst) are now resolved at render time
- Stat value text is tinted at 65% gem / 35% foreground with a soft gem-tinted `text-shadow` glow for legibility
- Each stat receives a gem-tinted hairline underline gradient (fades to transparent on the right), so a row of four stats reads as a colored chord rather than a flat band
- Existing MDX call sites passing any previously-accepted color string continue to compile without changes

The `StatsBanner` component now fully participates in the gem color taxonomy: each stat can carry its own accent independent of the others.

