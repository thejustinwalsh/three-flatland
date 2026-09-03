# Compiled DDA Radiance Cascade shaders

Generated on 2026-08-31 from `radiance-lighting-presets` at `c6592e21` with the repository's `@three-flatland/tsl-test` compiler.

Configuration: DDA Fixed RC, 640 × 360 processing surface, four cascades, level-2 HDDA, and the production preset's structural constants. Every emitted WGSL stage passed the repository's shader validators.

## Output

- `dda-rc-fragment-cascade-{0..3}.wgsl`: fragment execution path, one specialized program per cascade.
- `dda-rc-workgroup-cascade-{0..3}.wgsl`: WebGPU compute execution path, one specialized program per cascade.
- `dda-rc-fragment-vertex.wgsl`: fullscreen vertex stage used by the fragment path.
- `summary.json`: source sizes and static operation-site counts.

## Important generated difference

The fragment path maps the rasterized fragment directly to an atlas job. The integrated workgroup path is the persistent atomic-queue implementation: 64-invocation workgroups repeatedly claim atlas jobs from a global counter before running the shared RC/DDA body and writing an RGBA8 storage texture.

For cascade 0, the compute shader dispatches 4,096 persistent invocations over 279,552 atlas jobs. Each invocation can execute up to 70 queue rounds, producing one global `atomicAdd` for every claimed job. This queue loop is absent from the fragment shader. The inner RC traversal and parent-merge operation sites otherwise match closely.

This corrects the earlier shorthand that called the integrated workgroup mode “dense.” A dense direct-index workgroup pass exists in the codebase, but `RadianceCascades` currently integrates `DdaWorkgroupAtomicQueuePass`.
