// Ambient type declarations for Vite's `?worker` import suffix. The
// preview package is consumed as source by tools that build with Vite,
// so the suffix is resolved at the consumer's build time.

declare module '*?worker' {
  const WorkerCtor: { new (options?: { name?: string }): Worker }
  export default WorkerCtor
}

declare module '*?worker&inline' {
  const WorkerCtor: { new (options?: { name?: string }): Worker }
  export default WorkerCtor
}
