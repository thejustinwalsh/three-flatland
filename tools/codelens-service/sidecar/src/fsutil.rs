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

/// Strips a `file://` scheme and percent-decodes the remainder, leaving a
/// plain filesystem path. Non-`file://` strings (including already-bare
/// paths) pass through unchanged — decoding only applies to the part that
/// was actually a URI.
///
/// The decode step is load-bearing for cache correctness, not cosmetic: the
/// TS client always sends `document.uri.toString()`, which percent-encodes
/// reserved characters (a space becomes `%20`), while `path_to_uri` builds
/// its URIs from raw, unencoded OS paths during `workspace/scan`'s
/// directory-walk pre-warm. Without decoding here, the same real file (e.g.
/// anything under `Application Support` or a `OneDrive - Company Name`
/// path) would produce two different spellings of the same cache key, and
/// the SQLite persistence cache would never hit for it.
pub fn uri_to_path(uri: &str) -> String {
    match uri.strip_prefix("file://") {
        Some(rest) => percent_decode(rest),
        None => uri.to_string(),
    }
}

/// Decodes `%XX` hex-escape sequences (e.g. `%20` -> a space). Bytes that
/// aren't part of a valid `%XX` sequence pass through unchanged. Falls back
/// to the original string if decoding produces invalid UTF-8 (degrade, don't
/// panic — a malformed escape shouldn't crash the sidecar over a cache-key
/// nicety).
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hi = (bytes[i + 1] as char).to_digit(16);
            let lo = (bytes[i + 2] as char).to_digit(16);
            if let (Some(hi), Some(lo)) = (hi, lo) {
                out.push(((hi * 16) + lo) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| s.to_string())
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

    #[test]
    fn uri_to_path_percent_decodes_the_remainder() {
        assert_eq!(uri_to_path("file:///a/b%20c.ts"), "/a/b c.ts");
    }

    #[test]
    fn uri_to_path_leaves_a_bare_non_file_uri_string_unchanged() {
        // Non-`file://` strings (including already-bare paths) still pass
        // through unchanged — decoding only applies to the part that was
        // actually stripped off a `file://` URI.
        assert_eq!(uri_to_path("/a/b c.ts"), "/a/b c.ts");
    }

    #[test]
    fn round_trip_holds_both_directions_for_a_path_containing_a_space() {
        let path = Path::new("/a/b c.ts");

        // uri_to_path(path_to_uri(x)) == x
        let uri = path_to_uri(path);
        assert_eq!(uri_to_path(&uri), path.to_string_lossy());

        // path_to_uri(uri_to_path(x)) == x
        assert_eq!(path_to_uri(Path::new(&uri_to_path(&uri))), uri);
    }

    #[test]
    fn percent_decoding_makes_scan_and_client_cache_keys_agree_for_a_path_with_a_space() {
        // Regression for a real cache-defeating bug: the TS client always
        // sends `document.uri.toString()`, which VS Code percent-encodes
        // (a space becomes `%20`), while `workspace/scan`'s directory-walk
        // pre-warm derives its cache key via `path_to_uri` from a raw,
        // unencoded OS path. Before this fix, the same real file produced
        // two different SQLite cache-key spellings for any path containing
        // a space (extremely common — "Application Support",
        // "OneDrive - Company Name", etc.) — the persistence cache never
        // actually hit for such paths.
        let from_client_uri = uri_to_path("file:///Users/dev/Application%20Support/preset.ts");
        let from_scan_walk = uri_to_path(&path_to_uri(Path::new(
            "/Users/dev/Application Support/preset.ts",
        )));
        assert_eq!(from_client_uri, from_scan_walk);
        assert_eq!(from_client_uri, "/Users/dev/Application Support/preset.ts");
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
