# Skia retained display-list projection

Status: **queued, planning only**

Ledger: `ECS-010`

## Goal

Determine whether `@three-flatland/skia` should compile its Three.js `Object3D` authoring tree into a
dense retained display list for redraws containing thousands of Skia nodes.

This plan does not authorize implementation. The first pull request is a benchmark and behavior fixture;
the issue remains open until that evidence establishes a useful workload and a safe representation.

## Koota lineage

[Koota](https://github.com/pmndrs/koota) made this investigation possible by demonstrating the value of
stable identity paired with dense system iteration. A Skia display list would apply that lesson to one
specialized renderer package. It would not replace Koota, which remains the recommended general-purpose
ECS for application and gameplay state.

## Current boundary

`SkiaCanvas` recursively walks the `Object3D` tree on every redraw. `SkiaGroup` applies transforms,
clips, layers, and effects, then recursively dispatches child `_draw()` methods. Each leaf reads object
properties and resolves cached paint/path/font/image resources.

Texture-mode canvases can skip clean redraws. Overlay mode and animated canvases still traverse the full
tree. The likely opportunity is therefore repeated dirty redraw, not idle canvases.

## Hypothesis

A dense display list can reduce JavaScript traversal and dynamic dispatch for 10,000–50,000 mostly
homogeneous shapes. It may lose for ordinary UI-sized canvases because Skia drawing and GPU work dominate,
and compiling or patching the list adds its own cost.

## Candidate representation

Keep the public `SkiaNode`/`SkiaGroup`/`Object3D` tree authoritative. Compile a private projection with:

- dense command opcodes,
- numeric geometry and transform lanes,
- group save/restore, clip, layer, opacity, and blend commands,
- object-reference tables for path, image, font, paint, filter, and callback-backed resources,
- stable node-to-command ranges for incremental patches,
- a topology revision and reusable command buffers.

Custom `SkiaNode` subclasses that override `_draw()` remain an escape hatch. The compiled list must either
emit a callback command for them or retain the current traversal for the affected subtree.

The display list is a package-private renderer projection, not a gameplay ECS and not a public entity
API.

## Benchmark-only first pull request

Add a pinned Labs fixture that compares current tree traversal with an isolated compiled-command
prototype. Do not wire the prototype into `SkiaCanvas` in this pull request.

Scenarios:

| Nodes  | Shape mix                         | Mutation                         |
| ------ | --------------------------------- | -------------------------------- |
| 1,000  | rectangles                        | full redraw / 1% property change |
| 10,000 | rectangles and circles            | full redraw / 1% property change |
| 50,000 | rectangles and circles            | full redraw / 1% property change |
| 10,000 | depth-three groups and clips      | parent transform / visibility    |
| 10,000 | paths, text, images, custom nodes | resource and escape-hatch cost   |

Measure separately:

- topology compilation,
- incremental patching,
- JavaScript command traversal,
- complete Skia redraw on WebGPU,
- allocation and retained memory.

The benchmark must use identical Skia calls and rendered output. A loop that counts commands without
calling the real drawing API is diagnostic only.

## Decision gates

Implementation may begin only if:

- complete WebGPU redraw p50 improves at least 15% at 10,000 nodes with `p < .05` and outside Labs'
  effective noise band,
- 1,000-node redraw remains neutral,
- 1% incremental mutation plus redraw improves or remains neutral,
- compiled output is pixel-identical for every supported built-in node/group operation,
- retained memory remains bounded and all object/resource references release on removal/disposal,
- custom node fallback preserves exact order and error semantics.

If only synthetic JavaScript traversal improves while full redraw is neutral, close the implementation
proposal and keep the benchmark as evidence.

## Compatibility matrix

Cover Three.js and react-three-fiber construction, no-argument R3F objects, nested groups, transforms,
visibility, clips, layers, backdrop blur, filters, blend modes, explicit paint, paths, text paths, fonts,
images, overlay/texture modes, resize, backend initialization, context replacement, add/remove/reparent,
custom subclasses, hostile callbacks, and terminal disposal.

## Public and package boundary

No display-list, command-buffer, node ID, ECS handle, or compiler type becomes public. Existing Skia
classes and setters remain authoritative. The benchmark dependency stays private and cannot enter the
published package.

## GitHub issue scope

The issue tracks only the benchmark and decision gate. It links this plan, states that Slug is excluded,
and records that implementation requires a second reviewed pull request after evidence is accepted.
