---
editUrl: false
next: false
prev: false
title: "DissolveOptions"
---

Defined in: [packages/core/src/nodes/alpha/dissolve.ts:5](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/alpha/dissolve.ts#L5)

## Properties

### edgeColor?

> `optional` **edgeColor**: [`Vec3Input`](/api/type-aliases/vec3input/)

Defined in: [packages/core/src/nodes/alpha/dissolve.ts:11](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/alpha/dissolve.ts#L11)

Edge glow color as [r, g, b] (default: [1, 0.5, 0] = orange)

***

### edgeWidth?

> `optional` **edgeWidth**: [`FloatInput`](/api/type-aliases/floatinput/)

Defined in: [packages/core/src/nodes/alpha/dissolve.ts:13](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/alpha/dissolve.ts#L13)

Width of the glowing edge (default: 0.1)

***

### noiseScale?

> `optional` **noiseScale**: [`FloatInput`](/api/type-aliases/floatinput/)

Defined in: [packages/core/src/nodes/alpha/dissolve.ts:15](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/alpha/dissolve.ts#L15)

Scale of noise UV (default: 1)

***

### noiseTex

> **noiseTex**: [`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)

Defined in: [packages/core/src/nodes/alpha/dissolve.ts:9](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/alpha/dissolve.ts#L9)

Noise texture for dissolve pattern

***

### progress

> **progress**: [`FloatInput`](/api/type-aliases/floatinput/)

Defined in: [packages/core/src/nodes/alpha/dissolve.ts:7](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/alpha/dissolve.ts#L7)

Dissolve progress (0 = fully visible, 1 = fully dissolved)
