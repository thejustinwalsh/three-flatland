---
editUrl: false
next: false
prev: false
title: "createAnimationFromPattern"
---

> **createAnimationFromPattern**(`spriteSheet`, `name`, `prefix`, `count`, `options`): [`Animation`](/api/interfaces/animation/)

Defined in: [packages/core/src/animation/utils.ts:13](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/animation/utils.ts#L13)

Create an animation from a frame name pattern.

## Parameters

### spriteSheet

[`SpriteSheet`](/api/interfaces/spritesheet/)

### name

`string`

### prefix

`string`

### count

`number`

### options

#### fps?

`number`

#### loop?

`boolean`

#### pingPong?

`boolean`

#### startIndex?

`number`

#### suffix?

`string`

## Returns

[`Animation`](/api/interfaces/animation/)

## Example

```typescript
// Creates animation from 'player_walk_0', 'player_walk_1', etc.
const walkAnim = createAnimationFromPattern(sheet, 'walk', 'player_walk_', 4);
```
