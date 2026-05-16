import type { LightEffectElement, EffectElement } from 'three-flatland/react'
import type { DefaultLightEffect } from '../lighting/DefaultLightEffect'
import type { NormalMapProvider } from '../lighting/NormalMapProvider'

declare module '@react-three/fiber' {
  interface ThreeElements {
    defaultLightEffect: LightEffectElement<typeof DefaultLightEffect>
    normalMapProvider: EffectElement<typeof NormalMapProvider>
  }
}
