import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';

// Resolve from process.cwd() (always docs/ when astro runs) so the path is
// stable regardless of where Vite bundles this module at build time.
const repoRoot = path.resolve(process.cwd(), '..');

// Read catalog versions once at build time
const workspaceYamlPath = path.resolve(repoRoot, 'pnpm-workspace.yaml');
const workspaceYaml = yaml.parse(fs.readFileSync(workspaceYamlPath, 'utf-8'));
export const catalog = (workspaceYaml.catalog ?? {}) as Record<string, string>;

// Read package versions for workspace:* resolution
function getPackageVersion(packageName: string): string {
  const pkgPath = path.resolve(repoRoot, `packages/${packageName}/package.json`);
  if (fs.existsSync(pkgPath)) {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version;
  }
  return '0.0.0';
}

export const packageVersions: Record<string, string> = {
  'three-flatland': getPackageVersion('three-flatland'),
  '@three-flatland/nodes': getPackageVersion('nodes'),
  '@three-flatland/presets': getPackageVersion('presets'),
};

export function transformPackageJson(pkg: Record<string, unknown>): Record<string, unknown> {
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

export function loadDirectoryFiles(
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

export function loadPublicFiles(
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

export function isTextFile(filename: string): boolean {
  return /\.(json|css|txt|md|html|xml|svg|ts|tsx|js|jsx|mjs|cjs)$/i.test(filename);
}

export function isBinaryAsset(filename: string): boolean {
  return /\.(png|jpg|jpeg|gif|webp|ico|ttf|woff|woff2|mp3|wav|ogg)$/i.test(filename);
}

export function getMimeType(filename: string): string {
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
