import { Text } from '@three-flatland/uikit/react'
import { Terminal } from '@three-flatland/uikit-lucide/react'
import { Alert, AlertDescription, AlertIcon, AlertTitle } from '@three-flatland/uikit-default/react'

export function AlertDemo() {
  return (
    <Alert maxWidth={500}>
      <AlertIcon>
        <Terminal width={16} height={16} />
      </AlertIcon>
      <AlertTitle>
        <Text>Error</Text>
      </AlertTitle>
      <AlertDescription>
        <Text>You can add components to your app using the cli.</Text>
      </AlertDescription>
    </Alert>
  )
}
