/**
 * glTF-Transform bake helpers.
 *
 * Provides `addColumn` (create a typed accessor on a Document) and
 * `createFLExtension` (factory for a generic `FL_*` root extension that
 * holds plain JSON metadata + named accessor references).
 *
 * All baked numeric data lives in native glTF accessors; no raw bufferViews
 * are used. Accessor indices are resolved in the extension `write()` hook via
 * the public `WriterContext.accessorIndexMap`.
 */

import {
  type Accessor,
  type Buffer,
  type Document,
  Extension,
  ExtensionProperty,
  type Graph,
  type IProperty,
  type Nullable,
  type Property,
  PropertyType,
  type ReaderContext,
  RefMap,
  type WriterContext,
} from '@gltf-transform/core'

// BufferViewUsage.OTHER — referenced by string to avoid dependency on an
// enum that may not be tree-shaken into the dist bundle.
const USAGE_OTHER = 'OTHER'

// ---------------------------------------------------------------------------
// addColumn — create a typed glTF accessor from a TypedArray
// ---------------------------------------------------------------------------

type SupportedTypedArray =
  | Float32Array<ArrayBuffer>
  | Uint16Array<ArrayBuffer>
  | Int16Array<ArrayBuffer>
  | Uint32Array<ArrayBuffer>
  | Uint8Array<ArrayBuffer>
  | Int8Array<ArrayBuffer>

/**
 * Create a named glTF `Accessor` on `doc` backed by `typedArray`.
 *
 * The `componentType` is inferred from the typed-array constructor; `type`
 * must be one of the glTF accessor type strings (`'SCALAR'`, `'VEC2'`, …).
 */
export function addColumn(
  doc: Document,
  buffer: Buffer,
  name: string,
  typedArray: SupportedTypedArray,
  type: string,
): Accessor {
  return doc
    .createAccessor(name)
    .setBuffer(buffer)
    .setType(type as Parameters<Accessor['setType']>[0])
    .setArray(typedArray)
}

// ---------------------------------------------------------------------------
// FLProperty — ExtensionProperty holding metadata + accessor refs
// ---------------------------------------------------------------------------

interface IFLProperty extends IProperty {
  metadata: Record<string, unknown>
  accessorRefs: RefMap<Accessor>
}

/**
 * Root-level `ExtensionProperty` for a `FL_*` extension.
 *
 * Holds arbitrary JSON metadata and a named map of `Accessor` references.
 * Emitted as:
 * ```json
 * { ...metadata, "columns": { "<name>": { "accessor": <index> }, … } }
 * ```
 */
export class FLProperty extends ExtensionProperty<IFLProperty> {
  // These are set dynamically by createFLExtension's subclass.
  public declare extensionName: string
  public declare propertyType: string
  public declare parentTypes: string[]

  protected init(): void {
    // Concrete values assigned by the subclass created in createFLExtension.
  }

  protected getDefaults(): Nullable<IFLProperty> {
    return Object.assign(super.getDefaults() as IProperty, {
      metadata: {},
      accessorRefs: new RefMap<Accessor>(),
    })
  }

  /** Replace the plain JSON metadata object. */
  public setMetadata(meta: Record<string, unknown>): this {
    return this.set('metadata', { ...meta })
  }

  /** Return the plain JSON metadata object. */
  public getMetadata(): Record<string, unknown> {
    return this.get('metadata')
  }

  /**
   * Attach an `Accessor` under a semantic key (e.g. `'a'`, `'advanceWidth'`).
   * The accessor must belong to the same `Document`.
   */
  public setAccessorRef(semantic: string, accessor: Accessor | null): this {
    return this.setRefMap('accessorRefs', semantic, accessor, {
      usage: USAGE_OTHER,
    })
  }

  /** Return the `Accessor` attached under `semantic`, or `null`. */
  public getAccessorRef(semantic: string): Accessor | null {
    return this.getRefMap('accessorRefs', semantic)
  }

  /** List all semantic names that have an accessor attached. */
  public listAccessorSemantics(): string[] {
    return this.listRefMapKeys('accessorRefs')
  }

  /** List all attached `Accessor` objects (same order as `listAccessorSemantics`). */
  public listAccessorRefs(): Accessor[] {
    return this.listRefMapValues('accessorRefs')
  }
}

// ---------------------------------------------------------------------------
// createFLExtension — factory that returns a concrete Extension + Property pair
// ---------------------------------------------------------------------------

