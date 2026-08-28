---
'create-three-flatland': patch
---

docs: trim the README to the install commands and the template table. The usage
section restated what the interactive CLI already asks and what `--help` already
documents, including a flag table that described `--overwrite` as scaffolding
into a non-empty directory rather than emptying it first. `--help` is accurate,
so the README no longer duplicates it. Adds the `bun create` form.
