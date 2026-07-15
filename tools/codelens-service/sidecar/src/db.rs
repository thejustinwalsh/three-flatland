//! SQLite-backed cache: file metadata (for change detection), findings
//! (write-through parse results), and per-line hashes (groundwork for a
//! future incremental parse). Degrades to an in-memory database if the
//! caller-provided storage location can't be opened, created, OR turns out
//! to be an unusable/corrupt SQLite file — a broken on-disk cache must
//! never take down the whole sidecar process, only cost it persistence.
//! Every fallible operation past `open()` follows the same rule: log to
//! stderr and return a safe default rather than panicking. Losing a single
//! cache read/write just means the next request reparses; it is never a
//! correctness problem, so it must never be a crash either.

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

fn log_db_error(context: &str, err: impl std::fmt::Display) {
    eprintln!("codelens-service: db error ({context}): {err}");
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileMeta {
    pub mtime: i64,
    pub size: i64,
    pub content_hash: String,
    pub has_candidate: bool,
}

pub struct Db {
    conn: Connection,
    /// True when `storageUri` couldn't be opened, or the file there
    /// couldn't be used as a working SQLite database (missing, corrupt,
    /// wrong permissions, etc.) — the cache still works, backed by
    /// in-memory SQLite, it just doesn't survive process restarts.
    pub degraded: bool,
}

impl Db {
    /// Opens (creating if needed) a SQLite file at `<storage_dir>/codelens-cache.sqlite`.
    /// Falls back to an in-memory database — never panics — if the
    /// directory/file can't be created or opened, or if the file opens but
    /// isn't a usable SQLite database (e.g. corrupted by an interrupted
    /// write, disk failure, or a hostile/garbage file at that path).
    pub fn open(storage_dir: Option<&str>) -> Self {
        if let Some(dir) = storage_dir {
            match Self::open_on_disk(dir) {
                Ok(conn) => {
                    let mut db = Db {
                        conn,
                        degraded: false,
                    };
                    match db.init_schema() {
                        Ok(()) => return db,
                        Err(err) => log_db_error(
                            "on-disk cache unusable (schema init failed), falling back to in-memory",
                            err,
                        ),
                    }
                }
                Err(err) => log_db_error("could not open on-disk cache", err),
            }
        }
        let conn = Connection::open_in_memory().expect("in-memory sqlite must open");
        let mut db = Db {
            conn,
            degraded: true,
        };
        db.init_schema()
            .expect("in-memory sqlite schema must always apply");
        db
    }

    fn open_on_disk(dir: &str) -> rusqlite::Result<Connection> {
        std::fs::create_dir_all(dir).map_err(|e| {
            rusqlite::Error::SqliteFailure(rusqlite::ffi::Error::new(1), Some(e.to_string()))
        })?;
        let path = Path::new(dir).join("codelens-cache.sqlite");
        Connection::open(path)
    }

    fn init_schema(&mut self) -> rusqlite::Result<()> {
        self.conn.execute_batch(SCHEMA)?;
        self.migrate()
    }

    /// `CREATE TABLE IF NOT EXISTS` only helps on a brand-new cache file —
    /// it does nothing for a `files` table that already exists from an
    /// older build of this binary and is missing a column added since.
    /// Without this, opening an old on-disk cache after an upgrade would
    /// fail on the first write. Each migration is independently idempotent
    /// (checked against `PRAGMA table_info` before applying).
    fn migrate(&mut self) -> rusqlite::Result<()> {
        let has_has_findings_column = self
            .conn
            .prepare("SELECT has_findings FROM files LIMIT 0")
            .is_ok();
        if !has_has_findings_column {
            self.conn.execute(
                "ALTER TABLE files ADD COLUMN has_findings INTEGER NOT NULL DEFAULT 0",
                [],
            )?;
        }
        Ok(())
    }

    /// Looks up cached file metadata. `None` on a missing row OR any query
    /// failure — callers already treat "no entry" as "reparse", so a
    /// degraded read is indistinguishable from a cold cache, by design.
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
            .unwrap_or_else(|err| {
                log_db_error("file_meta", err);
                None
            })
    }

    /// Cached findings for `path`, in insertion order (i.e. source order,
    /// since [`Db::write_through`] inserts them in the same order
    /// [`crate::parse::find_zzfx_calls`] produced them — its AST walk is
    /// pre-order). Empty on a missing entry, zero findings, OR any query
    /// failure (callers only ever call this after
    /// [`Db::has_fresh_findings`] confirms a hit; if the cache has since
    /// become unreadable, an empty result just forces a reparse upstream —
    /// never a panic).
    ///
    /// `ORDER BY rowid` is load-bearing, not decorative: `findings`' actual
    /// primary key is `(file_path, id)`, a composite index SQLite may
    /// choose to scan instead of physical insertion order, which would
    /// silently reorder findings by their (unrelated) hash-derived `id`
    /// string instead of by source position. This was a latent bug from
    /// this table's very first version — invisible until a cache HIT could
    /// actually happen for a multi-finding file, which virtual/untitled
    /// buffers (no disk file to stat) never triggered before content-hash
    /// became the sole trust signal.
    pub fn cached_findings(&self, path: &str) -> Vec<Finding> {
        let stmt = self
            .conn
            .prepare("SELECT json FROM findings WHERE file_path = ?1 ORDER BY rowid");
        let mut stmt = match stmt {
            Ok(stmt) => stmt,
            Err(err) => {
                log_db_error("cached_findings prepare", err);
                return Vec::new();
            }
        };
        let rows = match stmt.query_map(params![path], |row| row.get::<_, String>(0)) {
            Ok(rows) => rows,
            Err(err) => {
                log_db_error("cached_findings query", err);
                return Vec::new();
            }
        };
        rows.filter_map(|r| r.ok())
            .filter_map(|json| serde_json::from_str(&json).ok())
            .collect()
    }

    /// Write-through: replaces `path`'s file metadata and findings in a
    /// single transaction. Marks the row `has_findings` (queried by
    /// [`Db::has_fresh_findings`]) — even an empty `findings` slice is a
    /// meaningful, authoritative "parsed, found nothing" cache state. On
    /// any failure, logs and returns — a lost write just means the next
    /// `document/parse` for this file reparses instead of cache-hitting.
    pub fn write_through(&mut self, path: &str, meta: FileMeta, findings: &[Finding]) {
        if let Err(err) = self.try_write_through(path, &meta, findings) {
            log_db_error("write_through", err);
        }
    }

    fn try_write_through(
        &mut self,
        path: &str,
        meta: &FileMeta,
        findings: &[Finding],
    ) -> rusqlite::Result<()> {
        let tx = self.conn.transaction()?;
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
        )?;
        tx.execute("DELETE FROM findings WHERE file_path = ?1", params![path])?;
        for finding in findings {
            let json = serde_json::to_string(finding).map_err(|e| {
                rusqlite::Error::SqliteFailure(rusqlite::ffi::Error::new(1), Some(e.to_string()))
            })?;
            tx.execute(
                "INSERT INTO findings (file_path, id, json) VALUES (?1, ?2, ?3)",
                params![path, finding.id, json],
            )?;
        }
        tx.commit()
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
    /// never surfaces them in the meantime. On failure, logs and returns —
    /// scan metadata is a cache optimization, never load-bearing.
    pub fn write_file_meta(&mut self, path: &str, meta: FileMeta) {
        let result = self.conn.execute(
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
        );
        if let Err(err) = result {
            log_db_error("write_file_meta", err);
        }
    }

    /// True if `path` has an authoritative (from [`Db::write_through`])
    /// findings cache whose content hash matches exactly — i.e.
    /// [`Db::cached_findings`] is safe to trust without reparsing.
    ///
    /// Trusts `content_hash` alone: BLAKE3 ([`crate::hash::content_hash`])
    /// is strong enough that a match means "the exact same bytes I parsed
    /// before," making the file's on-disk `mtime`/`size` redundant as a
    /// trust signal — they were only ever a weak proxy for content
    /// identity, and a proxy is pointless once you have the real thing.
    /// Dropping them also means virtual/untitled buffers (no disk file, so
    /// no mtime/size to compare) now benefit from this cache too. On any
    /// query failure, returns `false` — never falsely trust a cache we
    /// can't currently read.
    pub fn has_fresh_findings(&self, path: &str, content_hash: &str) -> bool {
        self.conn
            .query_row(
                "SELECT content_hash, has_findings FROM files WHERE path = ?1",
                params![path],
                |row| {
                    let row_hash: String = row.get(0)?;
                    let has_findings: i64 = row.get(1)?;
                    Ok(row_hash == content_hash && has_findings != 0)
                },
            )
            .optional()
            .unwrap_or_else(|err| {
                log_db_error("has_fresh_findings", err);
                None
            })
            .unwrap_or(false)
    }

    /// Replaces the per-line hash table for `path`. On failure, logs and
    /// returns — this table is groundwork for a future incremental parse
    /// and nothing currently reads it back, so a lost write is a no-op.
    pub fn write_line_hashes(&mut self, path: &str, hashes: &[u64]) {
        if let Err(err) = self.try_write_line_hashes(path, hashes) {
            log_db_error("write_line_hashes", err);
        }
    }

    fn try_write_line_hashes(&mut self, path: &str, hashes: &[u64]) -> rusqlite::Result<()> {
        let tx = self.conn.transaction()?;
        tx.execute(
            "DELETE FROM line_hashes WHERE file_path = ?1",
            params![path],
        )?;
        for (line, hash) in hashes.iter().enumerate() {
            tx.execute(
                "INSERT INTO line_hashes (file_path, line, hash) VALUES (?1, ?2, ?3)",
                params![path, line as i64, *hash as i64],
            )?;
        }
        tx.commit()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{ByteRange, FindingPayload, Pos, Range, ZzfxPayload};

    fn sample_finding(id: &str) -> Finding {
        Finding {
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
            payload: FindingPayload::ZzfxCall(ZzfxPayload {
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
            }),
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
    fn degrades_gracefully_when_the_cache_file_is_corrupt() {
        // A file exists at the expected path, opens fine at the OS level,
        // but isn't a valid SQLite database (truncated, corrupted by a
        // crash mid-write, or just garbage). Opening it must not panic —
        // it must degrade to an in-memory cache like any other unusable
        // storage location.
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("codelens-cache.sqlite"),
            b"not a sqlite file at all",
        )
        .unwrap();
        let db = Db::open(Some(dir.path().to_str().unwrap()));
        assert!(db.degraded);
        // And the degraded db is still fully functional.
        assert!(db.file_meta("a.ts").is_none());
    }

    #[test]
    fn degrades_gracefully_when_the_existing_schema_is_fundamentally_incompatible() {
        // Distinct from the missing-column migration case below (which
        // migrate() successfully repairs in place): here `files` exists
        // but as a VIEW, not a table. `CREATE TABLE IF NOT EXISTS` treats
        // any existing object with that name as "already there" and is a
        // silent no-op — so schema init doesn't fail there — but
        // migrate()'s `ALTER TABLE files ADD COLUMN ...` genuinely cannot
        // succeed against a view. This must degrade, not panic.
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("codelens-cache.sqlite");
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch("CREATE VIEW files AS SELECT 1 as path;")
                .unwrap();
        }

        let db = Db::open(Some(dir.path().to_str().unwrap()));
        assert!(db.degraded);
        assert!(db.file_meta("a.ts").is_none());
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
        assert!(!db.has_fresh_findings("old.ts", "h"));
        let meta = db.file_meta("old.ts").unwrap();
        assert_eq!(meta.content_hash, "h");

        // And the migrated schema is fully usable going forward.
        db.write_through("old.ts", meta.clone(), &[sample_finding("f1")]);
        assert!(db.has_fresh_findings("old.ts", &meta.content_hash));
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
    fn cached_findings_preserve_insertion_order_not_id_sort_order() {
        // Regression for the latent ordering bug ORDER BY rowid fixes:
        // insert findings whose `id` strings sort ALPHABETICALLY BACKWARDS
        // relative to insertion order. Without ORDER BY rowid, SQLite is
        // free to scan via the (file_path, id) primary-key index instead
        // of insertion order, which would return them id-sorted (z, then
        // a) instead of in the source order they were written in (a first,
        // then z) — exactly backwards from what callers need, since
        // finding ids are content hashes with no relationship to source
        // position.
        //
        // On-disk (not Db::open(None)'s in-memory database) and writes
        // through TWICE (a single-finding row, then overwritten with the
        // real two-finding set), matching the actual shape that surfaced
        // this bug (an on-disk cache, delete-then-reinsert write_through
        // cycle). Honesty check performed while writing this test: even
        // this combination does NOT reliably force SQLite to pick the
        // (file_path, id) index scan over physical insertion order in a
        // small, isolated crafted case — the real trigger (confirmed live)
        // needs more accumulated write history than a single unit test
        // can cheaply build. This test still pins the *intended* contract
        // and passes/fails correctly either way; the reliable regression
        // guard for the actual bug is
        // `tests/integration.rs::did_change_then_parse_preserves_finding_order`,
        // which goes through the real compiled binary end-to-end — that
        // one DID reproduce the bug before the ORDER BY rowid fix.
        let dir = tempfile::tempdir().unwrap();
        let mut db = Db::open(Some(dir.path().to_str().unwrap()));
        let meta1 = FileMeta {
            mtime: 1,
            size: 1,
            content_hash: "h1".to_string(),
            has_candidate: true,
        };
        db.write_through("a.ts", meta1, &[sample_finding("placeholder")]);

        let meta2 = FileMeta {
            mtime: 2,
            size: 2,
            content_hash: "h2".to_string(),
            has_candidate: true,
        };
        let first = sample_finding("id-a-inserted-first");
        let second = sample_finding("id-z-inserted-second");
        db.write_through("a.ts", meta2, &[first.clone(), second.clone()]);

        let got = db.cached_findings("a.ts");
        assert_eq!(
            got,
            vec![first, second],
            "must preserve insertion (source) order, not id sort order"
        );
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
        // with matching content_hash must NOT treat that scan-only row as
        // a valid findings cache — there are no findings to serve.
        let mut db = Db::open(None);
        let meta = FileMeta {
            mtime: 1,
            size: 10,
            content_hash: "h1".to_string(),
            has_candidate: true,
        };
        db.write_file_meta("a.ts", meta.clone());
        assert!(!db.has_fresh_findings("a.ts", &meta.content_hash));
        assert!(db.cached_findings("a.ts").is_empty());
    }

    #[test]
    fn write_through_findings_are_reported_fresh_for_matching_content_hash() {
        let mut db = Db::open(None);
        let meta = FileMeta {
            mtime: 1,
            size: 10,
            content_hash: "h1".to_string(),
            has_candidate: true,
        };
        db.write_through("a.ts", meta.clone(), &[sample_finding("f1")]);
        assert!(db.has_fresh_findings("a.ts", &meta.content_hash));
        // A content_hash mismatch invalidates it — mtime/size are no
        // longer part of the trust decision at all.
        assert!(!db.has_fresh_findings("a.ts", "different-hash"));
    }

    #[test]
    fn mtime_and_size_no_longer_gate_trust_only_content_hash_does() {
        // Direct proof of the simplification: two completely different
        // (mtime, size) pairs stored in the row don't matter — only
        // content_hash equality decides freshness now.
        let mut db = Db::open(None);
        let meta_a = FileMeta {
            mtime: 111,
            size: 999,
            content_hash: "same-hash".to_string(),
            has_candidate: true,
        };
        db.write_through("a.ts", meta_a, &[sample_finding("f1")]);
        assert!(db.has_fresh_findings("a.ts", "same-hash"));

        // Even a wildly different mtime/size stored later (e.g. from a
        // rescan with the same content) doesn't change the answer, as long
        // as content_hash still matches.
        let meta_b = FileMeta {
            mtime: 222,
            size: 1,
            content_hash: "same-hash".to_string(),
            has_candidate: false,
        };
        db.write_file_meta("a.ts", meta_b);
        assert!(db.has_fresh_findings("a.ts", "same-hash"));
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
        assert!(db.has_fresh_findings("a.ts", &meta.content_hash));

        // Rescan sees the same content (e.g. mtime bumped by a touch with
        // no content change is unrealistic for our own writer, but a
        // same-hash rescan is the case that matters here).
        db.write_file_meta("a.ts", meta.clone());
        assert!(db.has_fresh_findings("a.ts", &meta.content_hash));
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
        assert!(!db.has_fresh_findings("a.ts", &changed.content_hash));
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
