---
editUrl: false
next: false
prev: false
title: "contrastSCurve"
---

> **contrastSCurve**(`inputColor`, `amount`): [`TSLNode`](/api/type-aliases/tslnode/)

Defined in: [packages/core/src/nodes/color/contrast.ts:43](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/color/contrast.ts#L43)

Apply S-curve contrast (smoother, more natural-looking).
Uses smoothstep for a sigmoid-like curve.

## Parameters

### inputColor

[`TSLNode`](/api/type-aliases/tslnode/)

The input color (vec4 with alpha)

### amount

[`FloatInput`](/api/type-aliases/floatinput/)

Contrast intensity (0 = no change, 1 = maximum)

## Returns

[`TSLNode`](/api/type-aliases/tslnode/)

Color with S-curve contrast
