//! SQLite-backed cache: file metadata (for change detection), findings
//! (write-through parse results), and per-line hashes (groundwork for a
//! future incremental parse). Degrades to an in-memory database if the
//! caller-provided storage location can't be opened/created, and reports
//! that degradation to the caller rather than failing the whole process.

use std::path::Path;

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::model::Finding;

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS files (
    path TEXT PRIMARY KEY,
    mtime INTEGER NOT NULL,
    size INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    has_candidate INTEGER NOT NULL,
    has_findings INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS findings (
    file_path TEXT NOT NULL,
    id TEXT NOT NULL,
    json TEXT NOT NULL,
    PRIMARY KEY (file_path, id)
);
CREATE TABLE IF NOT EXISTS line_hashes (
    file_path TEXT NOT NULL,
    line INTEGER NOT NULL,
    hash INTEGER NOT NULL,
    PRIMARY KEY (file_path, line)
);
";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileMeta {
    pub mtime: i64,
    pub size: i64,
    pub content_hash: String,
    pub has_candidate: bool,
}

pub struct Db {
    conn: Connection,
    /// True when `storageUri` couldn't be opened and we fell back to an
    /// in-memory database — the cache still works, it just doesn't survive
    /// process restarts.
    pub degraded: bool,
}

impl Db {
    /// Opens (creating if needed) a SQLite file at `<storage_dir>/codelens-cache.sqlite`.
    /// Falls back to an in-memory database on any failure to create the
    /// directory or open the file there.
    pub fn open(storage_dir: Option<&str>) -> Self {
        let opened = storage_dir.and_then(|dir| Self::open_on_disk(dir).ok());
        match opened {
            Some(conn) => Db {
                conn,
                degraded: false,
            },
            None => Db {
                conn: Connection::open_in_memory().expect("in-memory sqlite must open"),
                degraded: true,
            },
        }
        .with_schema()
    }

    fn open_on_disk(dir: &str) -> rusqlite::Result<Connection> {
        std::fs::create_dir_all(dir).map_err(|e| {
            rusqlite::Error::SqliteFailure(rusqlite::ffi::Error::new(1), Some(e.to_string()))
        })?;
        let path = Path::new(dir).join("codelens-cache.sqlite");
        Connection::open(path)
    }

    fn with_schema(self) -> Self {
        self.conn.execute_batch(SCHEMA).expect("schema must apply");
        self.migrate();
        self
    }

    /// `CREATE TABLE IF NOT EXISTS` only helps on a brand-new cache file —
    /// it does nothing for a `files` table that already exists from an
    /// older build of this binary and is missing a column added since.
    /// Without this, opening an old on-disk cache after an upgrade would
    /// panic on the first write. Each migration is independently
    /// idempotent (checked against `PRAGMA table_info` before applying).
    fn migrate(&self) {
        let has_has_findings_column = self
            .conn
            .prepare("SELECT has_findings FROM files LIMIT 0")
            .is_ok();
        if !has_has_findings_column {
            self.conn
                .execute(
                    "ALTER TABLE files ADD COLUMN has_findings INTEGER NOT NULL DEFAULT 0",
                    [],
                )
                .expect("migration must apply");
        }
    }

    /// Looks up cached file metadata for change detection.
    pub fn file_meta(&self, path: &str) -> Option<FileMeta> {
        self.conn
            .query_row(
                "SELECT mtime, size, content_hash, has_candidate FROM files WHERE path = ?1",
                params![path],
                |row| {
                    Ok(FileMeta {
                        mtime: row.get(0)?,
                        size: row.get(1)?,
                        content_hash: row.get(2)?,
                        has_candidate: row.get::<_, i64>(3)? != 0,
                    })
                },
            )
            .optional()
            .expect("query must not fail")
    }

    /// Cached findings for `path`, in insertion order. Empty if there's no
    /// cache entry (callers distinguish "no entry" from "entry, zero
    /// findings" via [`Db::file_meta`] first).
    pub fn cached_findings(&self, path: &str) -> Vec<Finding> {
        let mut stmt = self
            .conn
            .prepare("SELECT json FROM findings WHERE file_path = ?1")
            .expect("prepare must not fail");
        let rows = stmt
            .query_map(params![path], |row| row.get::<_, String>(0))
            .expect("query must not fail");
        rows.filter_map(|r| r.ok())
            .filter_map(|json| serde_json::from_str(&json).ok())
            .collect()
    }

