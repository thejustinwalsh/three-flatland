import type * as React from 'react'

// Shared webview intrinsic declarations must not depend on another entry's
// incidental import graph. Each webview registers the runtime elements it uses.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'vscode-progress-ring': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
    }
  }
}

export {}
