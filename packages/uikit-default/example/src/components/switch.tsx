import { Text, Container } from '@three-flatland/uikit/react'
import { Label, Switch } from '@three-flatland/uikit-default/react'

export function SwitchDemo() {
  return (
    <Container flexDirection="row" alignItems="center" gap={8}>
      <Switch />
      <Label>
        <Text>Airplane Mode</Text>
      </Label>
    </Container>
  )
}
