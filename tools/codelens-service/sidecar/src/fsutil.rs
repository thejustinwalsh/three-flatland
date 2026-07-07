//! Filesystem helpers: `file://` URI <-> path conversion, mtime extraction,
//! and the default workspace directory walk used by `workspace/scan` when
//! the caller doesn't supply an explicit `candidates` list.

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::glob::glob_match;

const DEFAULT_EXTENSIONS: &[&str] = &["ts", "tsx", "js", "jsx", "mjs", "cjs"];
const DEFAULT_EXCLUDE_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "dist",
    "build",
    "target",
    "out",
    ".turbo",
    ".next",
    "coverage",
];
pub const DEFAULT_MAX_FILES: usize = 20_000;

/// Strips a `file://` scheme, leaving a plain filesystem path. Non-`file://`
/// strings (including already-bare paths) pass through unchanged.
pub fn uri_to_path(uri: &str) -> String {
    uri.strip_prefix("file://").unwrap_or(uri).to_string()
}

/// Builds a `file://` URI from an absolute POSIX-style path. Relative paths
/// are treated as already rooted at `/` (callers of this sidecar always deal
/// in absolute paths; Windows drive-letter URIs are not handled).
pub fn path_to_uri(path: &Path) -> String {
    let normalized = path.to_string_lossy().replace('\\', "/");
    if let Some(rest) = normalized.strip_prefix('/') {
        format!("file:///{rest}")
    } else {
        format!("file:///{normalized}")
    }
}

/// Modified time as Unix seconds, or 0 if unavailable (e.g. platforms
/// without mtime support, or a race where the file vanished mid-stat).
pub fn file_mtime_secs(meta: &std::fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Recursively collects files under `root` matching `include` (default:
/// the built-in TS/JS extension allowlist) and not matching `exclude`,
/// skipping known noisy directories (`node_modules`, `.git`, build output)
/// regardless of `include`/`exclude`. Stops once `max_files` entries are
/// found. Directory read errors are skipped, not fatal — a permissions
/// problem on one subtree should not abort the whole scan.
pub fn walk_workspace(
    root: &Path,
    include: Option<&str>,
    exclude: Option<&str>,
    max_files: usize,
) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        if out.len() >= max_files {
            break;
        }
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            if out.len() >= max_files {
                break;
            }
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_dir() {
                let name = entry.file_name();
                if DEFAULT_EXCLUDE_DIRS
                    .iter()
                    .any(|d| name.to_str() == Some(d))
                {
                    continue;
                }
                stack.push(path);
                continue;
            }
            if !file_type.is_file() {
                continue;
            }
            let rel = path
                .strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            if let Some(pattern) = exclude
                && glob_match(pattern, &rel)
            {
                continue;
            }
            let included = match include {
                Some(pattern) => glob_match(pattern, &rel),
                None => has_default_extension(&path),
            };
            if included {
                out.push(path);
            }
        }
    }
    out
}

fn has_default_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|ext| DEFAULT_EXTENSIONS.contains(&ext))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn uri_to_path_strips_file_scheme() {
        assert_eq!(uri_to_path("file:///a/b.ts"), "/a/b.ts");
        assert_eq!(uri_to_path("/a/b.ts"), "/a/b.ts");
    }

    #[test]
    fn path_to_uri_round_trips_with_uri_to_path() {
        let uri = path_to_uri(Path::new("/a/b.ts"));
        assert_eq!(uri, "file:///a/b.ts");
        assert_eq!(uri_to_path(&uri), "/a/b.ts");
    }

    fn setup_tree() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("src/nested")).unwrap();
        fs::create_dir_all(dir.path().join("node_modules/pkg")).unwrap();
        fs::write(dir.path().join("src/a.ts"), "zzfx(1,2,3);").unwrap();
        fs::write(dir.path().join("src/nested/b.tsx"), "zzfx(1,2,3);").unwrap();
        fs::write(dir.path().join("src/readme.md"), "not code").unwrap();
        fs::write(dir.path().join("node_modules/pkg/index.js"), "zzfx(1,2,3);").unwrap();
        dir
    }

    #[test]
    fn default_walk_finds_ts_files_and_skips_node_modules_and_non_code() {
        let dir = setup_tree();
        let found = walk_workspace(dir.path(), None, None, DEFAULT_MAX_FILES);
        let names: Vec<String> = found
            .iter()
            .map(|p| {
                p.strip_prefix(dir.path())
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/")
            })
            .collect();
        assert!(names.contains(&"src/a.ts".to_string()));
        assert!(names.contains(&"src/nested/b.tsx".to_string()));
        assert!(!names.iter().any(|n| n.contains("node_modules")));
        assert!(!names.contains(&"src/readme.md".to_string()));
    }

    #[test]
    fn max_files_caps_results() {
        let dir = setup_tree();
        let found = walk_workspace(dir.path(), None, None, 1);
        assert_eq!(found.len(), 1);
    }

    #[test]
    fn explicit_exclude_pattern_is_honored() {
        let dir = setup_tree();
        let found = walk_workspace(dir.path(), None, Some("**/nested/**"), DEFAULT_MAX_FILES);
        let names: Vec<String> = found
            .iter()
            .map(|p| {
                p.strip_prefix(dir.path())
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/")
            })
            .collect();
        assert!(names.contains(&"src/a.ts".to_string()));
        assert!(!names.iter().any(|n| n.contains("nested")));
    }

    #[test]
    fn missing_root_directory_returns_empty_not_error() {
        let found = walk_workspace(
            Path::new("/definitely/not/a/real/path/xyz"),
            None,
            None,
            DEFAULT_MAX_FILES,
        );
        assert!(found.is_empty());
    }
}
