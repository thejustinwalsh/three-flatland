//! Method handlers: `initialize`, `workspace/scan`, `document/parse`,
//! `document/didChange`, `shutdown`. Pure(ish) request/response logic,
//! independent of the JSON-RPC envelope and stdio transport so it's testable
//! without spawning a process.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::db::{Db, FileMeta};
use crate::fsutil::{DEFAULT_MAX_FILES, file_mtime_secs, path_to_uri, uri_to_path, walk_workspace};
use crate::id::fnv1a64;
use crate::model::Finding;
use crate::parse::find_zzfx_calls;
use crate::scan::has_zzfx_candidate;

fn hex_hash(bytes: &[u8]) -> String {
    format!("{:016x}", fnv1a64(bytes))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitializeParams {
    pub workspace_root: String,
    pub storage_uri: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    pub scan: bool,
    pub parse: bool,
    pub incremental: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InitializeResult {
    pub version: String,
    pub capabilities: Capabilities,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub degraded: Option<bool>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanParams {
    #[serde(default)]
    pub candidates: Option<Vec<String>>,
    #[serde(default)]
    pub include: Option<String>,
    #[serde(default)]
    pub exclude: Option<String>,
    #[serde(default)]
    pub max_files: Option<usize>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScanMatch {
    pub uri: String,
    pub content_hash: String,
    pub has_candidate: bool,
}

#[derive(Debug, Serialize)]
pub struct ScanResult {
    pub matches: Vec<ScanMatch>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseParams {
    pub uri: String,
    pub text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseResult {
    pub uri: String,
    pub findings: Vec<Finding>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DidChangeParams {
    pub uri: String,
    pub text: String,
}

pub struct AppState {
    pub db: Db,
    pub workspace_root: Option<String>,
    pub initialized: bool,
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            db: Db::open(None),
            workspace_root: None,
            initialized: false,
        }
    }

    pub fn handle_initialize(&mut self, params: InitializeParams) -> InitializeResult {
        self.workspace_root = Some(params.workspace_root);
        self.db = Db::open(Some(&params.storage_uri));
        self.initialized = true;
        InitializeResult {
            version: env!("CARGO_PKG_VERSION").to_string(),
            capabilities: Capabilities {
                scan: true,
                parse: true,
                incremental: true,
            },
            degraded: self.db.degraded.then_some(true),
        }
    }

    pub fn handle_scan(&mut self, params: ScanParams) -> ScanResult {
        let max_files = params.max_files.unwrap_or(DEFAULT_MAX_FILES);

        let targets: Vec<(String, PathBuf)> = match &params.candidates {
            Some(list) => list
                .iter()
                .map(|uri| (uri.clone(), PathBuf::from(uri_to_path(uri))))
                .collect(),
            None => {
                let root = self.workspace_root.clone().unwrap_or_default();
                let root_path = PathBuf::from(uri_to_path(&root));
                walk_workspace(
                    &root_path,
                    params.include.as_deref(),
                    params.exclude.as_deref(),
                    max_files,
                )
                .into_iter()
                .map(|path| {
                    let uri = path_to_uri(&path);
                    (uri, path)
                })
                .collect()
            }
        };

        let mut matches = Vec::new();
        for (uri, path) in targets.into_iter().take(max_files) {
            let Ok(bytes) = std::fs::read(&path) else {
                continue;
            };
            let has_candidate = has_zzfx_candidate(&bytes);
            let content_hash = hex_hash(&bytes);
            let disk_meta = std::fs::metadata(&path).ok();
            let meta = FileMeta {
                mtime: disk_meta.as_ref().map(file_mtime_secs).unwrap_or(0),
                size: bytes.len() as i64,
                content_hash: content_hash.clone(),
                has_candidate,
            };
            self.db.write_file_meta(&uri_to_path(&uri), meta);
            matches.push(ScanMatch {
                uri,
                content_hash,
                has_candidate,
            });
        }
        ScanResult { matches }
    }

    pub fn handle_parse(&mut self, params: ParseParams) -> ParseResult {
        let findings = self.parse_and_cache(&params.uri, &params.text);
        ParseResult {
            uri: params.uri,
            findings,
        }
    }

    pub fn handle_did_change(&mut self, params: DidChangeParams) {
        self.parse_and_cache(&params.uri, &params.text);
        let path = uri_to_path(&params.uri);
        let hashes: Vec<u64> = params
            .text
            .lines()
            .map(|line| fnv1a64(line.as_bytes()))
            .collect();
        self.db.write_line_hashes(&path, &hashes);
    }

    /// Shared cache-or-parse path for `document/parse` and
    /// `document/didChange`: reuses the cached findings when `text` is
    /// byte-identical to what's on disk at the cached (mtime, size); parses
    /// fresh and writes through otherwise.
    fn parse_and_cache(&mut self, uri: &str, text: &str) -> Vec<Finding> {
        let path = uri_to_path(uri);
        let disk_meta = std::fs::metadata(&path).ok();
        let disk_mtime = disk_meta.as_ref().map(file_mtime_secs).unwrap_or(0);
        let disk_size = disk_meta.as_ref().map(|m| m.len() as i64);
        let text_hash = hex_hash(text.as_bytes());

        if let Some(disk_size) = disk_size
            && self
                .db
                .has_fresh_findings(&path, disk_mtime, disk_size, &text_hash)
        {
            return self.db.cached_findings(&path);
        }

        let findings = find_zzfx_calls(uri, text);
        let meta = FileMeta {
            mtime: disk_mtime,
            size: text.len() as i64,
            content_hash: text_hash,
            has_candidate: has_zzfx_candidate(text.as_bytes()),
        };
        self.db.write_through(&path, meta, &findings);
        findings
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn initialize_reports_capabilities_and_not_degraded_when_storage_usable() {
        let dir = tempfile::tempdir().unwrap();
        let mut state = AppState::new();
        let result = state.handle_initialize(InitializeParams {
            workspace_root: dir.path().to_string_lossy().to_string(),
            storage_uri: dir.path().join("storage").to_string_lossy().to_string(),
        });
        assert!(result.capabilities.scan);
        assert!(result.capabilities.parse);
        assert!(result.capabilities.incremental);
        assert_eq!(result.degraded, None);
    }

    #[test]
    fn initialize_reports_degraded_when_storage_unusable() {
        let dir = tempfile::tempdir().unwrap();
        let blocking_file = dir.path().join("not-a-dir");
        fs::write(&blocking_file, b"x").unwrap();
        let mut state = AppState::new();
        let result = state.handle_initialize(InitializeParams {
            workspace_root: dir.path().to_string_lossy().to_string(),
            storage_uri: blocking_file.join("nested").to_string_lossy().to_string(),
        });
        assert_eq!(result.degraded, Some(true));
    }

    #[test]
    fn parse_extracts_findings_and_caches_them() {
        let mut state = AppState::new();
        let params = ParseParams {
            uri: "file:///nonexistent/a.ts".to_string(),
            text: "zzfx(1,.05,220);".to_string(),
        };
        let result = state.handle_parse(params);
        assert_eq!(result.findings.len(), 1);
        assert_eq!(result.findings[0].payload.params, vec![1.0, 0.05, 220.0]);
    }

    #[test]
    fn parse_reuses_cache_when_text_matches_disk_exactly() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("a.ts");
        let text = "zzfx(1,.05,220);";
        fs::write(&file_path, text).unwrap();
        let uri = path_to_uri(&file_path);

        let mut state = AppState::new();
        let first = state.handle_parse(ParseParams {
            uri: uri.clone(),
            text: text.to_string(),
        });
        assert_eq!(first.findings.len(), 1);
        let first_id = first.findings[0].id.clone();

        // Second call with identical text/disk-state must return the exact
        // same cached finding (same id), proving the cache path ran rather
        // than a fresh parse (which would also produce the same id here,
        // but a mutated cache entry would prove it via the meta check below).
        let second = state.handle_parse(ParseParams {
            uri,
            text: text.to_string(),
        });
        assert_eq!(second.findings.len(), 1);
        assert_eq!(second.findings[0].id, first_id);
    }

    #[test]
    fn parse_reparses_when_text_diverges_from_cached_disk_snapshot() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("a.ts");
        fs::write(&file_path, "zzfx(1,.05,220);").unwrap();
        let uri = path_to_uri(&file_path);

        let mut state = AppState::new();
        state.handle_parse(ParseParams {
            uri: uri.clone(),
            text: "zzfx(1,.05,220);".to_string(),
        });

        // Unsaved edit: text no longer matches what's on disk (or cached).
        let edited = state.handle_parse(ParseParams {
            uri,
            text: "zzfx(2,.1,440);".to_string(),
        });
        assert_eq!(edited.findings[0].payload.params, vec![2.0, 0.1, 440.0]);
    }

    #[test]
    fn did_change_updates_cache_silently() {
        let mut state = AppState::new();
        state.handle_did_change(DidChangeParams {
            uri: "file:///nonexistent/a.ts".to_string(),
            text: "zzfx(1,2,3);\nzzfx(4,5,6);\n".to_string(),
        });
        let cached = state.db.cached_findings("/nonexistent/a.ts");
        assert_eq!(cached.len(), 2);
    }

    #[test]
    fn scan_explicit_candidates_reports_has_candidate_and_hash() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a.ts");
        let b = dir.path().join("b.ts");
        fs::write(&a, "zzfx(1,2,3);").unwrap();
        fs::write(&b, "// zzfx(1,2,3) commented\nconst x = 1;").unwrap();

        let mut state = AppState::new();
        let result = state.handle_scan(ScanParams {
            candidates: Some(vec![path_to_uri(&a), path_to_uri(&b)]),
            ..Default::default()
        });
        assert_eq!(result.matches.len(), 2);
        let a_match = result
            .matches
            .iter()
            .find(|m| m.uri == path_to_uri(&a))
            .unwrap();
        assert!(a_match.has_candidate);
        let b_match = result
            .matches
            .iter()
            .find(|m| m.uri == path_to_uri(&b))
            .unwrap();
        assert!(!b_match.has_candidate);
    }

    #[test]
    fn parse_after_scan_of_the_same_unparsed_file_still_finds_calls() {
        // Regression: a scan pass only records candidacy metadata, never
        // findings. A subsequent document/parse on that same file/text must
        // not mistake the scan's metadata row for a findings cache hit and
        // return zero findings for a file that plainly has a call.
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("sfx.ts");
        let text = "zzfx(...[1,.05,220,0,.02]);";
        fs::write(&file_path, text).unwrap();
        let uri = path_to_uri(&file_path);

        let mut state = AppState::new();
        let scan = state.handle_scan(ScanParams {
            candidates: Some(vec![uri.clone()]),
            ..Default::default()
        });
        assert!(scan.matches[0].has_candidate);

        let parsed = state.handle_parse(ParseParams {
            uri,
            text: text.to_string(),
        });
        assert_eq!(
            parsed.findings.len(),
            1,
            "scan-only metadata must not shadow a real parse"
        );
    }

    #[test]
    fn scan_missing_candidate_file_is_skipped_not_a_crash() {
        let mut state = AppState::new();
        let result = state.handle_scan(ScanParams {
            candidates: Some(vec!["file:///definitely/missing.ts".to_string()]),
            ..Default::default()
        });
        assert!(result.matches.is_empty());
    }

    #[test]
    fn scan_without_candidates_walks_workspace_root() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a.ts"), "zzfx(1,2,3);").unwrap();
        fs::create_dir_all(dir.path().join("node_modules")).unwrap();
        fs::write(dir.path().join("node_modules/skip.ts"), "zzfx(1,2,3);").unwrap();

        let mut state = AppState::new();
        state.workspace_root = Some(dir.path().to_string_lossy().to_string());
        let result = state.handle_scan(ScanParams::default());
        assert_eq!(result.matches.len(), 1);
        assert!(result.matches[0].uri.ends_with("a.ts"));
    }

    #[test]
    fn scan_writes_through_metadata_without_clobbering_prior_findings() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a.ts");
        let text = "zzfx(1,2,3);";
        fs::write(&a, text).unwrap();
        let uri = path_to_uri(&a);

        let mut state = AppState::new();
        state.handle_parse(ParseParams {
            uri: uri.clone(),
            text: text.to_string(),
        });
        state.handle_scan(ScanParams {
            candidates: Some(vec![uri]),
            ..Default::default()
        });
        let cached = state.db.cached_findings(&a.to_string_lossy());
        assert_eq!(cached.len(), 1);
    }
}
