# Diagrams

Hand-authored architecture diagrams used in the docs. Source is the
`.excalidraw` file; the committed `.svg` next to it is what pages
embed (so the docs build has zero render-time dependency on
Excalidraw).

## Workflow

Edit and re-export when the source changes — both files get committed.

### From VS Code (recommended)

1. Open the `.excalidraw` file with the
   [Excalidraw extension](https://marketplace.visualstudio.com/items?itemName=pomdtr.excalidraw-editor).
2. Make changes. Save updates the `.excalidraw` source in place.
3. Right-click the canvas → **Export image…** → choose **SVG** → save
   over the sibling `.svg` (same basename).

### From excalidraw.com

1. Open <https://excalidraw.com>, drag the `.excalidraw` file onto
   the canvas (or **Open** from the menu).
2. Make changes. Use **Save to…** to write back to the source file.
3. **Export image…** → **SVG** → save over the sibling `.svg`.

## Embedding in MDX

```mdx
import diagram from '/src/assets/diagrams/<name>.svg?raw'

<div class="diagram" set:html={diagram} />
```

Inline `?raw` keeps the SVG searchable by the browser and lets it
inherit the page's CSS variables. For a plain `<img>` reference,
import without `?raw` and use the result as `src`.
