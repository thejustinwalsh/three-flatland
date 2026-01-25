import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read catalog versions once at build time
const workspaceYamlPath = path.resolve(__dirname, '../../../pnpm-workspace.yaml');
const workspaceYaml = yaml.parse(fs.readFileSync(workspaceYamlPath, 'utf-8'));
const catalog = (workspaceYaml.catalog ?? {}) as Record<string, string>;

// Read package versions for workspace:* resolution
function getPackageVersion(packageName: string): string {
  const pkgPath = path.resolve(__dirname, `../../../packages/${packageName}/package.json`);
  if (fs.existsSync(pkgPath)) {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version;
  }
  return '0.0.0';
}

const packageVersions: Record<string, string> = {
  '@three-flatland/core': getPackageVersion('core'),
  '@three-flatland/nodes': getPackageVersion('nodes'),
  '@three-flatland/react': getPackageVersion('react'),
  '@three-flatland/presets': getPackageVersion('presets'),
};

/**
 * Load an example from examples/{type}/{name} and transform for StackBlitz
 */
export function loadExample(
  type: 'vanilla' | 'react',
  name: string
): Record<string, string> {
  const exampleDir = path.resolve(__dirname, `../../../examples/${type}/${name}`);
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

function transformPackageJson(pkg: Record<string, unknown>): Record<string, unknown> {
  const transformed = { ...pkg };
  delete transformed.private;

  // Transform dependencies
  for (const depType of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
    const deps = transformed[depType] as Record<string, string> | undefined;
    if (!deps) continue;

    for (const [name, version] of Object.entries(deps)) {
      if (version === 'workspace:*') {
        // Replace workspace:* with actual version
        if (packageVersions[name]) {
          deps[name] = `^${packageVersions[name]}`;
        }
      } else if (version === 'catalog:') {
        // Replace catalog: with resolved version
        deps[name] = catalog[name] || version;
      }
    }
  }

  return transformed;
}

function loadDirectoryFiles(
  dir: string,
  prefix: string,
  files: Record<string, string>
): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = `${prefix}/${entry.name}`;

    if (entry.isDirectory()) {
      loadDirectoryFiles(fullPath, relativePath, files);
    } else if (isTextFile(entry.name)) {
      files[relativePath] = fs.readFileSync(fullPath, 'utf-8');
    }
  }
}

function loadPublicFiles(
  dir: string,
  prefix: string,
  files: Record<string, string>
): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = `${prefix}/${entry.name}`;

    if (entry.isDirectory()) {
      loadPublicFiles(fullPath, relativePath, files);
    } else if (isTextFile(entry.name)) {
      // Text files can be included directly
      files[relativePath] = fs.readFileSync(fullPath, 'utf-8');
    } else if (isBinaryAsset(entry.name)) {
      // Binary files need to be base64 encoded for StackBlitz
      const buffer = fs.readFileSync(fullPath);
      const base64 = buffer.toString('base64');
      const mimeType = getMimeType(entry.name);
      files[relativePath] = `data:${mimeType};base64,${base64}`;
    }
  }
}

function isTextFile(filename: string): boolean {
  return /\.(json|css|txt|md|html|xml|svg|ts|tsx|js|jsx|mjs|cjs)$/i.test(filename);
}

function isBinaryAsset(filename: string): boolean {
  return /\.(png|jpg|jpeg|gif|webp|ico|ttf|woff|woff2|mp3|wav|ogg)$/i.test(filename);
}

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}
