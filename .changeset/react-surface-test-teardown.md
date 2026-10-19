---
"three-flatland": patch
---

Await deferred React test-root cleanup and lazy devtools imports before tearing down the surface-sizing test environment. This prevents asynchronous module loads from outliving the fixture in CI.
