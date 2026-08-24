---
title: 'Effect vectors require whole-tuple assignment'
slug: 'effect-vector-whole-tuple'
package: 'three-flatland'
version: 'next'
type: 'breaking'
audience: 'consumers'
---

# Effect vectors require whole-tuple assignment

Vector fields on `MaterialEffect`, `LightEffect`, and `PassEffect` instances now return read-only tuple snapshots. Mutating a component changes only that snapshot; assign a complete tuple to publish through the effect's live backing storage.

## Migration

| Before                      | After                                                                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `effect.offset[0] = x`      | `const currentEffect = effect`<br />`const offset = currentEffect.offset`<br />`currentEffect.offset = [x, offset[1]]`                                           |
| `effect.direction[1] += dy` | `const currentEffect = effect`<br />`const direction = currentEffect.direction`<br />`currentEffect.direction = [direction[0], direction[1] + dy, direction[2]]` |
| `light.origin[2]++`         | `const currentLight = light`<br />`const origin = currentLight.origin`<br />`currentLight.origin = [origin[0], origin[1], origin[2] + 1, origin[3]]`             |

Capture the effect receiver and snapshot the current tuple once before evaluating the right-hand side. This preserves every unchanged component and the original evaluation order, including receivers such as `getEffect()`.

## Codemod prompt (LLM-applicable)

You are migrating a TypeScript/JavaScript codebase that uses `three-flatland`. Replace direct component writes to vector-valued `MaterialEffect`, `LightEffect`, and `PassEffect` fields with complete tuple assignment. Do not rewrite ordinary arrays, three.js vectors, or scalar effect fields.

### 1. Discover candidate sites

Search TypeScript and JavaScript source for indexed writes and mutating array methods:

```bash
rg -n '\]\s*(?:(?:\*\*|<<|>>|>>>|\?\?|&&|\|\||[+*/%&|^-])?=|\+\+|--)|(?:\+\+|--)\s*[^;]*\[|\bdelete\s+[^;]*\[|(?:Object\.(?:assign|defineProperties|defineProperty)|Reflect\.(?:defineProperty|deleteProperty|set))\s*\(|\.(?:copyWithin|fill|pop|push|reverse|shift|sort|splice|unshift)\s*\(' \
  --type ts --type js
```

Also search for effect definitions so each candidate field can be traced to its schema:

```bash
rg -n 'create(?:Material|Light|Pass)Effect|extends\s+(?:Material|Light|Pass)Effect' \
  --type ts --type js
```

After identifying the tuple field names in those schemas, search every use of each field, not only indexed writes. Build the alternation from the names found in the consumer project:

```bash
rg -n '\.(?:offset|direction|origin)\b' --type ts --type js
```

Replace the example names above with the project's actual tuple fields. Inspect values passed to helpers or stored in aliases so calls such as `mutate(effect.offset)` are reported even though a generic mutation search cannot infer the helper's behavior.

**Always skip:**

- `node_modules/`
- Build output (`dist/`, `build/`, `.next/`, `out/`, etc.)
- Generated type declarations in build output
- This codemod artifact itself
- Vendored copies of `three-flatland` source

### 2. Verify each candidate is in scope

A write is in scope only when all of these are true:

1. The receiver is an instance of a class returned by `createMaterialEffect`, `createLightEffect`, or `createPassEffect`, or an instance of a subclass of `MaterialEffect`, `LightEffect`, or `PassEffect`.
2. The property being indexed is a numeric tuple field declared by that effect class's schema.
3. The tuple has a statically known length of two, three, or four.
4. The index is a numeric literal within that tuple's bounds.
5. The write is a standalone expression statement. Its assignment or increment result is not consumed by a larger expression.

Trace imports and local class/factory definitions rather than relying on variable names such as `effect` or `light`. If the receiver type, schema field, tuple length, or ownership of the property cannot be proved, `[FLAG]` the site instead of changing it.

**Out of scope:**

- ordinary arrays and tuples unrelated to three-flatland effects;
- three.js `Vector2`, `Vector3`, `Vector4`, `Color`, and their mutable `.x`, `.y`, `.z`, `.w`, or setter APIs;
- scalar effect fields;
- constants returned by effect schema factory functions;
- three-flatland package source vendored into the consumer repository.

### 3. Apply the transformation

For a direct assignment such as:

