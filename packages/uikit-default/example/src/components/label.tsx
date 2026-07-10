import { Text, Container } from '@three-flatland/uikit/react'
import { Checkbox, Label } from '@three-flatland/uikit-default/react'

export function LabelDemo() {
  return (
    <Container flexDirection="row" gap={8} alignItems="center">
      <Checkbox />
      <Label>
        <Text>Accept terms and conditions</Text>
      </Label>
    </Container>
  )
}
