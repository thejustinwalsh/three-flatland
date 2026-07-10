import { Text } from '@three-flatland/uikit/react'
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@three-flatland/uikit-default/react'

export function TooltipDemo() {
  return (
    <Tooltip>
      <TooltipTrigger>
        <Button variant="outline">
          <Text>Hover</Text>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <Text>Add to library</Text>
      </TooltipContent>
    </Tooltip>
  )
}
