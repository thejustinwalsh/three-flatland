import { describe, expect, it } from 'vitest'
import { parseToneSynthArgsText } from './toneSynthResolver'

const PITCHED_CLASSES = [
  'Synth',
  'AMSynth',
  'FMSynth',
  'DuoSynth',
  'MembraneSynth',
  'MetalSynth',
  'PluckSynth',
] as const

describe('parseToneSynthArgsText', () => {
  it.each(PITCHED_CLASSES)('parses %s note/duration happy path', (synthType) => {
    const result = parseToneSynthArgsText("'C4', '8n'", synthType, undefined, 'cfg')
    expect(result).toEqual({ synthType, note: 'C4', duration: '8n' })
  })

  it('parses NoiseSynth as duration-only, no note', () => {
    const result = parseToneSynthArgsText("'8n'", 'NoiseSynth', undefined, 'cfg')
    expect(result).toEqual({ synthType: 'NoiseSynth', duration: '8n' })
  })

  it('parses a PolySynth chord with an explicit voice type', () => {
    const result = parseToneSynthArgsText("['C4', 'E4', 'G4'], '4n'", 'PolySynth', 'FMSynth', 'cfg')
    expect(result).toEqual({
      synthType: 'PolySynth',
      voiceType: 'FMSynth',
      note: ['C4', 'E4', 'G4'],
      duration: '4n',
    })
  })

  it('parses a PolySynth chord with no explicit voice type', () => {
    const result = parseToneSynthArgsText("['C4', 'E4'], '4n'", 'PolySynth', undefined, 'cfg')
    expect(result).toEqual({
      synthType: 'PolySynth',
      note: ['C4', 'E4'],
      duration: '4n',
    })
  })

  it('accepts numeric note/duration literals, not just strings', () => {
    const result = parseToneSynthArgsText('261.6, 0.5', 'Synth', undefined, 'cfg')
    expect(result).toEqual({ synthType: 'Synth', note: 261.6, duration: 0.5 })
  })

  it('tolerates prettier-style spacing around args', () => {
    const result = parseToneSynthArgsText("'C4' , '8n'", 'Synth', undefined, 'cfg')
    expect(result).toEqual({ synthType: 'Synth', note: 'C4', duration: '8n' })
  })

  it('ignores a trailing time argument beyond what the signature requires', () => {
    const result = parseToneSynthArgsText("'C4', '8n', 0.5", 'Synth', undefined, 'cfg')
    expect(result).toEqual({ synthType: 'Synth', note: 'C4', duration: '8n' })
  })

  it('refuses a non-static (identifier) note', () => {
    const result = parseToneSynthArgsText("note, '8n'", 'Synth', undefined, 'cfg')
    expect('loadError' in result).toBe(true)
  })

  it('refuses a non-static (identifier) duration', () => {
    const result = parseToneSynthArgsText("'C4', dur", 'Synth', undefined, 'cfg')
    expect('loadError' in result).toBe(true)
  })

  it('refuses a non-static NoiseSynth duration', () => {
    const result = parseToneSynthArgsText('dur', 'NoiseSynth', undefined, 'cfg')
    expect('loadError' in result).toBe(true)
  })

  it('refuses a PolySynth chord with a non-static element', () => {
    const result = parseToneSynthArgsText("['C4', note], '4n'", 'PolySynth', undefined, 'cfg')
    expect('loadError' in result).toBe(true)
  })

  it('refuses a PolySynth chord that is not an array', () => {
    const result = parseToneSynthArgsText("'C4', '4n'", 'PolySynth', undefined, 'cfg')
    expect('loadError' in result).toBe(true)
  })

  it('refuses an empty PolySynth chord', () => {
    const result = parseToneSynthArgsText("[], '4n'", 'PolySynth', undefined, 'cfg')
    expect('loadError' in result).toBe(true)
  })

  it('refuses malformed argument text', () => {
    expect('loadError' in parseToneSynthArgsText("'C4', '8n", 'Synth', undefined, 'cfg')).toBe(true)
    expect('loadError' in parseToneSynthArgsText('', 'Synth', undefined, 'cfg')).toBe(true)
  })

  it('includes the label in the loadError message', () => {
    const result = parseToneSynthArgsText('note, dur', 'Synth', undefined, 'playTone')
    expect('loadError' in result && result.loadError).toContain('playTone')
  })
})
