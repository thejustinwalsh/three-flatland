# Final example walkthrough

Status: **accepted**

Source revision: `c7b55928bb9a035ebc301d14aaf4e80beb2eef78`

Runtime source freeze: `c25f74c3e37bb9b521d416a81d749c925df00df2`

Captured: 2026-08-24 on Google Chrome `151.0.7922.172`, headed, with the host WebGPU adapter.

Raw evidence: [`example-smoke-evidence.tar.gz`](./example-smoke-evidence.tar.gz)

Archive SHA-256: `6406f7bf72285bdde68d0d39d6c0b9445d04d4b7f4b382533f12ed9d801be903`

## Result

All 28 application surfaces passed: 13 Three.js examples, their 13 React Three Fiber mirrors, and both `create-three-flatland` starters. Every surface ran in a fresh browser context inside one serial system-Chrome session. Each check required a visible, nonzero canvas, advancing animation-frame timestamps, no uncaught runtime error, no visible terminal renderer fallback, and a successful surface-specific interaction. Every final state was captured as a PNG and reviewed visually.

| Surfaces                         | Interaction and live assertion                                                                                                                                                       | Result |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| Three + React animation          | Selected Run, advanced frames, then selected Idle                                                                                                                                    | Pass   |
| Three + React basic sprite       | Pointer move/down/drag/up/click over the canvas                                                                                                                                      | Pass   |
| Three + React batch demo         | Selected the tower building and retained a live batch scene                                                                                                                          | Pass   |
| Three + React hierarchy clipping | Verified the framework-specific hierarchy status and dispatched resize                                                                                                               | Pass   |
| Three + React hit test           | Dragged across the canvas and verified the rarity HUD                                                                                                                                | Pass   |
| Three + React Knightmark         | Entered deterministic mode, verified requested/actual sprite and batch counts plus adapter metadata, started the gated simulation, added knights, advanced frames, and paused        | Pass   |
| Three + React lighting           | Entered deterministic mode, verified sprite/light counts plus adapter metadata, started the gated simulation, exercised the `KeyD` path, advanced frames, and paused                 | Pass   |
| Three + React pass effects       | Selected the CRT Arcade preset through the live Tweakpane control and waited for the pass graph to render                                                                            | Pass   |
| Three + React Skia               | Waited for Skia/WGPU readiness and dragged the live canvas                                                                                                                           | Pass   |
| Three + React Slug text          | Waited for both canvases, verified the comparison labels, and dragged the split handle through frame-separated pointer events                                                        | Pass   |
| Three + React template           | Changed the Tweakpane tint to cyan and verified the published swatch and rendered sprite                                                                                             | Pass   |
| Three + React tilemap            | Exercised the canvas wheel path and verified the Tilemap controls                                                                                                                    | Pass   |
| Three + React TSL nodes          | Dispatched the Digit2 effect-selection path and advanced frames                                                                                                                      | Pass   |
| Three + React starters           | Waited for loader removal and the fullscreen affordance, exercised the canvas pointer path; the React starter's freshly built production output received an additional browser check | Pass   |

## Method notes

- Vitexec `0.2.0` injected the runtime assertions without modifying application source. System Chrome was adopted explicitly because these are WebGPU surfaces.
- Benchmark examples used `bench=1`, seed `12648430`, fixed delta `16.666`, 10 knights, or 5 slimes plus 5 lights. The verifier rejected an ungated initial simulation or mismatched requested/actual counts.
- The React starter's configured React Compiler plugin and Vitexec's injected top-level module conflict when combined in one development transform. The source-mode interaction therefore used Vite's neutral TSX transform. A fresh build with the real compiler configuration then passed a separate headed-Chrome production-output check with loader removal, canvas interaction, advancing frames, fullscreen affordance, and no application error.
- The two lighting logs retain a cancelled `HEAD` probe for the optional baked normal-map sibling during context teardown. Both fixtures reached deterministic frame 15, retained the requested five lights, emitted no page error, and rendered the expected lit dungeon. The cancellation is teardown evidence, not a failed asset or application request.
- The archive includes all 29 reviewed PNGs (28 Vitexec states plus the React starter production state), per-surface logs, the machine-readable result file, and the exact external verifier sources.

This walkthrough supplements the cache-bypassed typecheck, build, and typed-lint matrix for all 28 surfaces. It is a release-freeze gate, not a per-commit CI workload.
