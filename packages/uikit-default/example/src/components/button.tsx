import { ChevronRight } from '@three-flatland/uikit-lucide/react'
import { Button } from '@three-flatland/uikit-default/react'

export function ButtonDemo() {
  return (
    <Button variant="outline" size="icon">
      <ChevronRight width={16} height={16} />
    </Button>
  )
}
