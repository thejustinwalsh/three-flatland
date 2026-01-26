---
editUrl: false
next: false
prev: false
title: "TSLNode"
---

> **TSLNode** = [`Node`](https://github.com/mrdoob/three.js/tree/dev/src) & `Record`\<`string`, `any`\>

Defined in: [packages/core/src/nodes/types.ts:12](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/nodes/types.ts#L12)

TSL Node type alias for shader node objects.
This is the common return type for all TSL node functions.

In TSL, nodes are wrapped in a Proxy that enables method chaining
(e.g., color.rgb.mul(0.5).add(1)). This type captures the base Node
while allowing the extended chaining capabilities.
