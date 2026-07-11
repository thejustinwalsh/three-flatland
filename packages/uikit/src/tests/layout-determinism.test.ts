import { expect } from 'chai'
import { beforeAll } from 'vitest'
import { type Yoga, loadYoga } from 'yoga-layout/load'
import {
  SHIPPED,
  buildHeadsUp,
  deriveRelativeCenter,
  formatSweep,
  fuzzCorpus,
  measureDerivationIsolation,
  measureGatedJitterDrift,
  measureIdempotency,
  measureJitterDrift,
  measureRawYogaIdempotency,
  namedShapes,
  sweepCombos,
} from './layout-determinism.js'
import { quantize } from '../quantize.js'

/**
 * Yoga layout determinism harness — the "UI swimming" / "Heads up" crawl (task #11).
 * Layout must be a pure, idempotent function of its inputs; the fix quantizes both the
 * Yoga grid and our JS derivations onto the exactly-representable 1/128 grid.
 */

const N = 150
const JITTER = 0.0025

let yoga: Yoga

beforeAll(async () => {
  yoga = await loadYoga()
})

describe('layout determinism', () => {
  // The load-bearing finding: with 1/128 grid-clean inputs, does Yoga's incremental
  // relayout produce byte-identical output, or does its cache dither?
  it('raw Yoga is byte-stable at the 1/128 grid (the fix rests on this)', () => {
    for (const [name, builder] of Object.entries(namedShapes)) {
      const at128 = measureRawYogaIdempotency(yoga, builder, 128, N)
      const at100 = measureRawYogaIdempotency(yoga, builder, 100, N)
      console.log(
        `raw ${name.padEnd(11)} 128: distinct=${at128.distinct} byteStable=${at128.byteStable}` +
          `  |  100: distinct=${at100.distinct} byteStable=${at100.byteStable}`
      )
      expect(at128.byteStable, `raw Yoga @128 byte-stable for ${name}`).to.equal(true)
    }
  })

  // Invariant A — the permanent regression guard for the crawl.
  it('idempotency: shipped config is byte-stable over N relayouts for every stress shape', () => {
    for (const [name, builder] of Object.entries(namedShapes)) {
      const result = measureIdempotency(yoga, builder, SHIPPED, N)
      console.log(
        `idempotent ${name.padEnd(11)} distinct=${result.distinct} maxDevCells=${result.maxDevCells.toFixed(4)}`
      )
      expect(result.byteStable, `${name} byte-stable over ${N} relayouts`).to.equal(true)
      expect(result.maxDevCells, `${name} zero drift at the 128 quantum`).to.equal(0)
    }
  })

  // Fidelity: the harness read-side derivation IS production `quantize()` under SHIPPED.
  it('harness SHIPPED derivation matches production quantize()', () => {
    const samples: Array<[number, number, number, number, number, number]> = [
      [31.4, 0, 84.73, 17.31, 311.11, 23.73],
      [0, 5.5, 129.47, 21.83, 407.53, 263.19],
      [12.9, 3.1, 55.2, 18.47, 301.29, 97.61],
    ]
    for (const [x, y, w, h, pw, ph] of samples) {
      const got = deriveRelativeCenter(x, y, w, h, pw, ph, SHIPPED)
      const expected: [number, number] = [
        quantize(x + w * 0.5 - pw * 0.5),
        quantize(-(y + h * 0.5 - ph * 0.5)),
      ]
      expect(got).to.deep.equal(expected)
    }
  })

  // Pins that the drift can only enter through Yoga output variation, not the JS math.
  it('the read-side derivation is a pure function (byte-stable in isolation)', () => {
    expect(measureDerivationIsolation(SHIPPED, N).byteStable).to.equal(true)
  })

  // Informational A/B (gate BYPASSED, forced relayout every pass): grid x direction x
  // boundary x dead-band. Shows the raw pipeline's jitter-sensitivity — the ceil-write flip
  // leaks regardless of grid (it scales with jitter/cell, orthogonal to representability),
  // and only the dead-band fully suppresses it. In production the measure gate (below)
  // rejects this jitter upstream, so the dead-band stays a documented fallback.
  it('A/B sweep (informational) — measured-row under forced sub-cell jitter', () => {
    const corpus = fuzzCorpus(48)
    const rows = sweepCombos(yoga, corpus, JITTER, 120)
    console.log(
      '\n' + formatSweep(`measured-row fuzz (n=${corpus.length}, jitter=±${JITTER})`, rows)
    )

    // The dead-band fallback fully stabilizes the write-only pipeline at both grids.
    const fallback = rows.find((r) => r.boundary === 'write' && r.deadBand)
    expect(fallback?.result.byteStable, 'write + dead-band byte-stable across corpus').to.equal(
      true
    )
  })

  // Production model: the nearEqual measure gate rejects sub-cell re-measurement noise
  // before it reaches the pipeline — the shipped fix, no dead-band. Byte-stable everywhere.
  it('measure gate rejects sub-cell jitter — byte-stable across the corpus, no dead-band', () => {
    const corpus = fuzzCorpus(48)
    let drifting = 0
    for (const sizes of corpus) {
      if (!measureGatedJitterDrift(yoga, sizes, SHIPPED, JITTER, N).byteStable) {
        drifting++
      }
    }
    console.log(`gated corpus drift: ${drifting}/${corpus.length}`)
    expect(drifting, 'gated corpus fully byte-stable').to.equal(0)
  })

  // Direct confirmation on the named "Heads up" fixture (ungated) with the shipped config.
  it('"Heads up" fixture is byte-stable under jitter with the shipped config', () => {
    const result = measureJitterDrift(yoga, buildHeadsUp, SHIPPED, JITTER, N)
    console.log(
      `headsUp jitter: distinct=${result.distinct} maxDevCells=${result.maxDevCells.toFixed(4)}`
    )
    expect(result.byteStable).to.equal(true)
  })
})