    /// Write-through: replaces `path`'s file metadata and findings in a
    /// single transaction. Marks the row `has_findings` (queried by
    /// [`Db::has_fresh_findings`]) — even an empty `findings` slice is a
    /// meaningful, authoritative "parsed, found nothing" cache state.
    pub fn write_through(&mut self, path: &str, meta: FileMeta, findings: &[Finding]) {
        let tx = self.conn.transaction().expect("transaction must start");
        tx.execute(
            "INSERT INTO files (path, mtime, size, content_hash, has_candidate, has_findings)
             VALUES (?1, ?2, ?3, ?4, ?5, 1)
             ON CONFLICT(path) DO UPDATE SET
                mtime = excluded.mtime,
                size = excluded.size,
                content_hash = excluded.content_hash,
                has_candidate = excluded.has_candidate,
                has_findings = 1",
            params![
                path,
                meta.mtime,
                meta.size,
                meta.content_hash,
                meta.has_candidate as i64
            ],
        )
        .expect("upsert files must not fail");
        tx.execute("DELETE FROM findings WHERE file_path = ?1", params![path])
            .expect("delete findings must not fail");
        for finding in findings {
            let json = serde_json::to_string(finding).expect("finding must serialize");
            tx.execute(
                "INSERT INTO findings (file_path, id, json) VALUES (?1, ?2, ?3)",
                params![path, finding.id, json],
            )
            .expect("insert finding must not fail");
        }
        tx.commit().expect("commit must not fail");
    }

    /// Upserts just the file metadata row, leaving any cached findings for
    /// `path` untouched. Used by `workspace/scan`, which only establishes
    /// candidacy — extracting findings is `document/parse`'s job.
    ///
    /// Deliberately does NOT set `has_findings`: if this row's
    /// `content_hash` matches what's already cached, a prior
    /// [`Db::write_through`] result for that exact content is still valid
    /// and stays authoritative; otherwise the content has moved on and
    /// `has_findings` resets to 0 so [`Db::has_fresh_findings`] won't hand
    /// back stale (or, on first scan, nonexistent) findings. Any now-stale
    /// rows in `findings` are simply orphaned here, not deleted — the next
    /// real `write_through` for this path clears them; `has_fresh_findings`
    /// never surfaces them in the meantime.
    pub fn write_file_meta(&mut self, path: &str, meta: FileMeta) {
        self.conn
            .execute(
                "INSERT INTO files (path, mtime, size, content_hash, has_candidate, has_findings)
                 VALUES (?1, ?2, ?3, ?4, ?5, 0)
                 ON CONFLICT(path) DO UPDATE SET
                    mtime = excluded.mtime,
                    size = excluded.size,
                    has_candidate = excluded.has_candidate,
                    content_hash = excluded.content_hash,
                    has_findings = CASE
                        WHEN files.content_hash = excluded.content_hash THEN files.has_findings
                        ELSE 0
                    END",
                params![
                    path,
                    meta.mtime,
                    meta.size,
                    meta.content_hash,
                    meta.has_candidate as i64
                ],
            )
            .expect("upsert files must not fail");
    }

    /// True if `path` has an authoritative (from [`Db::write_through`])
    /// findings cache whose (mtime, size, content_hash) match exactly —
    /// i.e. [`Db::cached_findings`] is safe to trust without reparsing.
    pub fn has_fresh_findings(
        &self,
        path: &str,
        mtime: i64,
        size: i64,
        content_hash: &str,
    ) -> bool {
        self.conn
            .query_row(
                "SELECT mtime, size, content_hash, has_findings FROM files WHERE path = ?1",
                params![path],
                |row| {
                    let row_mtime: i64 = row.get(0)?;
                    let row_size: i64 = row.get(1)?;
                    let row_hash: String = row.get(2)?;
                    let has_findings: i64 = row.get(3)?;
                    Ok(row_mtime == mtime
                        && row_size == size
                        && row_hash == content_hash
                        && has_findings != 0)
                },
            )
            .optional()
            .expect("query must not fail")
            .unwrap_or(false)
    }

