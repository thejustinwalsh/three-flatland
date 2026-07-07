//! End-to-end test: spawns the real `codelens-service` binary and drives it
//! over actual stdio pipes with LSP framing — the same transport a VS Code
//! extension would use — rather than calling into the library directly.

use std::io::{BufReader, Read, Write};
use std::process::{Child, Command, Stdio};

use serde_json::{Value, json};

struct Sidecar {
    child: Child,
    stdin: std::process::ChildStdin,
    stdout: BufReader<std::process::ChildStdout>,
    next_id: i64,
}

impl Sidecar {
    fn spawn() -> Self {
        let exe = env!("CARGO_BIN_EXE_codelens-service");
        let mut child = Command::new(exe)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .expect("failed to spawn codelens-service");
        let stdin = child.stdin.take().unwrap();
        let stdout = BufReader::new(child.stdout.take().unwrap());
        Sidecar {
            child,
            stdin,
            stdout,
            next_id: 1,
        }
    }

    fn request(&mut self, method: &str, params: Value) -> Value {
        let id = self.next_id;
        self.next_id += 1;
        let body = serde_json::to_vec(&json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        }))
        .unwrap();
        self.write_frame(&body);
        let response = self.read_frame();
        let value: Value = serde_json::from_slice(&response).unwrap();
        assert_eq!(
            value["id"], id,
            "response id must match request id for {method}"
        );
        value
    }

    fn notify(&mut self, method: &str, params: Value) {
        let body = serde_json::to_vec(&json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        }))
        .unwrap();
        self.write_frame(&body);
    }

    fn write_frame(&mut self, body: &[u8]) {
        write!(self.stdin, "Content-Length: {}\r\n\r\n", body.len()).unwrap();
        self.stdin.write_all(body).unwrap();
        self.stdin.flush().unwrap();
    }

    fn read_frame(&mut self) -> Vec<u8> {
        let mut content_length = None;
        loop {
            let mut line = String::new();
            read_line(&mut self.stdout, &mut line);
            let trimmed = line.trim_end_matches(['\r', '\n']);
            if trimmed.is_empty() {
                break;
            }
            if let Some((name, value)) = trimmed.split_once(':')
                && name.eq_ignore_ascii_case("Content-Length")
            {
                content_length = Some(value.trim().parse::<usize>().unwrap());
            }
        }
        let len = content_length.expect("response must have Content-Length");
        let mut buf = vec![0u8; len];
        self.stdout.read_exact(&mut buf).unwrap();
        buf
    }

    fn shutdown(mut self) {
        let resp = self.request("shutdown", json!(null));
        assert!(resp["result"].is_null());
        let status = self.child.wait().expect("process must exit after shutdown");
        assert!(
            status.success(),
            "sidecar should exit 0 after shutdown, got {status:?}"
        );
    }
}

fn read_line<R: Read>(reader: &mut R, out: &mut String) {
    let mut byte = [0u8; 1];
    loop {
        if reader.read(&mut byte).unwrap() == 0 {
            return;
        }
        out.push(byte[0] as char);
        if byte[0] == b'\n' {
            return;
        }
    }
}

#[test]
fn full_round_trip_initialize_scan_parse() {
    let dir = tempfile::tempdir().unwrap();
    let storage = dir.path().join("storage");
    let src_file = dir.path().join("sfx.ts");
    let src_text = "export function boom() {\n  zzfx(...[1,.05,220,0,.02]);\n}\n";
    std::fs::write(&src_file, src_text).unwrap();

    let mut sidecar = Sidecar::spawn();

    let init = sidecar.request(
        "initialize",
        json!({
            "workspaceRoot": dir.path().to_string_lossy(),
            "storageUri": storage.to_string_lossy(),
        }),
    );
    assert_eq!(init["result"]["capabilities"]["scan"], true);
    assert_eq!(init["result"]["capabilities"]["parse"], true);
    assert_eq!(init["result"]["capabilities"]["incremental"], true);
    assert!(init["result"]["version"].is_string());

    let file_uri = format!("file://{}", src_file.to_string_lossy());
    let scan = sidecar.request("workspace/scan", json!({ "candidates": [file_uri] }));
    let matches = scan["result"]["matches"].as_array().unwrap();
    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0]["hasCandidate"], true);
    assert!(!matches[0]["contentHash"].as_str().unwrap().is_empty());

    let file_uri = format!("file://{}", src_file.to_string_lossy());
    let parse = sidecar.request(
        "document/parse",
        json!({ "uri": file_uri, "text": src_text }),
    );
    let findings = parse["result"]["findings"].as_array().unwrap();
    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0]["kind"], "zzfx.call");
    assert_eq!(
        findings[0]["payload"]["params"],
        json!([1.0, 0.05, 220.0, 0.0, 0.02])
    );

    sidecar.shutdown();
}

