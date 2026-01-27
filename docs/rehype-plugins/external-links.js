/**
 * Rehype plugin to add target="_blank" and rel="noopener noreferrer" to external links
 * Excludes links to project-owned resources (GitHub repo, npm packages)
 * Adds inline pixelarticons external-link SVG icon
 */

import { visit } from 'unist-util-visit';

// URLs that should NOT be treated as external (project-owned resources)
const INTERNAL_PATTERNS = [
  /^https?:\/\/github\.com\/thejustinwalsh\/three-flatland/,
  /^https?:\/\/www\.npmjs\.com\/package\/@three-flatland/,
  /^https?:\/\/thejustinwalsh\.com\/three-flatland/,
];

// Pixelarticons external-link SVG wrapped in span for inline display
const EXTERNAL_ICON = {
  type: 'element',
  tagName: 'span',
  properties: {
    className: ['external-link-icon'],
    ariaHidden: 'true',
  },
  children: [
    {
      type: 'element',
      tagName: 'svg',
      properties: {
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox: '0 0 24 24',
        width: '1em',
        height: '1em',
        fill: 'currentColor',
        style: 'vertical-align: -0.125em;',
      },
      children: [
        {
          type: 'element',
          tagName: 'path',
          properties: {
            d: 'M21 11V3h-8v2h4v2h-2v2h-2v2h-2v2H9v2h2v-2h2v-2h2V9h2V7h2v4h2zM11 5H3v16h16v-8h-2v6H5V7h6V5z',
            fill: 'currentColor',
          },
          children: [],
        },
      ],
    },
  ],
};

function isExternalUrl(href) {
  if (!href || !href.startsWith('http')) {
    return false;
  }

  // Check if URL matches any internal pattern
  for (const pattern of INTERNAL_PATTERNS) {
    if (pattern.test(href)) {
      return false;
    }
  }

  return true;
}

export function rehypeExternalLinks() {
  return (tree) => {
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName === 'a' && isExternalUrl(node.properties?.href)) {
        node.properties.target = '_blank';
        node.properties.rel = 'noopener noreferrer';
        node.properties.className = node.properties.className || [];
        if (Array.isArray(node.properties.className)) {
          node.properties.className.push('external-link');
        } else {
          node.properties.className = [node.properties.className, 'external-link'];
        }

        // Append the icon SVG as a child of the link
        node.children.push(structuredClone(EXTERNAL_ICON));
      }
    });
  };
}

export default rehypeExternalLinks;
