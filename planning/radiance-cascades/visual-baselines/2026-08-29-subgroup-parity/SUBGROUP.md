# Subgroup backend parity gate

## Fixture

The deterministic fixture and settings are recorded in `HDDA.md`.

## Judgments

| Candidate | Status | Evidence |
| --- | --- | --- |
| `workgroup.png` | approved | User judged fragment and workgroup visually identical. Energy delta −0.0018%; 0.059% pixels changed; dark coverage delta −0.0039 percentage points. |
| `subgroup-broken.png` | rejected-regression | User saw different final lighting. It loses 74.1% scene energy, leaves 98.7% of pixels dark, and changes 93.4% of pixels. |
| `subgroup-no-collective.png` | experimental evidence | Dense one-job-per-invocation scheduling restores workgroup parity, isolating the defect to subgroup queue scheduling rather than shared RC math. |
| `subgroup-noop-broadcast.png` | experimental evidence | A dense kernel containing a subgroup broadcast remains at parity, showing that subgroup support itself is not sufficient to reproduce the failure. |
| `subgroup-fallback.png` | approved safe behavior | Explicit subgroup selection resolves to the validated workgroup path with `subgroup-parity-disabled`. Energy delta +0.106%; changed pixels 0.35%; the small delta is below visual significance and includes capture-to-capture residuals. |

## Root cause and disposition

The subgroup persistent atomic scheduler fails output parity and drops most atlas work. Dense workgroup and dense subgroup-instruction diagnostics preserve parity, so shared RC math and basic subgroup support are exonerated. The public subgroup request remains quarantined to workgroup until the scheduler has a rendered/readback parity test.

GPU timing previously reported only render timestamps. RC compute time is now added to render time before any performance judgment.

## Acceptance rule learned

A renderer capability bit only permits compilation. Every scheduling specialization must pass a deterministic rendered-frame or texture-readback parity gate before `auto` can select it. Large energy loss with preserved direct emitters is missing transport, not an exposure or tuning problem.
