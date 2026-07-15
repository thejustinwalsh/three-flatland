//! JSON-RPC 2.0 envelope and method dispatch. Bridges the wire format
//! (id/method/params, `-32601` for unknown methods, etc.) to [`AppState`]'s
//! handlers. Never panics on malformed input: JSON that won't even parse,
//! wrong-shaped params, and unknown methods all become error responses (or,
//! for notifications, are silently dropped) rather than crashing the
//! process — a hostile or buggy client must not be able to take the sidecar
//! down.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::handlers::{AppState, DidChangeParams, InitializeParams, ParseParams, ScanParams};

pub const PARSE_ERROR: i64 = -32700;
pub const METHOD_NOT_FOUND: i64 = -32601;
pub const INVALID_PARAMS: i64 = -32602;

#[derive(Debug, Deserialize)]
struct RawRequest {
    #[serde(default)]
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Debug, Serialize)]
struct RpcResponse {
    jsonrpc: &'static str,
    id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<RpcError>,
}

#[derive(Debug, Serialize)]
struct RpcError {
    code: i64,
    message: String,
}

/// Outcome of dispatching one framed message body.
pub enum Dispatch {
    /// A response body to write back.
    Respond(Vec<u8>),
    /// A notification (`document/didChange`, or any unknown-method
    /// notification) — nothing to write back.
    NoResponse,
    /// `shutdown` was acknowledged; write the response, flush, then exit.
    Shutdown(Vec<u8>),
}

pub fn dispatch(state: &mut AppState, body: &[u8]) -> Dispatch {
    let raw: RawRequest = match serde_json::from_slice(body) {
        Ok(r) => r,
        Err(e) => {
            return Dispatch::Respond(error_response(Value::Null, PARSE_ERROR, &e.to_string()));
        }
    };
    let is_notification = raw.id.is_none();
    let id = raw.id.unwrap_or(Value::Null);

    match raw.method.as_str() {
        "initialize" => respond(
            id,
            is_notification,
            |params: InitializeParams| {
                serde_json::to_value(state.handle_initialize(params)).unwrap()
            },
            raw.params,
        ),
        "workspace/scan" => respond(
            id,
            is_notification,
            |params: ScanParams| serde_json::to_value(state.handle_scan(params)).unwrap(),
            raw.params,
        ),
        "document/parse" => respond(
            id,
            is_notification,
            |params: ParseParams| serde_json::to_value(state.handle_parse(params)).unwrap(),
            raw.params,
        ),
        "document/didChange" => {
            if let Ok(params) = serde_json::from_value::<DidChangeParams>(raw.params) {
                state.handle_did_change(params);
            }
            Dispatch::NoResponse
        }
        "shutdown" => Dispatch::Shutdown(success_response(id, Value::Null)),
        other => {
            if is_notification {
                Dispatch::NoResponse
            } else {
                Dispatch::Respond(error_response(
                    id,
                    METHOD_NOT_FOUND,
                    &format!("method not found: {other}"),
                ))
            }
        }
    }
}

/// Deserializes `params` and runs `handle`, turning the result into a
/// `Dispatch`. Notifications never produce a response, even on success.
fn respond<T, F>(id: Value, is_notification: bool, handle: F, params: Value) -> Dispatch
where
    T: serde::de::DeserializeOwned,
    F: FnOnce(T) -> Value,
{
    let parsed: T = match serde_json::from_value(params) {
        Ok(p) => p,
        Err(e) => {
            return if is_notification {
                Dispatch::NoResponse
            } else {
                Dispatch::Respond(error_response(id, INVALID_PARAMS, &e.to_string()))
            };
        }
    };
    let result = handle(parsed);
    if is_notification {
        Dispatch::NoResponse
    } else {
        Dispatch::Respond(success_response(id, result))
    }
}

fn success_response(id: Value, result: Value) -> Vec<u8> {
    serde_json::to_vec(&RpcResponse {
        jsonrpc: "2.0",
        id,
        result: Some(result),
        error: None,
    })
    .expect("response must serialize")
}

