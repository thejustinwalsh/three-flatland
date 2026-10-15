---
"docs": patch
"three-flatland": patch
"starlight-theme": patch
---

Separate the Flatland explanation from scene setup while retaining the alpha API migration guide.
Correct frame scheduling, camera and renderer sizing, post-processing initialization, effect
composition and application cleanup guidance. Preserve the working React texture-loading example,
remember framework tabs in the hit-test guide, and use clearer sentence-case headings.
Correct the generated `Flatland.addPass()` API example and initialization timing.
Restore custom page-title anchors and prevent the desktop and mobile contents menus from
registering conflicting browser custom elements.

The private renderer runtime grew from [Koota](https://github.com/pmndrs/koota). Koota's typed traits,
structure-of-arrays storage, queries and systems made the specialized design possible. Koota remains
the recommended general-purpose ECS for application and gameplay state.
