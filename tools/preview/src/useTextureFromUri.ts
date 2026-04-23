import { useEffect, useState } from 'react'
import { Texture, NearestFilter, SRGBColorSpace } from 'three'

/**
 * Load a texture from a webview URI string. Returns the Texture once the
 * underlying image resolves. Nearest-filter + sRGB by default — matches
 * three-flatland's pixel-art preset.
 */
export function useTextureFromUri(uri: string | null | undefined): Texture | null {
  const [tex, setTex] = useState<Texture | null>(null)

  useEffect(() => {
    if (!uri) {
      setTex(null)
      return
    }
    let disposed = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (disposed) return
      const t = new Texture(img)
      t.magFilter = NearestFilter
      t.minFilter = NearestFilter
      t.colorSpace = SRGBColorSpace
      t.needsUpdate = true
      setTex(t)
    }
    img.onerror = () => {
      if (!disposed) setTex(null)
    }
    img.src = uri
    return () => {
      disposed = true
    }
  }, [uri])

  return tex
}
