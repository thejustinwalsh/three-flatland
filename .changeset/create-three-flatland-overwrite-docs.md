---
'create-three-flatland': patch
---

docs: correct the `--overwrite` description in the README. It read "Scaffold
into a non-empty target directory", which omits that the flag empties the
directory first. The CLI's own help is accurate ("Empty a non-empty target
directory (preserves .git)") and `scaffold.test.ts` pins the behaviour, so the
README was the only place understating a destructive flag.

Also adds the `bun create` form, which the README never listed.
