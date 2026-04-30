import type { ReactNode } from 'react'
import * as stylex from '@stylexjs/stylex'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'

/**
 * Density only existed when the drawer was user-resizable: tall =
 * 'detail' (cells), short = 'dots'. The drawer is now a single
 * fixed-height variant — kept as an alias so out-of-package consumers
 * (and any vendored snapshots) don't break, but only `'detail'` and
 * `'collapsed'` ever surface.
 */
export type AnimationDrawerDensity = 'detail' | 'collapsed'

/**
 * Fixed body height: 4 px top padding + cell row + 4 px bottom slot
 * for the horizontal scroll indicator. CELL_BASE in
 * AnimationTimeline.tsx is 40 → 4 + 40 + 4 = 48. The bottom 4 px is
 * not body padding — it lives inside the track's content area so the
 * scroll indicator (absolutely positioned at the track's bottom) sits
 * in it without overlapping the cells. Keep this in sync with
 * `paddingTop` on `s.body` and `CELL_BASE`.
 */
const BODY_HEIGHT_PX = 48

/**
 * Retained for back-compat. The drawer no longer has a "small player"
 * mode, so callers that used to derive density from a target height
 * always get 'detail' when expanded (collapsed handled at the call
 * site).
 */
export function densityForHeight(_heightPx: number): AnimationDrawerDensity {
  return 'detail'
}

const s = stylex.create({
  shell: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    flexShrink: 0,
  },
  // Static 1px panel-border line between the canvas and the drawer
  // header. No longer a drag handle — the drawer body is fixed-height
  // and not user-resizable, so the only state the user controls via
  // the drawer is expanded/collapsed (chevron in the header).
  border: {
    height: 1,
    flexShrink: 0,
    backgroundColor: vscode.panelBorder,
  },
  body: {
    // Strict fixed height — explicitly NOT a flex grow item. Combining
    // `flex: 1` with `style={{ height }}` could let content size feed
    // back into the resolved height and reflow the canvas above on
    // changes inside the timeline.
    //
    // Asymmetric vertical padding by design: 4 px above the track for
    // breathing room, 0 below — the bottom 4 px slot for the scroll
    // indicator lives INSIDE the track (track height = body content
    // = 44 px, cells fill the top 40, the indicator sits in the
    // remaining 4 at track bottom). Body total = 48.
    flexShrink: 0,
    flexGrow: 0,
    minHeight: 0,
    overflow: 'hidden',
    backgroundColor: vscode.bg,
    paddingInline: space.lg,
    paddingTop: space.sm,
    paddingBottom: 0,
  },
})

export type AnimationDrawerProps = {
  /** Drawer expanded? Comes from prefs.animDrawerExpanded. */
  expanded: boolean
  /** Header content; always rendered (even when collapsed). */
  header: ReactNode
  /** Body content; rendered only when expanded. */
  body: (density: AnimationDrawerDensity) => ReactNode
}

/**
 * Collapsible drawer panel — peer of the canvas inside the Atlas pane.
 * Header looks like a VSCode panel-area title bar (caller provides a
 * full-width row, e.g. AnimationDrawerHeader). Body is a fixed
 * cell-row height when expanded; toggling the chevron in the header
 * collapses to just the header strip.
 */
export function AnimationDrawer({ expanded, header, body }: AnimationDrawerProps) {
  return (
    <div {...stylex.props(s.shell)}>
      {/* 1px line between the canvas above and the header below.
          Always rendered for visual continuity even when the drawer
          body is collapsed. */}
      <div {...stylex.props(s.border)} aria-hidden="true" />
      {header}
      {expanded ? (
        <div {...stylex.props(s.body)} style={{ height: BODY_HEIGHT_PX }}>
          {body('detail')}
        </div>
      ) : null}
    </div>
  )
}