    /// Replaces the per-line hash table for `path`.
    pub fn write_line_hashes(&mut self, path: &str, hashes: &[u64]) {
        let tx = self.conn.transaction().expect("transaction must start");
        tx.execute(
            "DELETE FROM line_hashes WHERE file_path = ?1",
            params![path],
        )
        .expect("delete line_hashes must not fail");
        for (line, hash) in hashes.iter().enumerate() {
            tx.execute(
                "INSERT INTO line_hashes (file_path, line, hash) VALUES (?1, ?2, ?3)",
                params![path, line as i64, *hash as i64],
            )
            .expect("insert line_hash must not fail");
        }
        tx.commit().expect("commit must not fail");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{ByteRange, Payload, Pos, Range, ZZFX_CALL_KIND};

    fn sample_finding(id: &str) -> Finding {
        Finding {
            kind: ZZFX_CALL_KIND.to_string(),
            id: id.to_string(),
            range: Range {
                start: Pos {
                    line: 0,
                    character: 0,
                },
                end: Pos {
                    line: 0,
                    character: 5,
                },
            },
            byte_range: ByteRange { start: 0, end: 5 },
            payload: Payload {
                params: vec![1.0],
                arg_range: Range {
                    start: Pos {
                        line: 0,
                        character: 1,
                    },
                    end: Pos {
                        line: 0,
                        character: 4,
                    },
                },
                var_ref: None,
            },
        }
    }

    #[test]
    fn in_memory_fallback_when_no_storage_dir() {
        let db = Db::open(None);
        assert!(db.degraded);
        assert!(db.file_meta("a.ts").is_none());
    }

    #[test]
    fn on_disk_when_storage_dir_usable() {
        let dir = tempfile::tempdir().unwrap();
        let db = Db::open(Some(dir.path().to_str().unwrap()));
        assert!(!db.degraded);
        assert!(dir.path().join("codelens-cache.sqlite").exists());
    }

    #[test]
    fn degrades_gracefully_when_storage_dir_is_unusable() {
        // A path nested under a file (not a directory) can never be
        // created; this must degrade, not panic.
        let dir = tempfile::tempdir().unwrap();
        let blocking_file = dir.path().join("not-a-dir");
        std::fs::write(&blocking_file, b"x").unwrap();
        let bogus = blocking_file.join("nested");
        let db = Db::open(Some(bogus.to_str().unwrap()));
        assert!(db.degraded);
    }

    #[test]
    fn opening_a_pre_has_findings_column_cache_file_migrates_in_place() {
        let dir = tempfile::tempdir().unwrap();
        let storage_dir = dir.path().to_str().unwrap();

        // Simulate a cache file written by an older build of this binary,
        // before the `has_findings` column existed.
        {
            let conn = Connection::open(dir.path().join("codelens-cache.sqlite")).unwrap();
            conn.execute_batch(
                "CREATE TABLE files (
                    path TEXT PRIMARY KEY,
                    mtime INTEGER NOT NULL,
                    size INTEGER NOT NULL,
                    content_hash TEXT NOT NULL,
                    has_candidate INTEGER NOT NULL
                );",
            )
            .unwrap();
            conn.execute(
                "INSERT INTO files (path, mtime, size, content_hash, has_candidate) VALUES ('old.ts', 1, 2, 'h', 1)",
                [],
            )
            .unwrap();
        }

        // Must not panic, and old rows must survive with has_findings
        // defaulted to 0 (never trusted as an authoritative parse result).
        let mut db = Db::open(Some(storage_dir));
        assert!(!db.degraded);
        assert!(!db.has_fresh_findings("old.ts", 1, 2, "h"));
        let meta = db.file_meta("old.ts").unwrap();
        assert_eq!(meta.content_hash, "h");

        // And the migrated schema is fully usable going forward.
        db.write_through("old.ts", meta.clone(), &[sample_finding("f1")]);
        assert!(db.has_fresh_findings("old.ts", meta.mtime, meta.size, &meta.content_hash));
    }

    #[test]
    fn write_through_then_read_back_roundtrips() {
        let mut db = Db::open(None);
        let meta = FileMeta {
            mtime: 100,
            size: 42,
            content_hash: "abc123".to_string(),
            has_candidate: true,
        };
        let finding = sample_finding("f1");
        db.write_through("a.ts", meta.clone(), std::slice::from_ref(&finding));

        let got_meta = db.file_meta("a.ts").unwrap();
        assert_eq!(got_meta, meta);

        let got_findings = db.cached_findings("a.ts");
        assert_eq!(got_findings, vec![finding]);
    }

    #[test]
    fn write_through_replaces_prior_findings() {
        let mut db = Db::open(None);
        let meta = FileMeta {
            mtime: 1,
            size: 1,
            content_hash: "h1".to_string(),
            has_candidate: true,
        };
        db.write_through("a.ts", meta, &[sample_finding("f1"), sample_finding("f2")]);
        assert_eq!(db.cached_findings("a.ts").len(), 2);

        let meta2 = FileMeta {
            mtime: 2,
            size: 2,
            content_hash: "h2".to_string(),
            has_candidate: false,
        };
        db.write_through("a.ts", meta2.clone(), &[]);
        assert_eq!(db.cached_findings("a.ts").len(), 0);
        assert_eq!(db.file_meta("a.ts").unwrap(), meta2);
    }

