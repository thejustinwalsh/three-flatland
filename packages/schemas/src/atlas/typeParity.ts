// Structural comparison between atlas.schema.json (hand-authored, the
// source of truth) and a JSON Schema independently re-derived from the
// generated `AtlasJson` TS type via ts-json-schema-generator. Two different
// tools, two different JSON Schema dialects (2020-12 `$defs` vs draft-07
// `definitions`) — literal deep-equal is neither achievable nor desirable.
// What actually indicates drift: a property or required field that exists
// on one side and not the other, an enum whose value sets diverge, or a
// referenced shape whose name no longer lines up. That's what this module
// checks.
//
// Deliberately NOT compared (schema-only refinements with no TS
// equivalent — expected to diverge forever, not drift):
//   - `integer` vs `number` (TS has no integer type; normalized away below)
//   - numeric bounds: minimum/maximum/exclusiveMinimum/exclusiveMaximum/
//     minItems/maxItems/minLength/maxLength
//   - the `meta` anyOf(required:[sources] | required:[image]) business rule
//   - key-pattern restrictions inside a map (e.g. Animation.events' numeric-
//     string-only keys) — only the map's *value* shape is compared

type SchemaNode = Record<string, unknown>
type SchemaDefs = Record<string, SchemaNode>

export interface ParityResult {
  ok: boolean
  errors: string[]
}

/** Flatten atlas.schema.json into a canonical name -> shape map. */
export function buildOurDefs(schema: SchemaNode): SchemaDefs {
  const {
    $defs,
    $schema: _s,
    $id: _i,
    title: _t,
    description: _d,
    ...root
  } = schema as {
    $defs?: SchemaDefs
    [k: string]: unknown
  }
  // `meta`'s real shape is `allOf: [{ $ref: MetaBase }, { anyOf: [...] }]` —
  // rewrite to a plain $ref so the generic comparator treats it like any
  // other referenced def. The anyOf requiredness rule is the documented,
  // TS-inexpressible exception above.
  const properties = { ...(root.properties as SchemaNode) }
  const meta = properties.meta as SchemaNode
  const metaRef = (meta.allOf as SchemaNode[] | undefined)?.[0]
  if (metaRef?.$ref) properties.meta = { $ref: metaRef.$ref }
  return { AtlasJson: { ...root, properties }, ...($defs ?? {}) }
}

/**
 * Flatten a ts-json-schema-generator draft-07 document (generated from the
 * `AtlasJson` type) into the same canonical name -> shape map. MetaBase has
 * no separate definition on this side — the `MetaBase & { [k: string]:
 * unknown }` intersection gets inlined into `AtlasJson.properties.meta` —
 * so it's pulled out here to align with the `ours` side's naming.
 */
export function buildTheirDefs(generated: SchemaNode): SchemaDefs {
  const defs = { ...((generated.definitions as SchemaDefs) ?? {}) }
  const atlasJson = defs.AtlasJson as SchemaNode
  const meta = (atlasJson.properties as SchemaNode)?.meta as SchemaNode
  return { ...defs, MetaBase: meta }
}

function normalizeType(t: unknown): unknown {
  return t === 'integer' ? 'number' : t
}

function refName(node: SchemaNode, prefix: string): string | undefined {
  const ref = node.$ref as string | undefined
  return ref?.startsWith(prefix) ? ref.slice(prefix.length) : undefined
}

/** Extract the value schema of a map-shaped property, however it's encoded. */
function mapValueSchema(node: SchemaNode): SchemaNode | undefined {
  const pattern = node.patternProperties as Record<string, SchemaNode> | undefined
  if (pattern) {
    const values = Object.values(pattern)
    if (values.length === 1) return values[0]
  }
  const additional = node.additionalProperties
  if (additional && typeof additional === 'object' && Object.keys(additional).length > 0) {
    return additional as SchemaNode
  }
  return undefined
}

function isClosed(node: SchemaNode): boolean {
  return node.additionalProperties === false
}

function diffSets(label: string, ours: Set<string>, theirs: Set<string>, errors: string[]): void {
  const onlyOurs = [...ours].filter((x) => !theirs.has(x)).sort()
  const onlyTheirs = [...theirs].filter((x) => !ours.has(x)).sort()
  if (onlyOurs.length) errors.push(`${label}: only in atlas.schema.json — ${onlyOurs.join(', ')}`)
  if (onlyTheirs.length) {
    errors.push(`${label}: only in the generated AtlasJson type — ${onlyTheirs.join(', ')}`)
  }
}

