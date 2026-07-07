import * as stylex from '@stylexjs/stylex'
import { Panel } from '@three-flatland/design-system'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'

// The real AI Generate flow (vscode.lm + preset fallback, driven by the
// category/style pills above) ships as its own unit — issue #148, sub-task
// Z5. This is a structural placeholder only: it reserves the panel's spot
// in the layout so that unit doesn't need to touch this file's JSX tree,
// and stays hidden until flipped on. Do NOT implement generation here.
export const AI_GENERATE_ENABLED = false

const s = stylex.create({
  body: {
    fontSize: '11px',
    color: vscode.descriptionFg,
  },
})

export function AiGeneratePanel() {
  if (!AI_GENERATE_ENABLED) return null
  return (
    <Panel title="AI Generate (Preview)">
      <p {...stylex.props(s.body)}>
        Generates zzfx params from the category + style pills above. Not implemented yet — see issue
        #148.
      </p>
    </Panel>
  )
}
