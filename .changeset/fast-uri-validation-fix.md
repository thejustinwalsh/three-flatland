---
"@three-flatland/schemas": patch
"@three-flatland/vscode": patch
---

Resolve the schema validator's transitive `fast-uri` dependency to 3.1.8, addressing the reported
URI normalization and serialization advisories in the FL Tools dependency closure. The update
stays within Ajv's existing compatible range and changes no validator API or schema definitions.