fn error_response(id: Value, code: i64, message: &str) -> Vec<u8> {
    serde_json::to_vec(&RpcResponse {
        jsonrpc: "2.0",
        id,
        result: None,
        error: Some(RpcError {
            code,
            message: message.to_string(),
        }),
    })
    .expect("response must serialize")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn dispatch_json(state: &mut AppState, value: Value) -> Option<Value> {
        let body = serde_json::to_vec(&value).unwrap();
        match dispatch(state, &body) {
            Dispatch::Respond(bytes) | Dispatch::Shutdown(bytes) => {
                Some(serde_json::from_slice(&bytes).unwrap())
            }
            Dispatch::NoResponse => None,
        }
    }

    #[test]
    fn initialize_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let mut state = AppState::new();
        let resp = dispatch_json(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "workspaceRoot": dir.path().to_string_lossy(),
                    "storageUri": dir.path().join("storage").to_string_lossy(),
                }
            }),
        )
        .unwrap();
        assert_eq!(resp["id"], 1);
        assert_eq!(resp["result"]["capabilities"]["scan"], true);
        assert!(resp["error"].is_null());
    }

    #[test]
    fn unknown_method_with_id_returns_method_not_found() {
        let mut state = AppState::new();
        let resp = dispatch_json(
            &mut state,
            json!({"jsonrpc": "2.0", "id": 7, "method": "bogus/method", "params": {}}),
        )
        .unwrap();
        assert_eq!(resp["id"], 7);
        assert_eq!(resp["error"]["code"], METHOD_NOT_FOUND);
    }

    #[test]
    fn unknown_method_as_notification_produces_no_response() {
        let mut state = AppState::new();
        let body =
            serde_json::to_vec(&json!({"jsonrpc": "2.0", "method": "bogus/notify", "params": {}}))
                .unwrap();
        assert!(matches!(dispatch(&mut state, &body), Dispatch::NoResponse));
    }

    #[test]
    fn malformed_json_body_is_a_parse_error_not_a_panic() {
        let mut state = AppState::new();
        match dispatch(&mut state, b"{not json") {
            Dispatch::Respond(bytes) => {
                let resp: Value = serde_json::from_slice(&bytes).unwrap();
                assert_eq!(resp["error"]["code"], PARSE_ERROR);
            }
            _ => panic!("expected an error response"),
        }
    }

    #[test]
    fn invalid_params_returns_invalid_params_error_not_a_panic() {
        let mut state = AppState::new();
        let resp = dispatch_json(
            &mut state,
            json!({"jsonrpc": "2.0", "id": 3, "method": "document/parse", "params": {"uri": 42}}),
        )
        .unwrap();
        assert_eq!(resp["error"]["code"], INVALID_PARAMS);
    }

    #[test]
    fn document_parse_round_trip() {
        let mut state = AppState::new();
        let resp = dispatch_json(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "id": 2,
                "method": "document/parse",
                "params": {"uri": "file:///a.ts", "text": "zzfx(1,.05,220);"}
            }),
        )
        .unwrap();
        assert_eq!(resp["result"]["findings"].as_array().unwrap().len(), 1);
        assert_eq!(resp["result"]["findings"][0]["kind"], "zzfx.call");
    }

    #[test]
    fn document_did_change_is_a_silent_notification() {
        let mut state = AppState::new();
        let body = serde_json::to_vec(&json!({
            "jsonrpc": "2.0",
            "method": "document/didChange",
            "params": {"uri": "file:///a.ts", "text": "zzfx(1,2,3);"}
        }))
        .unwrap();
        assert!(matches!(dispatch(&mut state, &body), Dispatch::NoResponse));
        assert_eq!(state.db.cached_findings("/a.ts").len(), 1);
    }

    #[test]
    fn did_change_with_an_id_still_produces_no_response() {
        // Per spec document/didChange is always a notification, even if a
        // (misbehaving) client attaches an id.
        let mut state = AppState::new();
        let body = serde_json::to_vec(&json!({
            "jsonrpc": "2.0",
            "id": 99,
            "method": "document/didChange",
            "params": {"uri": "file:///a.ts", "text": "zzfx(1,2,3);"}
        }))
        .unwrap();
        assert!(matches!(dispatch(&mut state, &body), Dispatch::NoResponse));
    }

    #[test]
    fn shutdown_returns_null_result_and_shutdown_variant() {
        let mut state = AppState::new();
        let body =
            serde_json::to_vec(&json!({"jsonrpc": "2.0", "id": 5, "method": "shutdown"})).unwrap();
        match dispatch(&mut state, &body) {
            Dispatch::Shutdown(bytes) => {
                let resp: Value = serde_json::from_slice(&bytes).unwrap();
                assert_eq!(resp["id"], 5);
                assert!(resp["result"].is_null());
                assert!(resp["error"].is_null());
            }
            _ => panic!("expected Shutdown"),
        }
    }

    #[test]
    fn workspace_scan_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.ts");
        std::fs::write(&file, "zzfx(1,2,3);").unwrap();
        let mut state = AppState::new();
        let resp = dispatch_json(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "id": 4,
                "method": "workspace/scan",
                "params": {"candidates": [format!("file://{}", file.to_string_lossy())]}
            }),
        )
        .unwrap();
        let matches = resp["result"]["matches"].as_array().unwrap();
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0]["hasCandidate"], true);
    }
}
