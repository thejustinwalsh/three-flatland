# HRC Visual Review Log

This log is the review gate for Holographic Radiance Cascades changes. Every
accepted shader/math change must be isolated, committed atomically, captured with
vitexec, and recorded here before the next change.

## Review Protocol

1. Start from a clean or intentionally documented worktree.
2. Make one paper-aligned implementation change.
3. Run typecheck and focused tests.
4. Commit only that change.
5. Capture RC and HRC screenshots with the same vitexec setup.
6. Record commit, screenshots, metrics, performance, and visual verdict.
7. Stop for user review after about 10 assistant turns, or sooner if quality
   regresses.

No uncommitted shader probes count as accepted progress. Rejected probes must be
reverted or parked before the next accepted commit.

## Current Baseline

| Item | Value |
| --- | --- |
| Branch | `pr-72-radiance-cascades` |
| Reference screenshot | `planning/experiments/hrc-review-captures/000-reference-rc.png` |
| Current Holographic screenshot | `planning/experiments/hrc-review-captures/001-current-holographic.png` |
| Current visual issue | Holographic is faster but has repeated/banded shadow structure versus RC. |
| Current verdict | Not RC parity. Do not optimize further until the paper mapping is audited. |

## Captures

### 000 - RC Reference

| Field | Value |
| --- | --- |
| Screenshot | `planning/experiments/hrc-review-captures/000-reference-rc.png` |
| Algorithm | Conventional RC |
| Settings | comparison baseline, cap 512, intensity 0.005, warm 6.1, cool 9.7 |
| Visual verdict | Reference. Clean continuous penumbrae; no repeated blocker silhouettes. |

### 001 - Current Holographic Baseline

| Field | Value |
| --- | --- |
| Screenshot | `planning/experiments/hrc-review-captures/001-current-holographic.png` |
| Algorithm | HRC Holographic |
| Settings | comparison baseline, cap 512, intensity 0.005, warm 6.1, cool 9.7 |
| Estimated sample count | 4,980,736 |
| Visual verdict | Faster than RC but not accepted: visible banding/repeated shadow structure. |

### 002 - Rejected Readout Offset Probe

| Field | Value |
| --- | --- |
| Screenshot | `planning/experiments/hrc-review-captures/002-rejected-readout-offset.png` |
| Change | Reintroduced `R0([x + 1, y], 0)` readout offset without fully realigning the coordinate system. |
| Estimated sample count | 4,980,736 |
| Visual verdict | Rejected. Still banded and not RC-like. Reverted. |

### 003 - Rejected Paper-Resolution Probe

| Field | Value |
| --- | --- |
| Screenshot | `planning/experiments/hrc-review-captures/003-rejected-paper-resolution.png` |
| Change | Temporarily made Holographic output use full `cascadeResolution` grid. |
| Estimated sample count | 79,691,776 |
| Visual verdict | Rejected as a standalone change. More expensive and still structurally wrong, which means surrounding mapping is still incorrect. Reverted. |

### 004 - Rejected Offset + Mirror-Origin Probe

| Field | Value |
| --- | --- |
| Screenshot | `planning/experiments/hrc-review-captures/004-rejected-offset-mirror.png` |
| Change | Combined readout offset with mirrored quadrant origin adjustment. |
| Estimated sample count | 79,691,776 |
| Visual verdict | Rejected as a standalone change. Did not remove the repeated/banded shadow issue. Reverted. |

## Next Required Audit

Before the next shader edit, fill in an equation-to-code table for:

| Paper item | Required behavior | Current code location | Status |
| --- | --- | --- | --- |
| Eq. 13 | Cone angular arc `A_n(i)` from `v_n(i +/- 1/2)` | TBD | TBD |
| Eq. 14 | Odd-`x` radiance merge via `T_n(p, i +/- 1/2)` and `R_{n+1}(q, j)` | TBD | TBD |
| Eq. 15-17 | Even-`x` radiance average of direct child and traced child | TBD | TBD |
| Eq. 18 | Even transfer merge `T_n(p,k)` with `T_n(p + v_n(k), k)` | TBD | TBD |
| Eq. 20 | Odd transfer averaged merge of neighboring directions | TBD | TBD |
| Algorithm 1 Lighting | Four rotated quadrants and final `R0([x + 1, y], 0)` | TBD | TBD |
| Eq. 21 | 1px opacity-aware cross blur after quadrant sum | TBD | TBD |

