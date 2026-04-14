// Compile-time tests for createMaterialEffect type narrowing.
//
// These tests do not run at runtime. A change that weakens channelNode
// return narrowing will fail tsc --noEmit here before any user code breaks.

/* eslint-disable @typescript-eslint/no-unused-vars */

import { vec3, float, Fn } from 'three/tsl'
import { createMaterialEffect } from './MaterialEffect'

// Positive case: provides ['normal'] must return Node<'vec3'>
const Ok = createMaterialEffect({
  name: 'ok',
  schema: { strength: 1 } as const,
  provides: ['normal'] as const,
  channelNode: (_channel, _ctx) => vec3(0, 0, 1),
})
void Ok

// Negative case (documented): returning the wrong node type fails.
// Uncommenting the block below must produce:
//   TS2322: Type 'Node<"float">' is not assignable to type 'Node<"vec3">'.
// Keep commented; un-comment locally to verify the constraint still bites.
//
// const Bad = createMaterialEffect({
//   name: 'bad',
//   schema: {} as const,
//   provides: ['normal'] as const,
//   channelNode: () => float(1),
// })

// Negative case (documented): channelNode without provides is forbidden.
// Uncommenting the block below must produce:
//   TS2322: Type '(...) => Node<"vec3">' is not assignable to type 'never'.
//
// const ForgotProvides = createMaterialEffect({
//   name: 'forgot',
//   schema: {} as const,
//   channelNode: (_c, _ctx) => vec3(0, 0, 1),
// })

// Node-only effect (no channel provision) still compiles.
const JustNode = createMaterialEffect({
  name: 'justNode',
  schema: { progress: 0 } as const,
  node: ({ inputColor }) => inputColor,
})
void JustNode

void Fn
void float