    #[test]
    fn missing_entry_returns_none() {
        let db = Db::open(None);
        assert!(db.file_meta("missing.ts").is_none());
        assert!(db.cached_findings("missing.ts").is_empty());
    }

    #[test]
    fn write_file_meta_does_not_touch_existing_findings() {
        let mut db = Db::open(None);
        let meta = FileMeta {
            mtime: 1,
            size: 1,
            content_hash: "h1".to_string(),
            has_candidate: true,
        };
        db.write_through("a.ts", meta, &[sample_finding("f1")]);
        assert_eq!(db.cached_findings("a.ts").len(), 1);

        let meta2 = FileMeta {
            mtime: 2,
            size: 2,
            content_hash: "h2".to_string(),
            has_candidate: true,
        };
        db.write_file_meta("a.ts", meta2.clone());
        assert_eq!(db.file_meta("a.ts").unwrap(), meta2);
        assert_eq!(db.cached_findings("a.ts").len(), 1);
    }

    #[test]
    fn scan_only_metadata_is_never_reported_as_fresh_findings() {
        // Regression: workspace/scan writes metadata via write_file_meta
        // without ever having parsed the file. A later document/parse call
        // with matching (mtime, size, content_hash) must NOT treat that
        // scan-only row as a valid findings cache — there are no findings
        // to serve.
        let mut db = Db::open(None);
        let meta = FileMeta {
            mtime: 1,
            size: 10,
            content_hash: "h1".to_string(),
            has_candidate: true,
        };
        db.write_file_meta("a.ts", meta.clone());
        assert!(!db.has_fresh_findings("a.ts", meta.mtime, meta.size, &meta.content_hash));
        assert!(db.cached_findings("a.ts").is_empty());
    }

    #[test]
    fn write_through_findings_are_reported_fresh_for_matching_metadata() {
        let mut db = Db::open(None);
        let meta = FileMeta {
            mtime: 1,
            size: 10,
            content_hash: "h1".to_string(),
            has_candidate: true,
        };
        db.write_through("a.ts", meta.clone(), &[sample_finding("f1")]);
        assert!(db.has_fresh_findings("a.ts", meta.mtime, meta.size, &meta.content_hash));
        // Any metadata mismatch (mtime, size, or hash) invalidates it.
        assert!(!db.has_fresh_findings("a.ts", 2, meta.size, &meta.content_hash));
        assert!(!db.has_fresh_findings("a.ts", meta.mtime, 999, &meta.content_hash));
        assert!(!db.has_fresh_findings("a.ts", meta.mtime, meta.size, "different-hash"));
    }

    #[test]
    fn scan_after_parse_with_unchanged_content_preserves_fresh_findings() {
        // A scan pass over a file that was already parsed (same content)
        // must not invalidate the existing findings cache.
        let mut db = Db::open(None);
        let meta = FileMeta {
            mtime: 1,
            size: 10,
            content_hash: "h1".to_string(),
            has_candidate: true,
        };
        db.write_through("a.ts", meta.clone(), &[sample_finding("f1")]);
        assert!(db.has_fresh_findings("a.ts", meta.mtime, meta.size, &meta.content_hash));

        // Rescan sees the same content (e.g. mtime bumped by a touch with
        // no content change is unrealistic for our own writer, but a
        // same-hash rescan is the case that matters here).
        db.write_file_meta("a.ts", meta.clone());
        assert!(db.has_fresh_findings("a.ts", meta.mtime, meta.size, &meta.content_hash));
        assert_eq!(db.cached_findings("a.ts").len(), 1);
    }

    #[test]
    fn scan_after_parse_with_changed_content_invalidates_fresh_findings() {
        let mut db = Db::open(None);
        let meta = FileMeta {
            mtime: 1,
            size: 10,
            content_hash: "h1".to_string(),
            has_candidate: true,
        };
        db.write_through("a.ts", meta, &[sample_finding("f1")]);

        let changed = FileMeta {
            mtime: 2,
            size: 20,
            content_hash: "h2".to_string(),
            has_candidate: true,
        };
        db.write_file_meta("a.ts", changed.clone());
        assert!(!db.has_fresh_findings("a.ts", changed.mtime, changed.size, &changed.content_hash));
    }

    #[test]
    fn line_hashes_roundtrip_and_replace() {
        let mut db = Db::open(None);
        db.write_line_hashes("a.ts", &[1, 2, 3]);
        db.write_line_hashes("a.ts", &[9, 9]);
        // No direct read accessor is exposed yet (groundwork only); this
        // just proves repeated writes don't error or leak old rows via a
        // raw count query.
        let count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM line_hashes WHERE file_path = 'a.ts'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 2);
    }
}
