/**
 * TypeDoc plugin to transform source links for external dependencies (e.g., Three.js)
 * Maps node_modules/@types/three paths to Three.js documentation URLs
 */

/**
 * @param {import('typedoc').Application} app
 */
export function load(app) {
  // Hook into the converter to modify source locations
  app.converter.on('resolveEnd', (context) => {
    const project = context.project;

    // Walk all reflections and transform external source links
    for (const reflection of Object.values(project.reflections)) {
      if (reflection.sources) {
        for (const source of reflection.sources) {
          // Get the member name for anchor links
          const memberName = reflection.name;
          const transformed = transformExternalSource(source, memberName);
          if (transformed) {
            source.fileName = transformed.fileName;
            source.url = transformed.url;
            // Use member name instead of line number
            source.line = memberName;
            source.character = undefined;
          }
        }
      }
    }
  });
}

/**
 * Transform a source location from node_modules to Three.js docs URL
 * @param {object} source - TypeDoc source object with fileName, line, etc.
 * @param {string} memberName - The name of the member (property/method) for anchor links
 * @returns {object|null} - Transformed source or null if not external
 */
function transformExternalSource(source, memberName) {
  const fileName = source.fileName;

  // Match @types/three paths
  // e.g., node_modules/.pnpm/@types+three@0.182.0/node_modules/@types/three/src/core/Object3D.d.ts
  const threeTypesMatch = fileName.match(
    /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?@types\/three\/(.+)$/
  );

  if (threeTypesMatch) {
    const relativePath = threeTypesMatch[1];
    // Extract path and class name for Three.js docs
    // e.g., src/core/Object3D.d.ts -> core/Object3D
    const docsPath = relativePath
      .replace(/^src\//, '')
      .replace(/\.d\.ts$/, '');
    // Three.js docs use format: #api/en/core/Object3D.propertyName
    const anchor = memberName ? `.${memberName}` : '';
    const url = `https://threejs.org/docs/#api/en/${docsPath}${anchor}`;

    return {
      fileName: `three.js/${docsPath}`,
      url,
    };
  }

  // Match three package paths (if using the actual package, not just types)
  const threeMatch = fileName.match(
    /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?three\/(.+)$/
  );

  if (threeMatch) {
    const relativePath = threeMatch[1];
    // Extract path for Three.js docs
    const docsPath = relativePath
      .replace(/^src\//, '')
      .replace(/\.(js|ts|d\.ts)$/, '');
    const anchor = memberName ? `.${memberName}` : '';
    const url = `https://threejs.org/docs/#api/en/${docsPath}${anchor}`;

    return {
      fileName: `three.js/${docsPath}`,
      url,
    };
  }

  return null;
}
