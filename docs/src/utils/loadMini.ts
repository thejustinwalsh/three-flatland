import fs from 'node:fs';
import path from 'node:path';
import {
  transformPackageJson,
  loadDirectoryFiles,
  loadPublicFiles,
} from './loadHelpers';

const repoRoot = path.resolve(process.cwd(), '..');

/**
 * Load a mini-game from minis/{name} and transform for StackBlitz.
 * Minis are React-only (no type param needed).
 */
export function loadMini(name: string): Record<string, string> {
  const miniDir = path.resolve(repoRoot, `minis/${name}`);
  const files: Record<string, string> = {};

  // Transform package.json
  const pkgJsonPath = path.join(miniDir, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    files['package.json'] = JSON.stringify(transformPackageJson(pkgJson), null, 2);
  }

  // Generate standalone tsconfig.json
  files['tsconfig.json'] = JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        jsx: 'react-jsx',
        esModuleInterop: true,
        skipLibCheck: true,
      },
      include: ['src/**/*.ts', 'src/**/*.tsx', '*.ts', '*.tsx'],
    },
    null,
    2
  );

  // Transform vite.config.ts — strip babel-plugin-react-compiler (unavailable in StackBlitz)
  const viteConfigPath = path.join(miniDir, 'vite.config.ts');
  if (fs.existsSync(viteConfigPath)) {
    let viteConfig = fs.readFileSync(viteConfigPath, 'utf-8');
    // Remove react-compiler babel plugin configuration
    viteConfig = viteConfig.replace(
      /react\(\{[\s\S]*?babel:\s*\{[\s\S]*?plugins:\s*\[['"]babel-plugin-react-compiler['"]\][,\s]*\}[,\s]*\}\)/,
      'react()'
    );
    files['vite.config.ts'] = viteConfig;
  }

  // Copy root source files
  const rootFiles = ['index.html', 'main.tsx', 'App.tsx'];
  for (const file of rootFiles) {
    const filePath = path.join(miniDir, file);
    if (fs.existsSync(filePath)) {
      files[file] = fs.readFileSync(filePath, 'utf-8');
    }
  }

  // Copy src/ directory recursively
  const srcDir = path.join(miniDir, 'src');
  if (fs.existsSync(srcDir)) {
    loadDirectoryFiles(srcDir, 'src', files);
  }

  // Copy public/ directory (SVGs, assets)
  const publicDir = path.join(miniDir, 'public');
  if (fs.existsSync(publicDir)) {
    loadPublicFiles(publicDir, 'public', files);
  }

  return files;
}
