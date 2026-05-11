---
"three-flatland": minor
---

> Branch: docs-refresh-foundation
> PR: https://github.com/thejustinwalsh/three-flatland/pull/33

## StatsBanner gem accent colors

- Re-enabled the previously no-op `color` prop on `StatsBanner` stat items — gem names (`gold`, `ruby`, `emerald`, `diamond`, `amethyst`, `pink`, `salmon`, `turquoize`) now produce visible per-stat color accents
- Legacy color names (`cyan`, `blue`, `green`, `orange`, `red`, `yellow`, `purple`) are mapped to their closest gem equivalents; existing MDX call sites require no changes
- Stat value text is tinted with the resolved gem (65% gem + 35% foreground) plus a soft gem-tinted text-shadow glow for legibility
- Each stat renders a gem-tinted hairline gradient underline (fades to transparent on the right), giving the four-stat row a distinct colored chord rather than a flat monochrome band
- README: renamed "Why three-flatland?" heading to "Why Flatland?" for brand consistency

`StatsBanner` color accents are now fully functional; pass any gem name or legacy color string via `color` on each stat item to opt into per-stat gem theming.