/** Return type of `createFLExtension`. */
export interface FLExtensionBundle {
  /** The `Extension` subclass to register with `NodeIO` and attach to a `Document`. */
  ExtClass: typeof Extension & {
    new (doc: Document): FLExtensionInstance
    EXTENSION_NAME: string
  }
}

/** Instance type of the Extension created by `createFLExtension`. */
export interface FLExtensionInstance extends Extension {
  createProperty(metadata: Record<string, unknown>): FLProperty
}

/**
 * Create a pair of glTF-Transform `Extension` + `ExtensionProperty` classes
 * for a named `FL_*` root extension.
 *
 * The emitted JSON shape is:
 * ```json
 * { ...metadata, "columns": { "<semantic>": { "accessor": <index> } } }
 * ```
 *
 * Usage:
 * ```ts
 * const { ExtClass } = createFLExtension('FL_demo')
 * const ext = doc.createExtension(ExtClass).setRequired(true)
 * const prop = ext.createProperty({ kind: 'demo', version: 1 })
 * prop.setAccessorRef('a', accA)
 * doc.getRoot().setExtension('FL_demo', prop)
 * const io = new NodeIO().registerExtensions([ExtClass])
 * const glb = await io.writeBinary(doc)
 * ```
 */
export function createFLExtension(extensionName: string): FLExtensionBundle {
  // ----- Concrete ExtensionProperty subclass -----
  class ConcreteProperty extends FLProperty {
    public static readonly EXTENSION_NAME = extensionName
    public readonly extensionName = extensionName
    public readonly propertyType = extensionName + 'Property'
    public readonly parentTypes = [PropertyType.ROOT]

    protected init(): void {
      // extensionName, propertyType, parentTypes are set as class fields above.
    }
  }

  // ----- Concrete Extension subclass -----
  class ConcreteExtension extends Extension implements FLExtensionInstance {
    public static readonly EXTENSION_NAME = extensionName
    public readonly extensionName = extensionName

    /**
     * Create a new `FLProperty` attached to this extension's document.
     */
    public createProperty(metadata: Record<string, unknown>): FLProperty {
      const prop = new ConcreteProperty(
        this.document.getGraph() as Graph<Property>,
      )
      prop.setMetadata(metadata)
      return prop
    }

    /** @hidden */
    public read(context: ReaderContext): this {
      // Resolve accessor indices back to glTF-Transform Accessor objects.
      // (The browser uses readAsset — this read() path is implemented for
      // completeness / round-trip tooling.)
      const jsonDoc = context.jsonDoc
      if (!jsonDoc.json.extensions?.[extensionName]) return this

      const extJson = jsonDoc.json.extensions[extensionName] as Record<
        string,
        unknown
      >
      const columns = extJson['columns'] as
        | Record<string, { accessor: number }>
        | undefined

      const metadata: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(extJson)) {
        if (k !== 'columns') metadata[k] = v
      }

      const prop = this.createProperty(metadata)
      if (columns) {
        for (const [semantic, { accessor: idx }] of Object.entries(columns)) {
          if (context.accessors[idx]) {
            prop.setAccessorRef(semantic, context.accessors[idx]!)
          }
        }
      }
      this.document.getRoot().setExtension(extensionName, prop)
      return this
    }

    /** @hidden */
    public write(context: WriterContext): this {
      // Find the FLProperty attached to the document root (if any).
      const root = this.document.getRoot()
      const prop = root.getExtension<FLProperty>(extensionName)
      if (!prop) return this

      const metadata = prop.getMetadata()
      const semantics = prop.listAccessorSemantics()

      const columns: Record<string, { accessor: number }> = {}
      for (const semantic of semantics) {
        const acc = prop.getAccessorRef(semantic)
        if (acc !== null) {
          const idx = context.accessorIndexMap.get(acc)
          if (idx !== undefined) {
            columns[semantic] = { accessor: idx }
          }
        }
      }

      const extJson: Record<string, unknown> = { ...metadata }
      if (Object.keys(columns).length > 0) {
        extJson['columns'] = columns
      }

      context.jsonDoc.json.extensions ??= {}
      context.jsonDoc.json.extensions[extensionName] = extJson

      return this
    }
  }

  return { ExtClass: ConcreteExtension as unknown as FLExtensionBundle['ExtClass'] }
}
