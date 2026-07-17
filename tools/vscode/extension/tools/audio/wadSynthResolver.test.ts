import { describe, expect, it } from 'vitest'
import { parseWadSynthLiteralText } from './wadSynthResolver'

describe('parseWadSynthLiteralText', () => {
  it.each(['sine', 'square', 'sawtooth', 'triangle', 'noise'] as const)('parses source: %s', (source) => {
    const result = parseWadSynthLiteralText(`{source:'${source}'}`, 'cfg')
    expect(result).toEqual({ config: { source } })
  })

  it('parses additional simple literal fields as a bonus', () => {
    const result = parseWadSynthLiteralText("{source:'square', attack:0.01, decay:0.1, env:true}", 'cfg')
    expect(result).toEqual({
      config: { source: 'square', attack: 0.01, decay: 0.1, env: true },
    })
  })

  it('tolerates prettier-style spacing around keys and values', () => {
    const result = parseWadSynthLiteralText("{ source: 'noise' }", 'cfg')
    expect(result).toEqual({ config: { source: 'noise' } })
  })

  it('skips a nested-object field without refusing the whole config', () => {
    const result = parseWadSynthLiteralText("{source:'square', filter:{type:'lowpass'}}", 'cfg')
    expect(result).toEqual({ config: { source: 'square' } })
  })

  it('refuses mic as a source', () => {
    const result = parseWadSynthLiteralText("{source:'mic'}", 'cfg')
    expect('loadError' in result).toBe(true)
  })

  it('refuses an unknown source keyword', () => {
    const result = parseWadSynthLiteralText("{source:'bogus'}", 'cfg')
    expect('loadError' in result).toBe(true)
  })

  it('refuses a file-path source', () => {
    const result = parseWadSynthLiteralText("{source:'jump.wav'}", 'cfg')
    expect('loadError' in result).toBe(true)
  })

  it('refuses a non-string source value', () => {
    const result = parseWadSynthLiteralText('{source:5}', 'cfg')
    expect('loadError' in result).toBe(true)
  })

  it('refuses text missing a source key entirely', () => {
    const result = parseWadSynthLiteralText("{reverb:{impulse:'x.wav'}}", 'cfg')
    expect('loadError' in result).toBe(true)
  })

  it('refuses malformed non-object text', () => {
    expect('loadError' in parseWadSynthLiteralText('not an object', 'cfg')).toBe(true)
    expect('loadError' in parseWadSynthLiteralText("{source:'square'", 'cfg')).toBe(true)
    expect('loadError' in parseWadSynthLiteralText('', 'cfg')).toBe(true)
    expect('loadError' in parseWadSynthLiteralText('square', 'cfg')).toBe(true)
  })

  it('includes the label in the loadError message', () => {
    const result = parseWadSynthLiteralText("{source:'mic'}", 'myOsc')
    expect('loadError' in result && result.loadError).toContain('myOsc')
  })

  it('a field value ending in an escaped backslash (an EVEN trailing-backslash run) does not make the object literal look unterminated', () => {
    // Raw source text: {source:'square', label:'a\\'} — label's string
    // literal ends in two backslashes (one escaped backslash pair), then
    // its real closing quote. A one-character lookback at the character
    // before the quote sees a bare backslash and wrongly treats it as
    // still-escaped, corrupting the rest of the split. The parser doesn't
    // unescape — it just strips the surrounding quotes — so the parsed
    // value keeps both raw backslash characters.
    const result = parseWadSynthLiteralText("{source:'square', label:'a\\\\'}", 'cfg')
    expect(result).toEqual({ config: { source: 'square', label: 'a\\\\' } })
  })

  it('a field value ending in a genuinely escaped quote (an ODD trailing-backslash run) is correctly rejected as malformed', () => {
    // Raw source text: {source:'square', label:'a\'} — the lone backslash
    // escapes the quote, so the object literal is genuinely unterminated.
    const result = parseWadSynthLiteralText("{source:'square', label:'a\\'}", 'cfg')
    expect('loadError' in result).toBe(true)
  })
})
