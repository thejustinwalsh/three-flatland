import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  Badge as VanillaBadge,
  type BadgeProperties as VanillaBadgeProperties,
} from '@three-flatland/uikit-horizon'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { Badge as VanillaBadge } from '@three-flatland/uikit-horizon'

export type BadgeProperties = VanillaBadgeProperties & ClassListProperties

export const Badge: ForwardRefExoticComponent<
  PropsWithoutRef<BadgeProperties> & RefAttributes<VanillaBadge>
> = /* @__PURE__ */ build<VanillaBadge, BadgeProperties>(VanillaBadge, 'VanillaHorizonBadge')
