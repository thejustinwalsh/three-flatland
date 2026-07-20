// Pure text-shape parsing for a `tone.synth` finding's triggerAttackRelease
// argument list — reuses numberArrayLiteral.ts's nested-array parser (the
// same technique songResolver.ts uses: wrap the raw argRange text in
// `[...]` and parse it as one array literal) rather than writing a third
// top-level-comma-splitter from scratch.
//
// `tone.synth`'s payload pre-classifies `synthType`/`voiceType` on the Rust
// side (sidecar/src/parse.rs::extract_tone_synth already validated the
// constructor chain against the 9-name allowlist and, for PolySynth, its
// explicit voice type) — this resolver only has to parse the PLAYBACK
// arguments (note/duration, or chord/duration) out of argRange's raw text,
// classified per synthType's signature.
//
// `duration`/`time`/`velocity` stay fully-static-or-nothing (the sidecar
// refuses the WHOLE finding if those aren't literals), but the note/chord
// argument (position 0) can carry a `varRef` — resolveToneSynth.ts (the
// vscode-dependent half) resolves that BEFORE calling this function,
// splicing the identifier's own declaration text in place of its name, so
// this pure parser never sees a bare identifier at all — only ever
// already-substituted, potentially-still-not-a-literal text (e.g. the
// declaration turned out to be a function call, not a literal). A
// `loadError` return here means either that substituted text genuinely
// doesn't match the expected shape for its synthType, or (for a finding
// with no varRef at all) a malformed argRange — shouldn't happen for a
// real finding, but this stays defensive rather than assuming the
// invariant always holds.
//
// Design decision (v1 scope, see tools/codelens-service/AGENTS.md's
// tone.synth section): the constructor's own config object
// (`new Tone.Synth({...})`) is NOT parsed here, and the sidecar doesn't
// capture a separate range for it at all. Config isn't load-bearing for
// playability the way note/duration are, and — unlike zzfx/wad.synth —
// there's no unresolved varRef to gracefully refuse on for it either. If a
// future version wants to forward synth config to playback, the sidecar
// will need a dedicated range for the constructor's own arguments first;
// that's out of scope here.

import { parseNestedArrayLiteral, type NestedArrayValue } from './numberArrayLiteral'

export type ToneSynthNote = string | number

export type ResolvedToneSynth =
  | {
      synthType: string
      voiceType?: string
      /** Absent for NoiseSynth, a single note for pitched classes, an array of notes (a chord) for PolySynth. */
      note?: ToneSynthNote | ToneSynthNote[]
      duration: ToneSynthNote
    }
  | { loadError: string }

function previewText(text: string, max = 40): string {
  const trimmed = text.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

function isNoteLiteral(value: NestedArrayValue | undefined): value is ToneSynthNote {
  return typeof value === 'string' || typeof value === 'number'
}

/**
 * Pure: parses `text` (the raw source text at `argRange` — the
 * `triggerAttackRelease(...)` call's OWN comma-separated argument-list
 * text) into playback-ready note/duration values, or a `loadError` naming
 * `label` on any refusal. Never throws. `synthType`/`voiceType` are passed
 * through unchanged from the Finding's payload — already classified by the
 * sidecar, not re-derived here.
 */
export function parseToneSynthArgsText(
  text: string,
  synthType: string,
  voiceType: string | undefined,
  label: string
): ResolvedToneSynth {
  const fail = (reason: string): ResolvedToneSynth => ({
    loadError: `Can't read ${label} as Tone.js triggerAttackRelease args — ${reason} (found "${previewText(text)}").`,
  })

  const args = parseNestedArrayLiteral(`[${text}]`)
  if (!args) return fail("the arguments aren't plain literals")

  const withVoiceType = (fields: Record<string, unknown>) => ({
    synthType,
    ...(voiceType ? { voiceType } : {}),
    ...fields,
  })

  if (synthType === 'NoiseSynth') {
    const duration = args[0]
    if (!isNoteLiteral(duration)) return fail('duration must be a string or number literal')
    return withVoiceType({ duration }) as ResolvedToneSynth
  }

  if (synthType === 'PolySynth') {
    const chord = args[0]
    const duration = args[1]
    if (!Array.isArray(chord) || chord.length === 0 || !chord.every(isNoteLiteral)) {
      return fail('the chord must be a non-empty array of string/number literals')
    }
    if (!isNoteLiteral(duration)) return fail('duration must be a string or number literal')
    return withVoiceType({ note: chord, duration }) as ResolvedToneSynth
  }

  const note = args[0]
  const duration = args[1]
  if (!isNoteLiteral(note)) return fail('note must be a string or number literal')
  if (!isNoteLiteral(duration)) return fail('duration must be a string or number literal')
  return withVoiceType({ note, duration }) as ResolvedToneSynth
}
