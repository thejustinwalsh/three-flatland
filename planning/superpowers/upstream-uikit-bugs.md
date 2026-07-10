# Upstream bug report — `pmndrs/uikit`

Three defects found while forking `pmndrs/uikit` into `@three-flatland/uikit`. All three
were surfaced by a stricter ESLint config (`@typescript-eslint/no-for-in-array`,
`no-unused-expressions`), verified by reading the code, and are present at upstream HEAD
**`0d4d887`** (2026-06-18).

None is a vendoring artifact. **Not yet filed — needs stakeholder sign-off, since filing on
a third-party repository is an outward-facing action.**

---

## 1. Conditional properties (`hover`, `dark`, `active`, `focus`, breakpoints) are never applied

**`packages/uikit/src/components/classes.ts:115`**

```ts
for (const conditionalKey in conditionalKeys) {
```

`conditionalKeys` is an **array** (`packages/uikit/src/properties/conditional.ts:104`):

```ts
export const conditionalKeys = ['dark', 'hover', 'active', 'focus', ...breakPointKeys]
```

`for...in` over an array enumerates its **indices as strings** — `'0'`, `'1'`, `'2'`, … — not
its elements. So inside `getStarProperties`, `conditionalKey` is `'0'` rather than `'dark'`,
and the subsequent `properties[conditionalKey]` lookup reads `properties['0']`, which is
always `undefined`.

**Impact:** the `*` (star) property path never picks up _any_ conditional properties. Hover,
dark-mode, active, focus, and every breakpoint variant are silently dropped. Nothing throws;
styles simply never apply.

**Fix:** `for (const conditionalKey of conditionalKeys)`.

---

## 2. `ClassList` iteration yields array indices, not class entries

**`packages/uikit/src/components/classes.ts:16`**

```ts
*[Symbol.iterator]() {
  for (const entry in this.list) {
    if (entry != null) {
      yield entry
    }
  }
}
```

`this.list` is declared `private list: Array<InProperties | string | undefined> = []`
(`classes.ts:9`). Again `for...in` walks indices, so the iterator yields the strings `'0'`,
`'1'`, `'2'`, … instead of the stored class entries.

Two consequences:

- Any consumer doing `for (const c of classList)` receives index strings.
- The `if (entry != null)` guard was evidently intended to skip `undefined` holes in the
  list. It can never fire — an index string is never `null` or `undefined` — so the guard is
  dead and the skip never happens.

**Fix:** `for (const entry of this.list)`. The `!= null` guard then does what it was written
to do.

---

## 3. Disabled buttons never get their disabled subtext colour

**`packages/kits/horizon/core/src/button/label-subtext.ts:41`**

```ts
if (button.properties.value.disabled === true) {
  theme.component.button[button.properties.value.variant ?? 'primary'].subtext.disabled.value
}
```

The disabled colour is computed and then discarded — it is an expression statement, not a
`return`. Control falls through to the default-colour return below.

**Impact:** a disabled Horizon button renders its subtext in the enabled colour.

**Fix:** add the missing `return`.

---

## Suggested filing

One issue per bug, or a single issue with three sections. Bugs 1 and 2 share a root cause
(`for...in` over an array) and a one-line fix each; they would be a natural single PR
alongside enabling `@typescript-eslint/no-for-in-array`, which is what caught them.

Bug 1 is the consequential one: it means conditional styling has never worked through the
star-property path, and it fails silently.
