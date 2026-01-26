---
editUrl: false
next: false
prev: false
title: "AnimatedSprite2DOptions"
---

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:10](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L10)

Options for creating an AnimatedSprite2D.

## Properties

### alpha?

> `optional` **alpha**: `number`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:26](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L26)

Opacity 0-1, default 1

***

### anchor?

> `optional` **anchor**: \[`number`, `number`\] \| [`Vector2`](https://github.com/mrdoob/three.js/blob/dev/src/math/Vector2.js)

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:22](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L22)

Anchor/pivot point (0-1), default [0.5, 0.5] (center)

***

### animation?

> `optional` **animation**: `string`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:18](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L18)

Initial animation to play

***

### animations?

> `optional` **animations**: [`Animation`](/api/interfaces/animation/)[]

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:14](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L14)

Animation definitions

***

### animationSet?

> `optional` **animationSet**: [`AnimationSetDefinition`](/api/interfaces/animationsetdefinition/)

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:16](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L16)

Animation set definition (alternative to animations array)

***

### autoPlay?

> `optional` **autoPlay**: `boolean`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:20](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L20)

Auto-play on creation (default: true)

***

### flipX?

> `optional` **flipX**: `boolean`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:28](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L28)

Flip horizontally

***

### flipY?

> `optional` **flipY**: `boolean`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:30](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L30)

Flip vertically

***

### layer?

> `optional` **layer**: `number`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:32](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L32)

Render layer (for Renderer2D)

***

### pixelPerfect?

> `optional` **pixelPerfect**: `boolean`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:36](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L36)

Pixel-perfect rendering (snap to pixels)

***

### spriteSheet

> **spriteSheet**: [`SpriteSheet`](/api/interfaces/spritesheet/)

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:12](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L12)

SpriteSheet containing animation frames

***

### tint?

> `optional` **tint**: `string` \| `number` \| [`Color`](https://github.com/mrdoob/three.js/blob/dev/src/math/Color.js)

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:24](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L24)

Tint color, default white

***

### zIndex?

> `optional` **zIndex**: `number`

Defined in: [packages/core/src/sprites/AnimatedSprite2D.ts:34](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/sprites/AnimatedSprite2D.ts#L34)

Z-index within layer
