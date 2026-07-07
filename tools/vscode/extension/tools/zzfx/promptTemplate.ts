// Pure prompt construction for the ZzFX AI Generate flow — no vscode
// import, fully unit-testable. Reuses the webview's param model directly
// (PARAM_SPECS/PARAM_ORDER) so the prompt's description of the schema can
// never drift from the actual clamp ranges the response gets validated
// against.
import { PARAM_ORDER, PARAM_SPECS } from '../../../webview/zzfx/params'

function paramLine(key: (typeof PARAM_ORDER)[number]): string {
  const spec = PARAM_SPECS[key]
  const range = spec.integer ? `${spec.min}..${spec.max} integer` : `${spec.min}..${spec.max}`
  return `- ${key}: ${range}, default ${spec.default}`
}

const SCHEMA_DESCRIPTION = PARAM_ORDER.map(paramLine).join('\n')

/**
 * Builds the initial generate prompt for a category + optional style
 * tags. Deliberately asks for a JSON OBJECT of a subset of param keys
 * (not a positional array) — a keyed object is far more reliable for an
 * LLM to emit correctly, and any omitted key just falls back to its
 * spec default via `fromPartial`.
 */
export function buildPrompt(category: string | undefined, styles: readonly string[]): string {
  const categoryLine = category
    ? `Category: ${category}`
    : 'Category: (unspecified — pick something plausible)'
  const stylesLine =
    styles.length > 0 ? `Style tags: ${styles.join(', ')}` : 'Style tags: (none specified)'
  return [
    'You are a sound designer generating a retro/arcade-style sound-effect for the ZzFX synth (https://github.com/KilledByAPixel/ZzFX).',
    categoryLine,
    stylesLine,
    '',
    'ZzFX params, with their valid range and default:',
    SCHEMA_DESCRIPTION,
    '',
    'Respond with ONLY a single-line JSON object mapping the param names you want to set to numeric values.',
    'Omit any param you want left at its default — do not include every param, only the ones that shape this specific sound.',
    'Do not include markdown code fences, explanation, or any text other than the JSON object.',
    'Example response: {"volume":0.6,"frequency":540,"attack":0,"sustain":0.02,"release":0.1,"shape":1}',
  ].join('\n')
}

/**
 * Corrective follow-up used for the single retry after a response fails
 * validation. Echoes back what was wrong so the model has a concrete
 * signal to correct, rather than just repeating the original prompt
 * verbatim (which tends to reproduce the same mistake).
 */
export function buildRetryPrompt(invalidResponse: string, reason: string): string {
  return [
    'Your previous response was not valid: ' + reason,
    'Previous response was:',
    invalidResponse.slice(0, 500),
    '',
    'Respond again with ONLY a single-line JSON object mapping ZzFX param names to numeric values — no markdown, no prose, no code fences.',
    'Example: {"volume":0.6,"frequency":540,"attack":0,"sustain":0.02,"release":0.1,"shape":1}',
  ].join('\n')
}
