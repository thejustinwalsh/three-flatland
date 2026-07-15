import encode from '@jsquash/webp/encode'

const root = document.getElementById('root')!
root.textContent = 'Encoding…'

async function run() {
  const w = 64
  const h = 64
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 200
    data[i + 1] = 100
    data[i + 2] = 50
    data[i + 3] = 255
  }
  const t0 = performance.now()
  const out = await encode(
    { data, width: w, height: h, colorSpace: 'srgb' } as ImageData,
    { quality: 80 },
  )
  const ms = performance.now() - t0
  root.textContent = `OK: encoded 64×64 to ${out.byteLength} bytes in ${ms.toFixed(0)}ms — WASM works in webview`
}

run().catch((err) => {
  root.textContent = `FAIL: ${(err as Error).message}`
  console.error(err)
})
