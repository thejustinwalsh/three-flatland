// Pure validation of a raw LM text response into a usable param set — no
// vscode import. Deliberately lenient: unknown keys and non-numeric
// values are filtered out rather than failing the whole response, since
// a partially-useful response (5 of 6 keys good) is strictly better than
// throwing it away and burning the one retry on a minor mistake. Only an
// unparseable payload or a response with ZERO usable keys counts as
// invalid.
import {
  PARAM_ORDER,
  fromPartial,
  type ParamKey,
  type ZzfxParams,
} from '../../../webview/zzfx/params'

export type ValidationResult = { ok: true; params: ZzfxParams } | { ok: false; reason: string }

const PARAM_KEY_SET = new Set<string>(PARAM_ORDER)

/** Strips a single leading/trailing ```json ... ``` fence, if present —
 * models routinely wrap JSON in one despite being told not to. */
function stripCodeFence(text: string): string {
  const match = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return match ? match[1]! : text
}

export function validateLmResponse(raw: string): ValidationResult {
  const text = stripCodeFence(raw).trim()
  if (text === '') return { ok: false, reason: 'empty response' }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'response was not valid JSON' }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'response was not a JSON object' }
  }

  const partial: Partial<Record<ParamKey, number>> = {}
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!PARAM_KEY_SET.has(key)) continue
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    partial[key as ParamKey] = value
  }

  if (Object.keys(partial).length === 0) {
    return { ok: false, reason: 'response contained no recognized numeric ZzFX params' }
  }

  return { ok: true, params: fromPartial(partial) }
}
