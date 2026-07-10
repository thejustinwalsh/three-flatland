import { Bold, Italic, Underline } from '@three-flatland/uikit-lucide/react'
import { ToggleGroup, ToggleGroupItem } from '@three-flatland/uikit-default/react'

export function ToggleGroupDemo() {
  return (
    <ToggleGroup>
      <ToggleGroupItem>
        <Bold height={16} width={16} />
      </ToggleGroupItem>
      <ToggleGroupItem>
        <Italic height={16} width={16} />
      </ToggleGroupItem>
      <ToggleGroupItem>
        <Underline width={16} height={16} />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
