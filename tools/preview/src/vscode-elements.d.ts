import type * as React from 'react'

// JSX intrinsic for the vscode-progress-ring web component. Consumers still
// register the element implementation from @vscode-elements/elements.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'vscode-progress-ring': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
    }
  }
}

export {}