/**
 * Compare atlas.schema.json against a ts-json-schema-generator schema
 * derived from the `AtlasJson` type. Returns every divergence found;
 * `ok` is true iff `errors` is empty.
 */
export function compareAtlasSchemaToType(ourDefs: SchemaDefs, theirDefs: SchemaDefs): ParityResult {
  const errors: string[] = []
  const visited = new Set<string>()

  function compareNamed(name: string, path: string): void {
    if (visited.has(name)) return
    visited.add(name)
    const ours = ourDefs[name]
    const theirs = theirDefs[name]
    if (!ours) {
      errors.push(`${path}: "${name}" is missing from atlas.schema.json`)
      return
    }
    if (!theirs) {
      errors.push(`${path}: "${name}" is missing from the generated AtlasJson type`)
      return
    }
    compareNode(name, ours, theirs)
  }

  function compareNode(path: string, ours: SchemaNode, theirs: SchemaNode): void {
    const ourProps = (ours.properties as SchemaNode) ?? {}
    const theirProps = (theirs.properties as SchemaNode) ?? {}
    const ourKeys = new Set(Object.keys(ourProps))
    const theirKeys = new Set(Object.keys(theirProps))
    diffSets(`${path} properties`, ourKeys, theirKeys, errors)

    const ourReq = new Set((ours.required as string[]) ?? [])
    const theirReq = new Set((theirs.required as string[]) ?? [])
    diffSets(`${path} required`, ourReq, theirReq, errors)

    if (isClosed(ours) !== isClosed(theirs)) {
      errors.push(
        `${path}: additionalProperties closedness mismatch (ours=${isClosed(ours)}, theirs=${isClosed(theirs)})`
      )
    }

    for (const key of ourKeys) {
      if (!theirKeys.has(key)) continue // already reported by diffSets above
      comparePropertySchema(`${path}.${key}`, ourProps[key] as SchemaNode, theirProps[key] as SchemaNode)
    }

    if (ours.type === 'array' || theirs.type === 'array') {
      comparePropertySchema(`${path}[]`, (ours.items as SchemaNode) ?? {}, (theirs.items as SchemaNode) ?? {})
    }
  }

  function comparePropertySchema(path: string, ours: SchemaNode, theirs: SchemaNode): void {
    const ourRef = refName(ours, '#/$defs/')
    const theirRef = refName(theirs, '#/definitions/')
    if (ourRef && theirRef) {
      if (ourRef !== theirRef) {
        errors.push(`${path}: $ref name mismatch (ours=${ourRef}, theirs=${theirRef})`)
        return
      }
      compareNamed(ourRef, path)
      return
    }
    if (ourRef && !theirRef) {
      // Their side inlined this shape — e.g. ts-json-schema-generator
      // flattens the `MetaBase & { [k: string]: unknown }` intersection
      // into `AtlasJson.properties.meta` directly rather than emitting a
      // separate MetaBase definition. Compare our named def against their
      // inline node rather than demanding a $ref on both sides.
      compareNode(`${path} (${ourRef}, inlined on the generated side)`, ourDefs[ourRef]!, theirs)
      return
    }
    if (theirRef && !ourRef) {
      compareNode(`${path} (${theirRef}, inlined in atlas.schema.json)`, ours, theirDefs[theirRef]!)
      return
    }

    if (ours.enum || theirs.enum) {
      diffSets(`${path} enum`, new Set((ours.enum as string[]) ?? []), new Set((theirs.enum as string[]) ?? []), errors)
      return
    }

    if (ours.type === 'array' || theirs.type === 'array') {
      comparePropertySchema(`${path}[]`, (ours.items as SchemaNode) ?? {}, (theirs.items as SchemaNode) ?? {})
      return
    }

    const ourMap = mapValueSchema(ours)
    const theirMap = mapValueSchema(theirs)
    if (ourMap ?? theirMap) {
      if (!ourMap || !theirMap) {
        errors.push(`${path}: map-shape presence mismatch (ours=${!!ourMap}, theirs=${!!theirMap})`)
        return
      }
      comparePropertySchema(`${path}{}`, ourMap, theirMap)
      return
    }

    const ourType = normalizeType(ours.type)
    const theirType = normalizeType(theirs.type)
    if (ourType && theirType && ourType !== theirType) {
      errors.push(`${path}: type mismatch (ours=${String(ours.type)}, theirs=${String(theirs.type)})`)
    }
  }

  compareNamed('AtlasJson', '$root')

  return { ok: errors.length === 0, errors }
}
