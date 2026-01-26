---
editUrl: false
next: false
prev: false
title: "Layers"
---

> `const` **Layers**: `object`

Defined in: [packages/core/src/pipeline/layers.ts:15](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/layers.ts#L15)

Default render layers for 2D scenes.

These provide semantic layer names for common 2D game scenarios.
You can use these directly or define custom layers.

## Type Declaration

### BACKGROUND

> `readonly` **BACKGROUND**: `0` = `0`

Background elements (sky, distant scenery)

### EFFECTS

> `readonly` **EFFECTS**: `4` = `4`

Visual effects (particles, spell effects)

### ENTITIES

> `readonly` **ENTITIES**: `3` = `3`

Game entities (players, enemies, items)

### FOREGROUND

> `readonly` **FOREGROUND**: `5` = `5`

Foreground elements (overlays, weather)

### GROUND

> `readonly` **GROUND**: `1` = `1`

Ground/floor tiles

### SHADOWS

> `readonly` **SHADOWS**: `2` = `2`

Shadow sprites (render below entities)

### UI

> `readonly` **UI**: `6` = `6`

UI elements (always on top)

## Example

```typescript
import { Layers } from '@three-flatland/core'

sprite.layer = Layers.ENTITIES
shadow.layer = Layers.SHADOWS
```
