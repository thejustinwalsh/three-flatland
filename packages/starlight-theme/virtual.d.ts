import type { StarlightThemeConfig } from './core/config/schemas'
import type { StarlightConfig } from '@astrojs/starlight/types'
import type { AstroConfig, ImageMetadata } from 'astro'
import type LastUpdatedComponent from '@astrojs/starlight/components/LastUpdated.astro'
import type PaginationComponent from '@astrojs/starlight/components/Pagination.astro'
import type EditLinkComponent from '@astrojs/starlight/components/EditLink.astro'

declare module 'virtual:starlight-theme-config' {
  const StarlightThemeConfig: StarlightThemeConfig
  export default StarlightThemeConfig
}

declare module 'virtual:starlight/user-config' {
  const Config: StarlightConfig
  export default Config
}

declare module 'virtual:starlight/user-images' {
  export const logos: {
    dark?: ImageMetadata
    light?: ImageMetadata
  }
}

declare module 'virtual:starlight/pagefind-config' {
  export const pagefindUserConfig: Partial<Extract<StarlightConfig['pagefind'], object>>
}

declare module 'virtual:starlight/project-context' {
  const ProjectContext: {
    root: string
    srcDir: string
    trailingSlash: AstroConfig['trailingSlash']
    build: {
      format: AstroConfig['build']['format']
    }
    legacyCollections: boolean
  }
  export default ProjectContext
}

declare module 'virtual:starlight/components/LastUpdated' {
  const LastUpdated: LastUpdatedComponent
  export default LastUpdated
}

declare module 'virtual:starlight/components/Pagination' {
  const Pagination: PaginationComponent
  export default Pagination
}

declare module 'virtual:starlight/components/EditLink' {
  const EditLink: EditLinkComponent
  export default EditLink
}
