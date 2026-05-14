import fs from 'node:fs';
import path from 'node:path';
import {
  transformPackageJson,
  loadDirectoryFiles,
  loadPublicFiles,
} from './loadHelpers';

const repoRoot = path.resolve(process.cwd(), '..');

/**
 * Load an example from examples/{type}/{name} and transform for StackBlitz
 */
export function loadExample(
  type: 'three' | 'react',
  name: string
): Record<string, string> {
  const exampleDir = path.resolve(repoRoot, `examples/${type}/${name}`);
  const files: Record<string, string> = {};

  // Transform package.json
  const pkgJsonPath = path.join(exampleDir, 'package.json');
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
      include: ['*.ts', '*.tsx'],
    },
    null,
    2
  );

  // Transform vite.config.ts (change base path to '/')
  const viteConfigPath = path.join(exampleDir, 'vite.config.ts');
  if (fs.existsSync(viteConfigPath)) {
    const viteConfig = fs.readFileSync(viteConfigPath, 'utf-8');
    files['vite.config.ts'] = viteConfig.replace(/base:\s*['"][^'"]+['"]/, "base: '/'");
  }

  // Copy source files
  const sourceFiles = [
    'index.html',
    'main.ts',
    'main.tsx',
    'App.tsx',
    'style.css',
    'styles.css',
  ];
  for (const file of sourceFiles) {
    const filePath = path.join(exampleDir, file);
    if (fs.existsSync(filePath)) {
      files[file] = fs.readFileSync(filePath, 'utf-8');
    }
  }

  // Copy src/ directory if it exists
  const srcDir = path.join(exampleDir, 'src');
  if (fs.existsSync(srcDir)) {
    loadDirectoryFiles(srcDir, 'src', files);
  }

  // Copy public/ directory (sprites, maps, etc.)
  const publicDir = path.join(exampleDir, 'public');
  if (fs.existsSync(publicDir)) {
    loadPublicFiles(publicDir, 'public', files);
  }

  return files;
}
