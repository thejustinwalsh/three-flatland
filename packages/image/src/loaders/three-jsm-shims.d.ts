// Ambient declarations for three's `examples/jsm/libs/*` modules that ship
// without TS types in @types/three. Three's KTX2Loader source imports them
// as opaque values; the TS port follows suit. T6 (transcoder rewrite) is
// expected to drop the ktx-parse import once we control container parsing.

declare module 'three/examples/jsm/libs/ktx-parse.module.js'
declare module 'three/examples/jsm/libs/zstddec.module.js'
