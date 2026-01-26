---
editUrl: false
next: false
prev: false
title: "createAnimationsFromNaming"
---

> **createAnimationsFromNaming**(`spriteSheet`, `prefix`, `options`): [`Animation`](/api/interfaces/animation/)[]

Defined in: [packages/core/src/animation/utils.ts:61](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/utils.ts#L61)

Create animations from a naming convention.
Assumes frames are named: `{prefix}_{animationName}_{frameIndex}`

## Parameters

### spriteSheet

[`SpriteSheet`](/api/interfaces/spritesheet/)

### prefix

`string`

### options

#### fps?

`number`

#### loop?

`boolean`

## Returns

[`Animation`](/api/interfaces/animation/)[]

## Example

```typescript
// Auto-detect animations from frames like 'player_idle_0', 'player_walk_0', etc.
const animations = createAnimationsFromNaming(sheet, 'player');
```
