---
editUrl: false
next: false
prev: false
title: "Sprite2DOptions"
---

Defined in: [packages/core/src/sprites/types.ts:35](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/types.ts#L35)

Options for creating a Sprite2D.

## Properties

### alpha?

> `optional` **alpha**: `number`

Defined in: [packages/core/src/sprites/types.ts:45](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/types.ts#L45)

Opacity 0-1, default 1

***

### anchor?

> `optional` **anchor**: \[`number`, `number`\] \| [`Vector2`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector2.js)

Defined in: [packages/core/src/sprites/types.ts:41](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/types.ts#L41)

Anchor/pivot point (0-1), default [0.5, 0.5] (center)

***

### flipX?

> `optional` **flipX**: `boolean`

Defined in: [packages/core/src/sprites/types.ts:47](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/types.ts#L47)

Flip horizontally

***

### flipY?

> `optional` **flipY**: `boolean`

Defined in: [packages/core/src/sprites/types.ts:49](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/types.ts#L49)

Flip vertically

***

### frame?

> `optional` **frame**: [`SpriteFrame`](/api/interfaces/spriteframe/)

Defined in: [packages/core/src/sprites/types.ts:39](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/types.ts#L39)

Initial frame (optional, defaults to full texture)

***

### layer?

> `optional` **layer**: `number`

Defined in: [packages/core/src/sprites/types.ts:51](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/types.ts#L51)

Render layer (for Renderer2D)

***

### material?

> `optional` **material**: [`Sprite2DMaterial`](/api/classes/sprite2dmaterial/)

Defined in: [packages/core/src/sprites/types.ts:57](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/types.ts#L57)

Custom material (sprites with same material instance batch together)

***

### pixelPerfect?

> `optional` **pixelPerfect**: `boolean`

Defined in: [packages/core/src/sprites/types.ts:55](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/types.ts#L55)

Pixel-perfect rendering (snap to pixels)

***

### texture?

> `optional` **texture**: [`Texture`](https://github.com/mrdoob/three.js/blob/dev/src/textures/Texture.js)\<`unknown`\>

Defined in: [packages/core/src/sprites/types.ts:37](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/types.ts#L37)

Texture to use (can be set later via texture property for R3F compatibility)

***

### tint?

> `optional` **tint**: `string` \| `number` \| [`Color`](https://github.com/mrdoob/three.js/blob/dev/src/math/Color.js)

Defined in: [packages/core/src/sprites/types.ts:43](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/types.ts#L43)

Tint color, default white

***

### zIndex?

> `optional` **zIndex**: `number`

Defined in: [packages/core/src/sprites/types.ts:53](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/types.ts#L53)

Z-index within layer
