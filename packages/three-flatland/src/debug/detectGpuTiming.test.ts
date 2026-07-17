import { describe, expect, it } from 'vitest'
import { detectGpuTimingActive, resolveTrackTimestamp, type GpuTimingProbeBackend } from './detectGpuTiming'

/** WebGPU backend whose device negotiated `timestamp-query`. */
function webgpuSupported(trackTimestamp: boolean): GpuTimingProbeBackend {
  return {
    trackTimestamp,
    constructor: { name: 'WebGPUBackend' },
    device: { features: new Set(['timestamp-query']) },
  }
}

/** WebGPU backend whose device lacks `timestamp-query` (e.g. Safari). */
function webgpuUnsupported(trackTimestamp: boolean): GpuTimingProbeBackend {
  return {
    trackTimestamp,
    constructor: { name: 'WebGPUBackend' },
    device: { features: new Set<string>() },
  }
}

describe('detectGpuTimingActive', () => {
  it('is false when the backend is absent', () => {
    expect(detectGpuTimingActive(undefined)).toBe(false)
  })

  it('is false when trackTimestamp is not enabled', () => {
    expect(detectGpuTimingActive(webgpuSupported(false))).toBe(false)
  })

  it('is true for WebGPU with the feature and tracking on', () => {
    expect(detectGpuTimingActive(webgpuSupported(true))).toBe(true)
  })

  it('is false for WebGPU without the feature', () => {
    expect(detectGpuTimingActive(webgpuUnsupported(true))).toBe(false)
  })

  it('is optimistic for WebGPU pre-init (no device yet)', () => {
    expect(detectGpuTimingActive({ trackTimestamp: true, constructor: { name: 'WebGPUBackend' } })).toBe(true)
  })

  it('keys WebGL off the disjoint extension', () => {
    const base = { trackTimestamp: true, constructor: { name: 'WebGLBackend' } }
    expect(detectGpuTimingActive({ ...base, disjoint: {} })).toBe(true)
    expect(detectGpuTimingActive({ ...base, disjoint: null })).toBe(false)
    expect(detectGpuTimingActive(base)).toBe(false)
  })
})

describe('resolveTrackTimestamp', () => {
  it('leaves an unattached backend alone', () => {
    expect(resolveTrackTimestamp(true, undefined)).toBeNull()
    expect(resolveTrackTimestamp(false, undefined)).toBeNull()
  })

  it('turns timing OFF when not wanted, regardless of capability', () => {
    expect(resolveTrackTimestamp(false, webgpuSupported(true))).toBe(false)
    expect(resolveTrackTimestamp(false, webgpuUnsupported(true))).toBe(false)
    expect(resolveTrackTimestamp(false, { trackTimestamp: true })).toBe(false)
  })

  it('turns timing ON when wanted and the device supports it', () => {
    expect(resolveTrackTimestamp(true, webgpuSupported(false))).toBe(true)
  })

  it('refuses to enable when wanted but the device lacks the feature', () => {
    expect(resolveTrackTimestamp(true, webgpuUnsupported(false))).toBe(false)
    // device present but `features` missing entirely
    expect(resolveTrackTimestamp(true, { trackTimestamp: false, device: {} })).toBe(false)
  })

  it('is optimistic when wanted but the device is not ready yet', () => {
    // pre-init WebGPU (no device) and WebGL (never has a GPUDevice) both
    // take the optimistic path; three / the resolve gate correct later.
    expect(resolveTrackTimestamp(true, { trackTimestamp: false })).toBe(true)
    expect(resolveTrackTimestamp(true, { trackTimestamp: false, constructor: { name: 'WebGLBackend' } })).toBe(true)
  })

  it('flips live as demand changes on the same backend (stop/resume)', () => {
    const backend = webgpuSupported(false)
    // collapsed → off
    expect(resolveTrackTimestamp(false, backend)).toBe(false)
    // expanded → on
    expect(resolveTrackTimestamp(true, backend)).toBe(true)
    // collapsed again → off
    expect(resolveTrackTimestamp(false, backend)).toBe(false)
    // expanded again → on
    expect(resolveTrackTimestamp(true, backend)).toBe(true)
  })
})
