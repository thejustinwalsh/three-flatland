import { Text } from '@three-flatland/uikit/react'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@three-flatland/uikit-default/react'

export function PaginationDemo() {
  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink>
            <Text>1</Text>
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink isActive>
            <Text>2</Text>
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink>
            <Text>3</Text>
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationEllipsis />
        </PaginationItem>
        <PaginationItem>
          <PaginationNext />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
