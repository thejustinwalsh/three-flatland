# TSL Compute Shaders Reference

## Storage Buffer Types

```ts
import { storage, instanceIndex, Fn, vec4 } from 'three/tsl'

// storage() overloads by type string:
// storage(attr, 'float', count) → StorageBufferNode<'float'>
// storage(attr, 'vec2', count)  → StorageBufferNode<'vec2'>
// storage(attr, 'vec3', count)  → StorageBufferNode<'vec3'>
// storage(attr, 'vec4', count)  → StorageBufferNode<'vec4'>
```

## Basic Compute (Standalone)

```ts
const count = 1024
const array = new Float32Array(count * 4)
const bufferAttribute = new THREE.StorageBufferAttribute(array, 4)
const buffer = storage(bufferAttribute, 'vec4', count)

const computeShader = Fn(() => {
  const idx = instanceIndex
  const data = buffer.element(idx)
  buffer.element(idx).assign(data.mul(2))
})().compute(count)

// Execute
renderer.compute(computeShader)              // synchronous (per-frame)
await renderer.computeAsync(computeShader)   // async (heavy one-off tasks)
```

## Compute to Render Pipeline

Use `StorageInstancedBufferAttribute` with `storage()` for writing and `attribute()` for reading:

```ts
const COUNT = 1000

// 1. Create storage attribute
const dataArray = new Float32Array(COUNT * 4)
const dataAttribute = new THREE.StorageInstancedBufferAttribute(dataArray, 4)

// 2. Storage node for compute (write access)
const dataStorage = storage(dataAttribute, 'vec4', COUNT)

// 3. Compute shader
const computeShader = Fn(() => {
  const idx = instanceIndex
  const current = dataStorage.element(idx)
  const newValue = current.xyz.add(vec3(0.01, 0, 0))
  dataStorage.element(idx).assign(vec4(newValue, current.w))
})().compute(COUNT)

// 4. Attach to geometry for rendering
const geometry = new THREE.BufferGeometry()
geometry.setAttribute('instanceData', dataAttribute)

// 5. Read in material via attribute() — NOT storage()
const material = new THREE.MeshBasicNodeMaterial()
material.positionNode = Fn(() => {
  const data = attribute<'vec4'>('instanceData', 'vec4')
  return positionLocal.add(data.xyz)
})()

// 6. Create mesh and animate
const mesh = new THREE.InstancedMesh(geometry, material, COUNT)
scene.add(mesh)

await renderer.init()
function animate() {
  renderer.compute(computeShader)
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}
animate()
```

## Updating Buffers from JavaScript

```ts
for (let i = 0; i < COUNT; i++) {
  dataArray[i * 4] = Math.random()
}
dataAttribute.needsUpdate = true
```
