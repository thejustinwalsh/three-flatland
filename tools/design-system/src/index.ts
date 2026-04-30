export { Button, type ButtonProps } from './primitives/Button'
export {
  CompactSelect,
  type CompactSelectProps,
  type CompactSelectOption,
} from './primitives/CompactSelect'
export { NumberField, type NumberFieldProps } from './primitives/NumberField'
export { Panel, type PanelProps } from './primitives/Panel'
export { Toolbar, type ToolbarProps } from './primitives/Toolbar'
export { ToolbarButton, type ToolbarButtonProps } from './primitives/ToolbarButton'
export { DevReloadToast } from './primitives/DevReloadToast'
export { useThemeKind, type ThemeKind } from './theme/useThemeKind'
export { useCssVar } from './theme/useCssVar'
export { useDevReload } from './theme/useDevReload'

// Re-exported here for type-only / non-StyleX consumers. StyleX consumers MUST
// import from the @three-flatland/design-system/tokens/<name> subpaths because
// the babel plugin can't follow defineVars through barrel re-exports.
export { vscode } from './tokens/vscode-theme.stylex'
export { space } from './tokens/space.stylex'
export { radius } from './tokens/radius.stylex'
export { z } from './tokens/z.stylex'

// Re-export common VSCode Elements so tools don't need to depend on the
// package directly. Imported from per-component subpaths (not the barrel)
// so each consumer only pulls in the wrappers it actually names — without
// this, `@vscode-elements/react-elements`'s ambiguous sideEffects field
// forces the whole barrel into the bundle. Add more as needed.
export { default as Badge } from '@vscode-elements/react-elements/dist/components/VscodeBadge.js'
export { default as Divider } from '@vscode-elements/react-elements/dist/components/VscodeDivider.js'
export { default as Icon } from '@vscode-elements/react-elements/dist/components/VscodeIcon.js'
export { default as Label } from '@vscode-elements/react-elements/dist/components/VscodeLabel.js'
export { default as Scrollable } from '@vscode-elements/react-elements/dist/components/VscodeScrollable.js'
export { default as SingleSelect } from '@vscode-elements/react-elements/dist/components/VscodeSingleSelect.js'
export { default as Option } from '@vscode-elements/react-elements/dist/components/VscodeOption.js'
export { default as Tabs } from '@vscode-elements/react-elements/dist/components/VscodeTabs.js'
export { default as TabHeader } from '@vscode-elements/react-elements/dist/components/VscodeTabHeader.js'
export { default as TabPanel } from '@vscode-elements/react-elements/dist/components/VscodeTabPanel.js'
export { default as TextField } from '@vscode-elements/react-elements/dist/components/VscodeTextfield.js'
export { default as Tree } from '@vscode-elements/react-elements/dist/components/VscodeTree.js'
export { default as TreeItem } from '@vscode-elements/react-elements/dist/components/VscodeTreeItem.js'
export { default as Checkbox } from '@vscode-elements/react-elements/dist/components/VscodeCheckbox.js'
export { default as Collapsible } from '@vscode-elements/react-elements/dist/components/VscodeCollapsible.js'