```ts
effect.offset[0] = expression
```

introduce a uniquely named local snapshot immediately before the statement, then assign a complete tuple with the changed component in the same position:

```ts
const currentEffect = effect
const currentOffset = currentEffect.offset
currentEffect.offset = [expression, currentOffset[1]]
```

Capture the receiver exactly once even when it appears to be a stable identifier. This makes the transformation safe for getters, calls, and other receiver expressions without having to classify their side effects.

For a three- or four-component field, copy every other component from the snapshot in its original order. Preserve the right-hand-side expression verbatim.

For a compound assignment, expand only the changed component using the snapshot:

```ts
const currentEffect = effect
const currentDirection = currentEffect.direction
currentEffect.direction = [currentDirection[0], currentDirection[1] + dy, currentDirection[2]]
```

Apply the corresponding JavaScript operator for `-=`, `*=`, `/=`, `%=` and bitwise/shift assignments. For a standalone prefix or postfix `++`/`--`, use `currentTuple[index] + 1` or `currentTuple[index] - 1`. Choose receiver and snapshot bindings that do not collide with any binding in the surrounding scope.

Preserve comments attached to the original statement. Let the consumer's formatter choose single-line or multiline tuple layout.

**FLAG instead of transforming:**

- a dynamic index such as `effect.offset[index] = value`;
- a string/computed property name whose effect field cannot be resolved statically;
- mutation through an alias or destructured snapshot, such as `const value = effect.offset; value[0] = x`;
- array mutation methods such as `push`, `splice`, `fill`, or `sort`;
- `Object.assign`, reflection, proxies, or dynamic dispatch targeting the tuple;
- an assignment/update whose result is consumed, such as `const old = effect.offset[0]++`;
- logical assignment with `&&=`, `||=`, or `??=`, because an unconditional tuple setter would violate its short-circuit semantics;
- a right-hand side that writes to the same effect field or otherwise makes evaluation-order equivalence uncertain;
- a write nested in a loop header, conditional expression, function argument, return value, or other expression where inserting a preceding snapshot statement changes control flow;
- a standalone write used as the unbraced body of an `if`, `else`, `for`, `while`, or `do` statement, unless the tool can insert a block without changing comments or control flow.

### 4. Update related artifacts

Update the consumer project's current comments and documentation when they instruct users to mutate effect tuple components. Describe whole-tuple assignment instead. Leave historical changelogs and migration notes unchanged.

Report every `[FLAG]` site with its file, line, and reason. Do not silently leave a candidate unreported. The final application report must contain:

1. transformed files and the number of rewrites in each;
2. every `[FLAG]` site with file, line, and reason;
3. deviations from this artifact, including any candidate intentionally left unchanged;
4. the typecheck, test, and discovery-search results.

### 5. Do NOT touch

- `node_modules/`
- Build output directories
- This codemod artifact (the file you are reading)
- Vendored copies of `three-flatland` source
- Unrelated arrays, tuples, and three.js vector objects

## Verification

Run the consumer's normal typecheck and tests:

```bash
npx tsc --noEmit
npm test
```

Repeat the discovery search and inspect every remaining match. The migration is successful when every in-scope, directly transformable component write has become a whole-tuple assignment and every non-transformable effect-vector mutation is listed as `[FLAG]` for human review.

## Edge cases

- **Getter snapshots**: read the tuple once before the replacement assignment; do not repeatedly read components from the effect getter.
- **Tuple length**: derive two, three, or four components from the effect schema. Never infer length from the highest index used at one call site.
- **Nested state**: factory-function constants may themselves expose mutable arrays or objects; this change does not make those constant objects read-only.
- **Dynamic index or alias**: FLAG for human review rather than guessing the intended complete tuple.
- **Mutation methods**: FLAG because changing tuple length or order has no general whole-property equivalent.
- **Expression result use**: FLAG because preserving prefix/postfix assignment-expression values requires a control-flow-aware rewrite.
- **Mocks (`vi.mock`, `jest.mock`)**: transform only consumer behavior whose effect type and schema are still provable; otherwise FLAG.

## Related

- Codemod index: `codemods/README.md`
- Migration guide: `https://tjw.dev/three-flatland/guides/private-ecs-migration/`
- Effect guide: `https://tjw.dev/three-flatland/guides/tsl-nodes/`
