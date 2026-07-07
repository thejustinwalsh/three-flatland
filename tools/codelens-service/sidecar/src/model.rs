//! Wire types shared by the `document/parse` and `workspace/scan` responses.

use serde::{Deserialize, Serialize};

/// LSP-style zero-based position. `character` is a UTF-16 code unit offset
/// into the line, matching VS Code / LSP convention (not a byte offset and
/// not a Unicode scalar count).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Pos {
    pub line: u32,
    pub character: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Range {
    pub start: Pos,
    pub end: Pos,
}

/// Byte offsets (UTF-8) into the source text, as opposed to [`Range`] which
/// is UTF-16-code-unit-based line/character positions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ByteRange {
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VarRef {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub def_uri: Option<String>,
    /// The initializer VALUE range — what a write-back replaces — never
    /// the whole declarator (name, type annotation, and `=` excluded).
    /// `None` when the declaration has no initializer to point at, even
    /// if `def_uri` is `Some` (there's a real declaration site, just no
    /// value there yet).
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub def_range: Option<Range>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Payload {
    pub params: Vec<f64>,
    pub arg_range: Range,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub var_ref: Option<VarRef>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    pub kind: String,
    pub id: String,
    pub range: Range,
    pub byte_range: ByteRange,
    pub payload: Payload,
}

pub const ZZFX_CALL_KIND: &str = "zzfx.call";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finding_round_trips_camel_case_json() {
        let finding = Finding {
            kind: ZZFX_CALL_KIND.to_string(),
            id: "deadbeefdeadbeef".to_string(),
            range: Range {
                start: Pos {
                    line: 0,
                    character: 0,
                },
                end: Pos {
                    line: 0,
                    character: 26,
                },
            },
            byte_range: ByteRange { start: 0, end: 26 },
            payload: Payload {
                params: vec![1.0, 0.05, 220.0],
                arg_range: Range {
                    start: Pos {
                        line: 0,
                        character: 5,
                    },
                    end: Pos {
                        line: 0,
                        character: 25,
                    },
                },
                var_ref: None,
            },
        };
        let json = serde_json::to_value(&finding).unwrap();
        assert_eq!(json["kind"], "zzfx.call");
        assert_eq!(json["byteRange"]["start"], 0);
        assert_eq!(json["payload"]["argRange"]["start"]["character"], 5);
        // var_ref omitted entirely when None.
        assert!(json["payload"].get("varRef").is_none());

        let back: Finding = serde_json::from_value(json).unwrap();
        assert_eq!(back, finding);
    }

    #[test]
    fn var_ref_serializes_only_present_fields() {
        let var_ref = VarRef {
            name: "LASER".to_string(),
            def_uri: None,
            def_range: None,
        };
        let json = serde_json::to_value(&var_ref).unwrap();
        assert_eq!(json["name"], "LASER");
        assert!(json.get("defUri").is_none());
        assert!(json.get("defRange").is_none());
    }
}
