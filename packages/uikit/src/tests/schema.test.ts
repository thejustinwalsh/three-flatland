import { expect } from 'chai'
import { signal } from '@preact/signals-core'
import {
  ContainerPropertiesSchema,
  FontFamiliesSchema,
  InputPropertiesSchema,
  Video,
} from '../index.js'

// Stand-in for upstream's `@pmndrs/msdfonts/inter` — MSDF is dropped (design spec
// §8.1), and the schema under test treats font family entries as opaque, so any
// weight-keyed map of `FontInfoSource` values exercises the same validation path.
const inter = {
  light: () => Promise.resolve('/fonts/inter-light.json'),
  medium: () => Promise.resolve('/fonts/inter-medium.json'),
  'semi-bold': () => Promise.resolve('/fonts/inter-semibold.json'),
  bold: () => Promise.resolve('/fonts/inter-bold.json'),
}
import { ComponentPropertiesSchemas } from '../components/schemas.js'
import { setter } from '../flex/setter.js'
import { yogaPropertyShape } from '../flex/schema.js'
import { convertYogaPoint, parseAbsoluteNumber } from '../properties/values.js'

describe('property schemas', () => {
  it('accepts core props, aliases, conditionals, inheritance, initial, and signals', () => {
    const result = ContainerPropertiesSchema.safeParse({
      padding: 12,
      width: signal(100),
      height: 'initial',
      zIndex: '2',
      transformScaleX: '125%',
      transformScaleY: 'initial',
      hover: {
        backgroundColor: '#fff',
      },
      '*': {
        color: 'black',
      },
    })

    expect(result.success).to.equal(true)
  })

  it('uses explicit string formats for numeric properties', () => {
    expect(ContainerPropertiesSchema.safeParse({ transformScaleX: 1.25 }).success).to.equal(true)
    expect(ContainerPropertiesSchema.safeParse({ transformScaleX: '125%' }).success).to.equal(true)
    expect(ContainerPropertiesSchema.safeParse({ transformScaleX: '1.25' }).success).to.equal(true)
    expect(ContainerPropertiesSchema.safeParse({ transformScaleX: '12px' }).success).to.equal(false)
    expect(ContainerPropertiesSchema.safeParse({ transformTranslateX: '12px' }).success).to.equal(
      true
    )
    expect(ContainerPropertiesSchema.safeParse({ transformTranslateX: '50%' }).success).to.equal(
      true
    )
    expect(ContainerPropertiesSchema.safeParse({ transformTranslateX: '10dvw' }).success).to.equal(
      true
    )
    expect(ContainerPropertiesSchema.safeParse({ transformTranslateX: 'wide' }).success).to.equal(
      false
    )
    expect(ContainerPropertiesSchema.safeParse({ zIndex: '2' }).success).to.equal(true)
    expect(ContainerPropertiesSchema.safeParse({ zIndex: '2px' }).success).to.equal(false)
    expect(ContainerPropertiesSchema.safeParse({ caretWidth: '2px' }).success).to.equal(true)
    expect(ContainerPropertiesSchema.safeParse({ opacity: '0.5' }).success).to.equal(true)
    expect(ContainerPropertiesSchema.safeParse({ opacity: '50%' }).success).to.equal(true)
    expect(ContainerPropertiesSchema.safeParse({ opacity: '2px' }).success).to.equal(false)
  })

  it('rejects unknown properties at the exact nested path', () => {
    const result = ComponentPropertiesSchemas.Container.safeParse({
      hover: {
        paddding: 12,
      },
    })

    expect(result.success).to.equal(false)
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).to.deep.equal([['hover']])
      expect(
        result.error.issues.map((issue) => (issue.code === 'unrecognized_keys' ? issue.keys : []))
      ).to.deep.equal([['paddding']])
    }
  })

  it('validates component-specific properties', () => {
    expect(
      InputPropertiesSchema.safeParse({ placeholder: 'Search', type: 'password' }).success
    ).to.equal(true)
    expect(InputPropertiesSchema.safeParse({ text: 'not allowed' }).success).to.equal(false)
  })

  it('accepts native a11y props chain-wide and still rejects unknown keys and bad roles', () => {
    // a11yPropertyShape is spread into the base out-shape, so every component inherits it.
    expect(
      ContainerPropertiesSchema.safeParse({
        role: 'button',
        ariaLabel: 'Play',
        ariaChecked: true,
        tabIndex: 0,
        disabled: false,
        hover: { backgroundColor: 'red' },
      }).success
    ).to.equal(true)
    // The role enum is closed…
    expect(ContainerPropertiesSchema.safeParse({ role: 'not-a-real-role' }).success).to.equal(false)
    // …and strictness still bites unknown keys sitting next to valid a11y props.
    expect(
      ContainerPropertiesSchema.safeParse({ ariaLabel: 'x', notAnAriaProp: true }).success
    ).to.equal(false)
  })

  it('constructs core Video with schema-valid props outside the browser', () => {
    const props = { src: 'movie.mp4', objectFit: 'cover' as const, keepAspectRatio: false }
    expect(ComponentPropertiesSchemas.Video.safeParse(props).success).to.equal(true)
    expect(() => new Video(props)).to.not.throw()
  })

  it('validates font family names and weight keys while keeping font info opaque', () => {
    expect(FontFamiliesSchema.safeParse({ inter }).success).to.equal(true)
    expect(ContainerPropertiesSchema.safeParse({ fontFamilies: { inter } }).success).to.equal(true)
    expect(FontFamiliesSchema.safeParse({ broken: { heavyish: '/font.json' } }).success).to.equal(
      false
    )
    expect(FontFamiliesSchema.safeParse({ custom: { 400: { pages: [] } } }).success).to.equal(true)
  })
})

describe('generated yoga schema', () => {
  it('uses the same property keys as the generated yoga setters', () => {
    expect(Object.keys(yogaPropertyShape).sort()).to.deep.equal(Object.keys(setter).sort())
  })

  it('keeps Yoga scalar and point string units precise', () => {
    expect(yogaPropertyShape.width.safeParse('12').success).to.equal(true)
    expect(yogaPropertyShape.width.safeParse('12px').success).to.equal(true)
    expect(yogaPropertyShape.width.safeParse('12%').success).to.equal(true)
    expect(yogaPropertyShape.flexGrow.safeParse('2').success).to.equal(true)
    expect(yogaPropertyShape.flexGrow.safeParse('2px').success).to.equal(false)
    expect(yogaPropertyShape.borderTopWidth.safeParse('2px').success).to.equal(true)
    expect(yogaPropertyShape.borderTopWidth.safeParse('2%').success).to.equal(false)
  })
})

describe('property value parsing', () => {
  it('uses the same percentage and viewport grammar as schema validation', () => {
    expect(parseAbsoluteNumber('50%', () => 200)).to.equal(100)
    expect(parseAbsoluteNumber('12')).to.equal(12)
    expect(parseAbsoluteNumber('12px')).to.equal(12)
    expect(parseAbsoluteNumber('25dvw', undefined, 400, 800)).to.equal(100)
    expect(parseAbsoluteNumber('25svh', undefined, 400, 800)).to.equal(200)
    expect(convertYogaPoint('12', 400, 800)).to.equal(12)
    expect(convertYogaPoint('12px', 400, 800)).to.equal(12)
    expect(convertYogaPoint('25lvw', 400, 800)).to.equal(100)
    expect(convertYogaPoint('25lvh', 400, 800)).to.equal(200)
    expect(() => parseAbsoluteNumber('12banana')).to.throw('Invalid number')
  })
})
