import { signal } from '@preact/signals-core'
import { Text } from '@three-flatland/uikit/react'
import {
  Button,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  VanillaAlertDialog,
} from '@three-flatland/uikit-default/react'
import { useMemo } from 'react'

export function AlertDialogDemo() {
  const ref = useMemo(() => signal<VanillaAlertDialog | undefined>(undefined), [])
  return (
    <>
      <AlertDialogTrigger dialog={ref}>
        <Button variant="outline">
          <Text>Show Dialog</Text>
        </Button>
      </AlertDialogTrigger>
      <AlertDialog ref={(dialog) => void (ref.value = dialog ?? undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Text>Are you absolutely sure?</Text>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Text>
                This action cannot be undone. This will permanently delete your account and remove
                your data from our servers.
              </Text>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text>Cancel</Text>
            </AlertDialogCancel>
            <AlertDialogAction>
              <Text>Continue</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
