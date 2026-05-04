// Vite-style worker import declarations. Ambient module declarations so
// TypeScript accepts the `?worker&inline` query suffix without us taking
// a runtime dependency on `vite/client.d.ts`. Mirrors the public contract
// Vite ships in `vite/client`:
//
//   import Ktx2Worker from './ktx2-worker?worker&inline'
//   const worker = new Ktx2Worker()
//
// At build time the bundler (Vite, rolldown/tsdown, webpack 5+ with worker
// plugin) walks the worker file's import graph and emits a self-contained
// blob URL Worker constructor as the default export. Other bundlers may
// fail at module resolution; Ktx2Loader's worker path catches that and
// falls back to inline transcode.

declare module '*?worker&inline' {
  const WorkerCtor: { new (options?: { name?: string }): Worker }
  export default WorkerCtor
}

declare module '*?worker' {
  const WorkerCtor: { new (options?: { name?: string }): Worker }
  export default WorkerCtor
}
