import type { Node } from 'yoga-layout/load'
import type {
  PositionType,
  Edge,
  Align,
  FlexDirection,
  Wrap,
  Justify,
  Overflow,
  Display,
  Gutter,
} from 'yoga-layout/load'
import type { RootContext } from '../context.js'
import { convertYogaPoint, parseAbsoluteLengthValue } from '../properties/values.js'
function convertEnum<T extends { [Key in string]: number }>(
  lut: T,
  input: keyof T | undefined,
  defaultValue: T[keyof T]
): T[keyof T] {
  if (input == null) {
    return defaultValue
  }
  const resolvedValue = lut[input]
  if (resolvedValue == null) {
    throw new Error(`unexpected value ${input as string}, expected ${Object.keys(lut).join(', ')}`)
  }
  return resolvedValue
}
function convertPoint(
  input: string | number | undefined,
  root: RootContext
): `${number}%` | undefined | number {
  const [width, height] = root.component.size.value ?? [0, 0]
  return convertYogaPoint(input as `${number}%`, width, height)
}
function convertNumber(input: string | number | undefined): undefined | number {
  return input == null ? undefined : parseAbsoluteLengthValue(input as never)
}
const POSITION_TYPE_LUT = {
  static: 0,
  relative: 1,
  absolute: 2,
} as const
const ALIGN_LUT = {
  auto: 0,
  'flex-start': 1,
  center: 2,
  'flex-end': 3,
  stretch: 4,
  baseline: 5,
  'space-between': 6,
  'space-around': 7,
  'space-evenly': 8,
} as const
const FLEX_DIRECTION_LUT = {
  column: 0,
  'column-reverse': 1,
  row: 2,
  'row-reverse': 3,
} as const
const WRAP_LUT = {
  'no-wrap': 0,
  wrap: 1,
  'wrap-reverse': 2,
} as const
const JUSTIFY_LUT = {
  'flex-start': 0,
  center: 1,
  'flex-end': 2,
  'space-between': 3,
  'space-around': 4,
  'space-evenly': 5,
} as const
const OVERFLOW_LUT = {
  visible: 0,
  hidden: 1,
  scroll: 2,
} as const
const DISPLAY_LUT = {
  flex: 0,
  none: 1,
  contents: 2,
} as const
export const setter = {
  positionType: (
    root: RootContext,
    node: Node,
    input: 'static' | 'relative' | 'absolute' | undefined
  ) => {
    node.setPositionType(convertEnum(POSITION_TYPE_LUT, input, 1 as PositionType))
  },
  positionTop: (
    root: RootContext,
    node: Node,
    input:
      | undefined
      | number
      | `${number}`
      | `${number}px`
      | `${number}%`
      | `${number}vh`
      | `${number}dvh`
      | `${number}svh`
      | `${number}lvh`
      | `${number}vw`
      | `${number}lvw`
      | `${number}svw`
      | `${number}dvw`
      | 'auto'
  ) => {
    if (input === 'auto') {
      node.setPositionAuto(1)
      return
    }
    node.setPosition(1, convertPoint(input, root))
  },
  positionLeft: (
    root: RootContext,
    node: Node,
    input:
      | undefined
      | number
      | `${number}`
      | `${number}px`
      | `${number}%`
      | `${number}vh`
      | `${number}dvh`
      | `${number}svh`
      | `${number}lvh`
      | `${number}vw`
      | `${number}lvw`
      | `${number}svw`
      | `${number}dvw`
      | 'auto'
  ) => {
    if (input === 'auto') {
      node.setPositionAuto(0)
      return
    }
    node.setPosition(0, convertPoint(input, root))
  },
  positionRight: (
    root: RootContext,
    node: Node,
    input:
      | undefined
      | number
      | `${number}`
      | `${number}px`
      | `${number}%`
      | `${number}vh`
      | `${number}dvh`
      | `${number}svh`
      | `${number}lvh`
      | `${number}vw`
      | `${number}lvw`
      | `${number}svw`
      | `${number}dvw`
      | 'auto'
  ) => {
    if (input === 'auto') {
      node.setPositionAuto(2)
      return
    }
    node.setPosition(2, convertPoint(input, root))
  },
  positionBottom: (
    root: RootContext,
    node: Node,
    input:
      | undefined
      | number
      | `${number}`
      | `${number}px`
      | `${number}%`
      | `${number}vh`
      | `${number}dvh`
      | `${number}svh`
      | `${number}lvh`
      | `${number}vw`
      | `${number}lvw`
      | `${number}svw`
      | `${number}dvw`
      | 'auto'
  ) => {
    if (input === 'auto') {
      node.setPositionAuto(3)
      return
    }
    node.setPosition(3, convertPoint(input, root))
  },
  alignContent: (
    root: RootContext,
    node: Node,
    input:
      | 'auto'
      | 'flex-start'
      | 'center'
      | 'flex-end'
      | 'stretch'
      | 'baseline'
      | 'space-between'
      | 'space-around'
      | 'space-evenly'
      | undefined
  ) => {
    node.setAlignContent(convertEnum(ALIGN_LUT, input, 4 as Align))
  },
  alignItems: (
    root: RootContext,
    node: Node,
    input:
      | 'auto'
      | 'flex-start'
      | 'center'
      | 'flex-end'
      | 'stretch'
      | 'baseline'
      | 'space-between'
      | 'space-around'
      | 'space-evenly'
      | undefined
  ) => {
    node.setAlignItems(convertEnum(ALIGN_LUT, input, 4 as Align))
  },
  alignSelf: (
    root: RootContext,
    node: Node,
    input:
      | 'auto'
      | 'flex-start'
      | 'center'
      | 'flex-end'
      | 'stretch'
      | 'baseline'
      | 'space-between'
      | 'space-around'
      | 'space-evenly'
      | undefined
  ) => {
    node.setAlignSelf(convertEnum(ALIGN_LUT, input, 0 as Align))
  },
  flexDirection: (
    root: RootContext,
    node: Node,
    input: 'column' | 'column-reverse' | 'row' | 'row-reverse' | undefined
  ) => {
    node.setFlexDirection(convertEnum(FLEX_DIRECTION_LUT, input, 2 as FlexDirection))
  },
  flexWrap: (
    root: RootContext,
    node: Node,
    input: 'no-wrap' | 'wrap' | 'wrap-reverse' | undefined
  ) => {
    node.setFlexWrap(convertEnum(WRAP_LUT, input, 0 as Wrap))
  },
  justifyContent: (
    root: RootContext,
    node: Node,
    input:
      | 'flex-start'
      | 'center'
      | 'flex-end'
      | 'space-between'
      | 'space-around'
      | 'space-evenly'
      | undefined
  ) => {
    node.setJustifyContent(convertEnum(JUSTIFY_LUT, input, 0 as Justify))
  },
  marginTop: (
    root: RootContext,
    node: Node,
    input:
      | undefined
      | number
      | `${number}`
      | `${number}px`
      | `${number}%`
      | `${number}vh`
      | `${number}dvh`
      | `${number}svh`
      | `${number}lvh`
      | `${number}vw`
      | `${number}lvw`
      | `${number}svw`
      | `${number}dvw`
      | 'auto'
  ) => {
    if (input === 'auto') {
      node.setMarginAuto(1)
      return
    }
    node.setMargin(1, convertPoint(input, root))
  },
  marginLeft: (
    root: RootContext,
    node: Node,
    input:
      | undefined
      | number
      | `${number}`
      | `${number}px`
      | `${number}%`
      | `${number}vh`
      | `${number}dvh`
      | `${number}svh`
      | `${number}lvh`
      | `${number}vw`
      | `${number}lvw`
      | `${number}svw`
      | `${number}dvw`
      | 'auto'
  ) => {
    if (input === 'auto') {
      node.setMarginAuto(0)
      return
    }
    node.setMargin(0, convertPoint(input, root))
  },
  marginRight: (
    root: RootContext,
    node: Node,
    input:
      | undefined
      | number
      | `${number}`
      | `${number}px`
      | `${number}%`
      | `${number}vh`
      | `${number}dvh`
      | `${number}svh`
      | `${number}lvh`
      | `${number}vw`
      | `${number}lvw`
      | `${number}svw`
      | `${number}dvw`
      | 'auto'
  ) => {
    if (input === 'auto') {
      node.setMarginAuto(2)
      return
    }
    node.setMargin(2, convertPoint(input, root))
  },
  marginBottom: (
    root: RootContext,
    node: Node,
    input:
      | undefined
      | number
      | `${number}`
      | `${number}px`
      | `${number}%`
      | `${number}vh`
      | `${number}dvh`
      | `${number}svh`
      | `${number}lvh`
      | `${number}vw`
      | `${number}lvw`
      | `${number}svw`
      | `${number}dvw`
      | 'auto'
  ) => {
    if (input === 'auto') {
      node.setMarginAuto(3)
      return
    }
    node.setMargin(3, convertPoint(input, root))
  },
  flexBasis: (
    root: RootContext,
    node: Node,
    input:
      | undefined
      | number
      | `${number}`
      | `${number}px`
      | `${number}%`
      | `${number}vh`
      | `${number}dvh`
      | `${number}svh`
      | `${number}lvh`
      | `${number}vw`
      | `${number}lvw`
      | `${number}svw`
      | `${number}dvw`
      | 'auto'
  ) => {
    if (input === 'auto') {
      node.setFlexBasisAuto()
      return
    }

    node.setFlexBasis(convertPoint(input, root) ?? NaN)
  },
  flexGrow: (root: RootContext, node: Node, input: undefined | number | `${number}`) => {
    node.setFlexGrow(convertNumber(input) ?? 0)
  },
  flexShrink: (root: RootContext, node: Node, input: undefined | number | `${number}`) => {
    node.setFlexShrink(convertNumber(input) ?? 1)
  },
  width: (
    root: RootContext,
    node: Node,
    input:
      | undefined
      | number
      | `${number}`
      | `${number}px`
      | `${number}%`
      | `${number}vh`
      | `${number}dvh`
      | `${number}svh`
      | `${number}lvh`
      | `${number}vw`
      | `${number}lvw`
      | `${number}svw`
      | `${number}dvw`
      | 'auto'
  ) => {
    if (input === 'auto') {
      node.setWidthAuto()
      return
    }

    node.setWidth(convertPoint(input, root) ?? NaN)
  },
  height: (
    root: RootContext,
    node: Node,
    input:
      | undefined
      | number
      | `${number}`
      | `${number}px`
      | `${number}%`
      | `${number}vh`
      | `${number}dvh`
      | `${number}svh`
      | `${number}lvh`
      | `${number}vw`
      | `${number}lvw`
      | `${number}svw`
      | `${number}dvw`
      | 'auto'
  ) => {
    if (input === 'auto') {
      node.setHeightAuto()
      return
    }

    node.setHeight(convertPoint(input, root) ?? NaN)
  },
  minWidth: (
    root: RootContext,
    node: Node,
    input:
      | undefined
      | number
      | `${number}`
      | `${number}px`
      | `${number}%`
      | `${number}vh`
      | `${number}dvh`
      | `${number}svh`
      | `${number}lvh`
      | `${number}vw`
      | `${number}lvw`
      | `${number}svw`
      | `${number}dvw`
  ) => {
    node.setMinWidth(convertPoint(input, root))
  },
  minHeight: (
    root: RootContext,
    node: Node,
    input:
      | undefined
      | number
      | `${number}`
      | `${number}px`
      | `${number}%`
      | `${number}vh`
      | `${number}dvh`
      | `${number}svh`
      | `${number}lvh`
      | `${number}vw`
      | `${number}lvw`
      | `${number}svw`
      | `${number}dvw`
  ) => {
    node.setMinHeight(convertPoint(input, root))
  },
  maxWidth: (
    root: RootContext,
    node: Node,
    input:
      | undefined
      | number
      | `${number}`
      | `${number}px`
      | `${number}%`
      | `${number}vh`
      | `${number}dvh`
      | `${number}svh`
      | `${number}lvh`
      | `${number}vw`
      | `${number}lvw`
      | `${number}svw`
      | `${number}dvw`
  ) => {
    node.setMaxWidth(convertPoint(input, root))
  },
  maxHeight: (
    root: RootContext,
    node: Node,
    input:
      | undefined
      | number
      | `${number}`
      | `${number}px`
      | `${number}%`
      | `${number}vh`
      | `${number}dvh`
      | `${number}svh`
      | `${number}lvh`
      | `${number}vw`
      | `${number}lvw`
      | `${number}svw`
      | `${number}dvw`
  ) => {
    node.setMaxHeight(convertPoint(input, root))
  },
  boxSizing: (root: RootContext, node: Node, input: undefined | number | `${number}`) => {
    node.setBoxSizing(convertNumber(input) ?? 0)
  },
  aspectRatio: (root: RootContext, node: Node, input: undefined | number | `${number}`) => {
    node.setAspectRatio(convertNumber(input))
  },
  borderTopWidth: (
    root: RootContext,
    node: Node,
    input: undefined | number | `${number}` | `${number}px`
  ) => {
    node.setBorder(1, convertNumber(input))
  },
  borderLeftWidth: (
    root: RootContext,
    node: Node,
    input: undefined | number | `${number}` | `${number}px`
  ) => {
    node.setBorder(0, convertNumber(input))
  },
  borderRightWidth: (
    root: RootContext,
    node: Node,
    input: undefined | number | `${number}` | `${number}px`
  ) => {
    node.setBorder(2, convertNumber(input))
  },
  borderBottomWidth: (
    root: RootContext,
    node: Node,
    input: undefined | number | `${number}` | `${number}px`
  ) => {
    node.setBorder(3, convertNumber(input))
  },
  overflow: (root: RootContext, node: Node, input: 'visible' | 'hidden' | 'scroll' | undefined) => {
    node.setOverflow(convertEnum(OVERFLOW_LUT, input, 0 as Overflow))
  },
  display: (root: RootContext, node: Node, input: 'flex' | 'none' | 'contents' | undefined) => {
    node.setDisplay(convertEnum(DISPLAY_LUT, input, 0 as Display))
  },
  paddingTop: (
    root: RootContext,
    node: Node,
    input:
      | undefined
      | number
      | `${number}`
      | `${number}px`
      | `${number}%`
      | `${number}vh`
      | `${number}dvh`
      | `${number}svh`
      | `${number}lvh`
      | `${number}vw`
      | `${number}lvw`
      | `${number}svw`
      | `${number}dvw`
  ) => {
    node.setPadding(1, convertPoint(input, root))
  },
  paddingLeft: (
    root: RootContext,
    node: Node,
    input:
      | undefined
      | number
      | `${number}`
      | `${number}px`
      | `${number}%`
      | `${number}vh`
      | `${number}dvh`
      | `${number}svh`
      | `${number}lvh`
      | `${number}vw`
      | `${number}lvw`
      | `${number}svw`
      | `${number}dvw`
  ) => {
    node.setPadding(0, convertPoint(input, root))
  },
  paddingRight: (
    root: RootContext,
    node: Node,
    input:
      | undefined
      | number
      | `${number}`
      | `${number}px`
      | `${number}%`
      | `${number}vh`
      | `${number}dvh`
      | `${number}svh`
      | `${number}lvh`
      | `${number}vw`
      | `${number}lvw`
      | `${number}svw`
      | `${number}dvw`
  ) => {
    node.setPadding(2, convertPoint(input, root))
  },
  paddingBottom: (
    root: RootContext,
    node: Node,
    input:
      | undefined
      | number
      | `${number}`
      | `${number}px`
      | `${number}%`
      | `${number}vh`
      | `${number}dvh`
      | `${number}svh`
      | `${number}lvh`
      | `${number}vw`
      | `${number}lvw`
      | `${number}svw`
      | `${number}dvw`
  ) => {
    node.setPadding(3, convertPoint(input, root))
  },
  gapRow: (
    root: RootContext,
    node: Node,
    input:
      | undefined
      | number
      | `${number}`
      | `${number}px`
      | `${number}%`
      | `${number}vh`
      | `${number}dvh`
      | `${number}svh`
      | `${number}lvh`
      | `${number}vw`
      | `${number}lvw`
      | `${number}svw`
      | `${number}dvw`
  ) => {
    node.setGap(1 as Gutter.Row, convertPoint(input, root))
  },
  gapColumn: (
    root: RootContext,
    node: Node,
    input:
      | undefined
      | number
      | `${number}`
      | `${number}px`
      | `${number}%`
      | `${number}vh`
      | `${number}dvh`
      | `${number}svh`
      | `${number}lvh`
      | `${number}vw`
      | `${number}lvw`
      | `${number}svw`
      | `${number}dvw`
  ) => {
    node.setGap(0 as Gutter.Column, convertPoint(input, root))
  },
  direction: (root: RootContext, node: Node, input: undefined | number | `${number}`) => {
    node.setDirection(convertNumber(input) ?? 0)
  },
}
