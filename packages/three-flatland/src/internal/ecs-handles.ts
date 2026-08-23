declare const entityHandleBrand: unique symbol
declare const worldHandleBrand: unique symbol
declare const traitHandleBrand: unique symbol
declare const registryHandleBrand: unique symbol

/** Opaque reference to a world-local Flatland entity. */
export type EntityHandle = number & { readonly [entityHandleBrand]: true }

/** Opaque reference to Flatland's private entity world. */
export interface WorldHandle {
  readonly [worldHandleBrand]: true
}

/** Opaque reference to a trait owned by Flatland's private entity runtime. */
export interface TraitHandle {
  readonly [traitHandleBrand]: true
}

/** Opaque reference to Flatland's renderer/scene orchestration registry. */
export interface RegistryHandle {
  readonly [registryHandleBrand]: true
}
