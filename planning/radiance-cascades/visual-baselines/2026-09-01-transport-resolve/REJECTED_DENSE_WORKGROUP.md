# Rejected dense workgroup scheduler

## Hypothesis

Replace the persistent atomic atlas-job queue with one direct compute invocation per atlas texel. This removes one counter reset dispatch per cascade, the global atomic increment, and the queue loop.

## Correctness

The deterministic 4px-transport / 2px-resolve capture was pixel-identical to the committed workgroup oracle:

- Energy delta: 0%
- Luma RMSE: 0/255
- Pixels changed above 2/255: 0%
- Maximum luma delta: 0/255

Artifact: `candidate-dense-workgroup-full.jpg`

## Performance judgment

Combined render + compute timestamps on the paused 100-slime fixture:

| Trace cell | Atomic queue median | Dense median | Change | Atomic p95 | Dense p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 4px | 24.12 ms | 28.90 ms | +19.8% slower | 25.89 ms | 38.08 ms |
| 2px | 38.99 ms | 70.06 ms | +79.7% slower | 58.13 ms | 73.27 ms |

## Decision

Rejected and reverted. DDA interval lengths diverge enough that the persistent queue's dynamic job distribution outweighs its atomic/reset overhead. The 2px stress probe makes that unmistakable. Future work should reduce per-ray traversal with conservative HDDA or compact resumable ray chunks; statically assigning one complete variable-length ray per invocation is not an optimization here.
