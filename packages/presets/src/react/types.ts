import type { LightEffectElement, EffectElement } from 'three-flatland/react'
import type { DefaultLightEffect } from '../lighting/DefaultLightEffect'
import type { DirectLightEffect } from '../lighting/DirectLightEffect'
import type { SimpleLightEffect } from '../lighting/SimpleLightEffect'
import type { RadianceLightEffect } from '../lighting/RadianceLightEffect'
import type { NormalMapProvider } from '../lighting/NormalMapProvider'

declare module '@react-three/fiber' {
  interface ThreeElements {
    defaultLightEffect: LightEffectElement<typeof DefaultLightEffect>
    directLightEffect: LightEffectElement<typeof DirectLightEffect>
    simpleLightEffect: LightEffectElement<typeof SimpleLightEffect>
    radianceLightEffect: LightEffectElement<typeof RadianceLightEffect>
    normalMapProvider: EffectElement<typeof NormalMapProvider>
  }
}