#[test]
fn did_change_notification_produces_no_response_and_updates_cache() {
    let dir = tempfile::tempdir().unwrap();
    let mut sidecar = Sidecar::spawn();
    sidecar.request(
        "initialize",
        json!({
            "workspaceRoot": dir.path().to_string_lossy(),
            "storageUri": dir.path().join("storage").to_string_lossy(),
        }),
    );

    // Send the notification, then immediately send a request; if the
    // sidecar had (incorrectly) written a response for the notification,
    // this next request's response id would not match.
    sidecar.notify(
        "document/didChange",
        json!({ "uri": "file:///virtual/a.ts", "text": "zzfx(1,2,3);" }),
    );
    let parse = sidecar.request(
        "document/parse",
        json!({ "uri": "file:///virtual/a.ts", "text": "zzfx(1,2,3);" }),
    );
    assert_eq!(parse["result"]["findings"].as_array().unwrap().len(), 1);

    sidecar.shutdown();
}

/// Regression: `Db::cached_findings` had no `ORDER BY`, so a cache-hit read
/// could return findings sorted by their (unrelated) hash-derived `id`
/// instead of source position — invisible until content-hash became the
/// sole cache-trust signal made virtual/untitled buffers (which never have
/// disk mtime/size to compare) cache-eligible for the first time. This
/// exact end-to-end shape (a virtual URI, an initial single-call parse to
/// seed the cache, then a didChange to a two-call body, then a matching
/// parse) reliably reproduced the bug before the `ORDER BY rowid` fix —
/// unlike the crafted unit-level repro in `src/db.rs`, which could not
/// force SQLite's on-disk query planner into the same choice in isolation.
#[test]
fn did_change_then_parse_preserves_finding_order() {
    let dir = tempfile::tempdir().unwrap();
    let mut sidecar = Sidecar::spawn();
    sidecar.request(
        "initialize",
        json!({
            "workspaceRoot": dir.path().to_string_lossy(),
            "storageUri": dir.path().join("storage").to_string_lossy(),
        }),
    );

    let uri = "file:///virtual/order.ts";
    let original = sidecar.request(
        "document/parse",
        json!({ "uri": uri, "text": "zzfx(1,2,3);" }),
    );
    assert_eq!(original["result"]["findings"].as_array().unwrap().len(), 1);

    let two_calls = "zzfx(4,5,6);zzfx(7,8,9);";
    sidecar.notify(
        "document/didChange",
        json!({ "uri": uri, "text": two_calls }),
    );
    let reparsed = sidecar.request("document/parse", json!({ "uri": uri, "text": two_calls }));
    let findings = reparsed["result"]["findings"].as_array().unwrap();
    assert_eq!(findings.len(), 2);
    assert_eq!(
        findings[0]["payload"]["params"],
        json!([4.0, 5.0, 6.0]),
        "zzfx(4,5,6) appears first in source and must be findings[0], not sorted by hash id"
    );
    assert_eq!(findings[1]["payload"]["params"], json!([7.0, 8.0, 9.0]));

    sidecar.shutdown();
}

#[test]
fn unknown_method_returns_json_rpc_error_and_process_stays_alive() {
    let dir = tempfile::tempdir().unwrap();
    let mut sidecar = Sidecar::spawn();
    sidecar.request(
        "initialize",
        json!({
            "workspaceRoot": dir.path().to_string_lossy(),
            "storageUri": dir.path().join("storage").to_string_lossy(),
        }),
    );

    let resp = sidecar.request("totally/bogus", json!({}));
    assert_eq!(resp["error"]["code"], -32601);

    // Process must still be responsive after the bad request.
    let parse = sidecar.request(
        "document/parse",
        json!({ "uri": "file:///a.ts", "text": "zzfx();" }),
    );
    assert_eq!(parse["result"]["findings"].as_array().unwrap().len(), 1);

    sidecar.shutdown();
}

/// A framing error desyncs the byte stream — the process cannot recover
/// alignment with the next frame, so it must exit non-zero. This is the
/// signal a supervising client uses to distinguish "died from a protocol
/// violation" from a clean `shutdown` (exit 0, see `sidecar.shutdown()`
/// above) or simply closing the pipe (also exit 0, `eof_without_shutdown`
/// below).
#[test]
fn malformed_framing_is_fatal_and_exits_non_zero() {
    let exe = env!("CARGO_BIN_EXE_codelens-service");
    let mut child = Command::new(exe)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("failed to spawn codelens-service");

    // No Content-Length header at all — an unambiguous framing violation.
    {
        let mut stdin = child.stdin.take().unwrap();
        stdin
            .write_all(b"garbage: not a real header\r\n\r\n")
            .unwrap();
        // Drop stdin so the process sees EOF if it were (incorrectly)
        // still waiting for more header bytes rather than erroring out
        // immediately on the missing Content-Length.
    }

    let status = child.wait().expect("process must exit");
    assert!(
        !status.success(),
        "a framing error must exit non-zero, got {status:?}"
    );
}

#[test]
fn clean_eof_without_shutdown_exits_zero() {
    // The client simply closing the pipe (no `shutdown` request sent) is a
    // normal disconnect, not a protocol violation — must still exit 0.
    let exe = env!("CARGO_BIN_EXE_codelens-service");
    let mut child = Command::new(exe)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .expect("failed to spawn codelens-service");
    drop(child.stdin.take());
    let status = child.wait().expect("process must exit");
    assert!(status.success(), "clean EOF must exit 0, got {status:?}");
}
