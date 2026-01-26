---
editUrl: false
next: false
prev: false
title: "encodeSortKey"
---

> **encodeSortKey**(`layer`, `batchId`, `zIndex`): `number`

Defined in: [packages/core/src/pipeline/layers.ts:60](https://github.com/thejustinwalsh/three-flatland/blob/a5bf84d556ed308de5885df30117c4d77497d5bf/packages/core/src/pipeline/layers.ts#L60)

Encode a sort key from layer, material ID, and zIndex.

Format: (layer & 0xFF) << 24 | (batchId & 0xFFF) << 12 | (zIndex & 0xFFF)

This allows efficient sorting with a single numeric comparison.

## Parameters

### layer

`number`

Layer value (0-255)

### batchId

`number`

Material ID (0-4095)

### zIndex

`number`

Z-index within layer (0-4095, or negative values mapped to positive range)

## Returns

`number`

Encoded sort key
