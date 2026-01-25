import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');
const outputDir = resolve(__dirname, '../public/examples');

const examples = [
  { type: 'vanilla', name: 'basic-sprite' },
  { type: 'vanilla', name: 'animation' },
  { type: 'vanilla', name: 'batch-demo' },
  { type: 'vanilla', name: 'tsl-nodes' },
  { type: 'vanilla', name: 'tilemap' },
  { type: 'react', name: 'basic-sprite' },
  { type: 'react', name: 'animation' },
  { type: 'react', name: 'batch-demo' },
  { type: 'react', name: 'tsl-nodes' },
  { type: 'react', name: 'tilemap' },
];

// Clean output directory
rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

console.log('Building examples for production...\n');

for (const { type, name } of examples) {
  const exampleDir = resolve(root, `examples/${type}/${name}`);
  const destDir = resolve(outputDir, type, name);

  if (!existsSync(exampleDir)) {
    console.log(`Skipping ${type}/${name} (not found)`);
    continue;
  }

  console.log(`Building ${type}/${name}...`);

  // Build with correct base path for GitHub Pages
  // The base path is /three-flatland/examples/{type}/{name}/
  const basePath = `/three-flatland/examples/${type}/${name}/`;

  try {
    execSync(`pnpm vite build --base "${basePath}"`, {
      cwd: exampleDir,
      stdio: 'inherit',
    });

    // Copy built files to docs/public/examples/{type}/{name}/
    const distDir = resolve(exampleDir, 'dist');
    if (existsSync(distDir)) {
      mkdirSync(destDir, { recursive: true });
      cpSync(distDir, destDir, { recursive: true });
      console.log(`  → Copied to ${destDir}\n`);
    } else {
      console.log(`  → Warning: No dist folder found\n`);
    }
  } catch (error) {
    console.error(`  → Failed to build ${type}/${name}:`, error.message);
  }
}

console.log('Example build complete!');
