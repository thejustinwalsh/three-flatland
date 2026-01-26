# Documentation Audit Skill

> **Purpose:** Ensure documentation code samples are accurate and reflect the actual library API.
> **Core Principle:** Docs should be derived from working examples, not theoretical code.

---

## When to Use This Skill

Use `/docs-audit` when:
- Updating documentation after API changes
- Adding new features that need documentation
- Preparing for a release
- User reports incorrect documentation
- Periodic maintenance checks

---

## Audit Process

### 1. Identify Files to Audit

**Documentation files (code samples):**
```
docs/src/content/docs/getting-started/*.mdx
docs/src/content/docs/guides/*.mdx
docs/src/content/docs/examples/*.mdx
```

**Source of truth (working examples):**
```
examples/vanilla/*/main.ts
examples/react/*/App.tsx
packages/core/src/**/*.ts (for API verification)
```

### 2. Cross-Reference Mapping

| Doc File | Reference Example | What to Check |
|----------|-------------------|---------------|
| `quick-start.mdx` | `examples/vanilla/basic-sprite/main.ts`, `examples/react/basic-sprite/App.tsx` | Basic usage pattern |
| `guides/sprites.mdx` | `examples/*/basic-sprite/*` | Sprite2D API |
| `guides/animation.mdx` | `examples/*/animation/*` | AnimatedSprite2D API |
| `guides/batch-rendering.mdx` | `examples/*/batch-demo/*` | Renderer2D, Sprite2DMaterial API |
| `guides/tilemaps.mdx` | `examples/*/tilemap/*` | TileMap2D, loaders API |
| `guides/tsl-nodes.mdx` | `examples/*/tsl-nodes/*` | TSL node functions |

### 3. Verification Checklist

For each code sample, verify:

- [ ] **Import paths** - Correct package names (`@three-flatland/core` vs `@three-flatland/react`)
- [ ] **Class names** - Match actual exports (e.g., `TileMap2D` not `Tilemap`)
- [ ] **Constructor signatures** - Options match actual implementation
- [ ] **Method names** - Exact method names (e.g., `play()` not `playAnimation()`)
- [ ] **Property names** - Singular vs plural, exact spelling
- [ ] **Function signatures** - Parameters and return types
- [ ] **JSX component names** - Lowercase with proper extends
- [ ] **Three.js and React examples** - Ensure we provide code samples for both frameworks, using the framework key in tabs. Sample code should follow framework best-practices, and produce the same results when run.

### 4. Common Discrepancies to Watch

| Category | Common Issue | How to Fix |
|----------|--------------|------------|
| Imports | Wrong package | Check `packages/*/src/index.ts` exports |
| Class names | Hypothetical names | Check actual class exports |
| Properties | `sprite.layers` vs `sprite.layer` | Check class definition |
| Methods | Missing or renamed | Check class definition |
| Options | Different option names | Check constructor/factory signature |
| TSL nodes | Wrong package/names | Nodes are in `@three-flatland/core`, not `@three-flatland/nodes` |

---

## Fixing Discrepancies

### Priority Order

1. **Critical:** Completely wrong API (will cause errors)
2. **High:** Wrong import paths or package names
3. **Medium:** Incorrect option names or signatures
4. **Low:** Minor naming inconsistencies

### Fix Strategy

1. **Read the actual example** - Working code is ground truth
2. **Check the source** - Verify in `packages/core/src/`
3. **Update docs** - Make minimal changes to match reality
4. **Test examples** - Run `pnpm dev` to verify examples work

---

## API Reference Files

The API reference docs are auto-generated. Don't manually edit:
```
docs/src/content/docs/api/**/*.md
```

Instead, fix JSDoc comments in the source code and regenerate.

---

## Quick Commands

```bash
# Run all examples to verify they work
pnpm dev

# Run specific example
pnpm --filter=example-vanilla-basic-sprite dev

# Check what's exported from core
grep -r "^export" packages/core/src/index.ts packages/core/src/*/index.ts

# Find all TSL node exports
grep -r "^export.*function" packages/core/src/nodes/
```

---

## Package Export Summary

### @three-flatland/core

- Core API exposing 2D classes for three.js, TSL nodes, and utilities
- Includes dependencies from three.js

### @three-flatland/react

- Re-exports everything from `@three-flatland/core`
- Type augmentation for R3F (`sprite2D`, `renderer2D`, etc.)

### @three-flatland/nodes

- Currently placeholder only (VERSION export)
- All TSL nodes are in `@three-flatland/core`

---

## Audit Report Template

When reporting audit findings:

```markdown
## Documentation Audit Report

**Date:** YYYY-MM-DD
**Files Audited:** X documentation files
**Discrepancies Found:** Y

### Critical Issues
1. [File] Line X: Issue description
   - Current: `incorrect code`
   - Should be: `correct code`
   - Reference: `path/to/example.ts:lineNum`

### High Priority
...

### Medium Priority
...

### Low Priority
...

### Verified Correct
- [File] - All code samples verified
```
