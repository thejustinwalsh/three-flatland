//! Wire types shared by the `document/parse` and `workspace/scan` responses.
//!
//! `Finding` is a proper discriminated union, not a single struct with a
//! loose `kind: String` tag: [`FindingPayload`] is a `#[serde(tag = "kind",
//! content = "payload")]` enum, `#[serde(flatten)]`ed into `Finding` so the
//! wire shape stays exactly `{id, range, byteRange, kind, payload}` — the
//! same shape as before this became polymorphic, just with `kind` and
//! `payload` now genuinely tied together instead of independently typeable.

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

/// Payload for a `zzfx(...)` call finding.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZzfxPayload {
    pub params: Vec<f64>,
    pub arg_range: Range,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub var_ref: Option<VarRef>,
}

/// Payload for a `zzfxm(...)` / `zzfxM(...)` song call finding. Deliberately
/// has no `params`: a ZzFXM song is a deeply nested array structure, not a
/// flat numeric list, so extracting it here would just duplicate what the
/// client can already read out of the source text at `arg_range` — the same
/// posture `varRef.defRange` already takes for an unresolved preset. Trailing
/// args after the song (playback position, speed) don't factor into
/// detection at all.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZzfxmPayload {
    pub arg_range: Range,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub var_ref: Option<VarRef>,
}

/// Payload for a generic audio-file-reference finding: any string literal
/// (or zero-substitution template literal) argument, at any depth within a
/// call's arguments, whose value ends in a recognized audio extension.
/// `path_range` is the literal's interior — no surrounding quotes/backticks.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioFilePayload {
    pub path: String,
    pub path_range: Range,
}

/// Payload for a `new Wad({ source: 'sine' | 'square' | 'sawtooth' |
/// 'triangle' | 'noise' })` synthesis-mode finding. Deliberately has no
/// pre-extracted config: Wad's synthesis config is a plain object literal,
/// not a flat numeric list, so extracting it here would just duplicate what
/// the client can already read out of the source text at `arg_range` — the
/// same posture `ZzfxmPayload` already takes for a song. `arg_range` is the
/// sole argument's own text range (the object literal's own range for a
/// direct-object-literal call, or the bare identifier's own range for a
/// var-ref call — see [`crate::parse::extract_wad_synth`]'s doc comment for
/// why the var-ref case still sets it despite `var_ref.def_range` being the
/// more useful range there).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WadSynthPayload {
    pub arg_range: Range,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub var_ref: Option<VarRef>,
}

pub const ZZFX_CALL_KIND: &str = "zzfx.call";
pub const ZZFXM_SONG_KIND: &str = "zzfxm.song";
pub const AUDIO_FILE_KIND: &str = "audio.file";
pub const WAD_SYNTH_KIND: &str = "wad.synth";

/// The kind-specific half of a [`Finding`] — see the module doc comment for
/// why this is `#[serde(flatten)]`ed rather than nested under a `payload`
/// field typed as a single loose struct.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "payload")]
pub enum FindingPayload {
    #[serde(rename = "zzfx.call")]
    ZzfxCall(ZzfxPayload),
    #[serde(rename = "zzfxm.song")]
    ZzfxmSong(ZzfxmPayload),
    #[serde(rename = "audio.file")]
    AudioFile(AudioFilePayload),
    #[serde(rename = "wad.synth")]
    WadSynth(WadSynthPayload),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    pub id: String,
    pub range: Range,
    pub byte_range: ByteRange,
    #[serde(flatten)]
    pub payload: FindingPayload,
}

impl Finding {
    /// The wire `kind` string this finding serializes with. Convenience for
    /// call sites (mostly tests, logging) that want the tag without
    /// matching on [`FindingPayload`] themselves.
    pub fn kind(&self) -> &'static str {
        match &self.payload {
            FindingPayload::ZzfxCall(_) => ZZFX_CALL_KIND,
            FindingPayload::ZzfxmSong(_) => ZZFXM_SONG_KIND,
            FindingPayload::AudioFile(_) => AUDIO_FILE_KIND,
            FindingPayload::WadSynth(_) => WAD_SYNTH_KIND,
        }
    }

    pub fn as_zzfx_call(&self) -> Option<&ZzfxPayload> {
        match &self.payload {
            FindingPayload::ZzfxCall(p) => Some(p),
            _ => None,
        }
    }

    pub fn as_zzfxm_song(&self) -> Option<&ZzfxmPayload> {
        match &self.payload {
            FindingPayload::ZzfxmSong(p) => Some(p),
            _ => None,
        }
    }

    pub fn as_audio_file(&self) -> Option<&AudioFilePayload> {
        match &self.payload {
            FindingPayload::AudioFile(p) => Some(p),
            _ => None,
        }
    }

    pub fn as_wad_synth(&self) -> Option<&WadSynthPayload> {
        match &self.payload {
            FindingPayload::WadSynth(p) => Some(p),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pos(line: u32, character: u32) -> Pos {
        Pos { line, character }
    }

    #[test]
    fn zzfx_finding_round_trips_camel_case_json_with_flat_kind_and_payload() {
        let finding = Finding {
            id: "deadbeefdeadbeef".to_string(),
            range: Range {
                start: pos(0, 0),
                end: pos(0, 26),
            },
            byte_range: ByteRange { start: 0, end: 26 },
            payload: FindingPayload::ZzfxCall(ZzfxPayload {
                params: vec![1.0, 0.05, 220.0],
                arg_range: Range {
                    start: pos(0, 5),
                    end: pos(0, 25),
                },
                var_ref: None,
            }),
        };
        let json = serde_json::to_value(&finding).unwrap();
        // kind/payload must be flat top-level keys, not nested under a
        // second "payload.kind" or similar — this is the actual wire
        // contract the TS client's discriminated union depends on.
        assert_eq!(json["kind"], "zzfx.call");
        assert_eq!(json["byteRange"]["start"], 0);
        assert_eq!(json["payload"]["argRange"]["start"]["character"], 5);
        assert!(json["payload"].get("varRef").is_none());
        assert!(
            json.get("params").is_none(),
            "params must stay nested under payload, not flattened further"
        );

        let back: Finding = serde_json::from_value(json).unwrap();
        assert_eq!(back, finding);
        assert_eq!(finding.kind(), ZZFX_CALL_KIND);
    }

    #[test]
    fn zzfxm_finding_round_trips_with_no_params_field_at_all() {
        let finding = Finding {
            id: "0011223344556677".to_string(),
            range: Range {
                start: pos(0, 0),
                end: pos(0, 12),
            },
            byte_range: ByteRange { start: 0, end: 12 },
            payload: FindingPayload::ZzfxmSong(ZzfxmPayload {
                arg_range: Range {
                    start: pos(0, 6),
                    end: pos(0, 11),
                },
                var_ref: Some(VarRef {
                    name: "song".to_string(),
                    def_uri: Some("a.ts".to_string()),
                    def_range: None,
                }),
            }),
        };
        let json = serde_json::to_value(&finding).unwrap();
        assert_eq!(json["kind"], "zzfxm.song");
        assert!(
            json["payload"].get("params").is_none(),
            "zzfxm payload must never have a params key — songs are nested arrays, not flat numbers"
        );
        assert_eq!(json["payload"]["varRef"]["name"], "song");

        let back: Finding = serde_json::from_value(json).unwrap();
        assert_eq!(back, finding);
        assert_eq!(finding.kind(), ZZFXM_SONG_KIND);
        assert_eq!(
            finding
                .as_zzfxm_song()
                .unwrap()
                .var_ref
                .as_ref()
                .unwrap()
                .name,
            "song"
        );
    }

    #[test]
    fn audio_file_finding_round_trips_with_path_and_path_range_only() {
        let finding = Finding {
            id: "aabbccddeeff0011".to_string(),
            range: Range {
                start: pos(2, 0),
                end: pos(2, 24),
            },
            byte_range: ByteRange { start: 40, end: 64 },
            payload: FindingPayload::AudioFile(AudioFilePayload {
                path: "jump.ogg".to_string(),
                path_range: Range {
                    start: pos(2, 14),
                    end: pos(2, 22),
                },
            }),
        };
        let json = serde_json::to_value(&finding).unwrap();
        assert_eq!(json["kind"], "audio.file");
        assert_eq!(json["payload"]["path"], "jump.ogg");
        assert_eq!(json["payload"]["pathRange"]["start"]["character"], 14);
        // audio.file payloads never carry argRange or varRef — those are
        // zzfx/zzfxm-specific fields that don't apply here.
        assert!(json["payload"].get("argRange").is_none());
        assert!(json["payload"].get("varRef").is_none());

        let back: Finding = serde_json::from_value(json).unwrap();
        assert_eq!(back, finding);
        assert_eq!(finding.kind(), AUDIO_FILE_KIND);
        assert_eq!(finding.as_audio_file().unwrap().path, "jump.ogg");
    }

    #[test]
    fn wad_synth_finding_round_trips_with_no_pre_extracted_config_field() {
        let finding = Finding {
            id: "22334455667788aa".to_string(),
            range: Range {
                start: pos(0, 0),
                end: pos(0, 27),
            },
            byte_range: ByteRange { start: 0, end: 27 },
            payload: FindingPayload::WadSynth(WadSynthPayload {
                arg_range: Range {
                    start: pos(0, 8),
                    end: pos(0, 26),
                },
                var_ref: None,
            }),
        };
        let json = serde_json::to_value(&finding).unwrap();
        assert_eq!(json["kind"], "wad.synth");
        assert_eq!(json["payload"]["argRange"]["start"]["character"], 8);
        assert!(json["payload"].get("varRef").is_none());
        assert!(
            json["payload"].get("params").is_none(),
            "wad.synth payload must never have a params key — the config is a plain object, not a flat numeric list"
        );

        let back: Finding = serde_json::from_value(json).unwrap();
        assert_eq!(back, finding);
        assert_eq!(finding.kind(), WAD_SYNTH_KIND);
        assert_eq!(finding.as_wad_synth().unwrap().arg_range.start.character, 8);
    }

    #[test]
    fn wad_synth_finding_with_var_ref_round_trips() {
        let finding = Finding {
            id: "9988776655443322".to_string(),
            range: Range {
                start: pos(1, 0),
                end: pos(1, 15),
            },
            byte_range: ByteRange { start: 30, end: 45 },
            payload: FindingPayload::WadSynth(WadSynthPayload {
                arg_range: Range {
                    start: pos(1, 8),
                    end: pos(1, 11),
                },
                var_ref: Some(VarRef {
                    name: "cfg".to_string(),
                    def_uri: Some("a.ts".to_string()),
                    def_range: None,
                }),
            }),
        };
        let json = serde_json::to_value(&finding).unwrap();
        assert_eq!(json["payload"]["varRef"]["name"], "cfg");

        let back: Finding = serde_json::from_value(json).unwrap();
        assert_eq!(back, finding);
        assert_eq!(
            finding
                .as_wad_synth()
                .unwrap()
                .var_ref
                .as_ref()
                .unwrap()
                .name,
            "cfg"
        );
    }

    #[test]
    fn a_finding_of_one_kind_has_no_accessor_hit_for_the_others() {
        let finding = Finding {
            id: "id".to_string(),
            range: Range {
                start: pos(0, 0),
                end: pos(0, 1),
            },
            byte_range: ByteRange { start: 0, end: 1 },
            payload: FindingPayload::AudioFile(AudioFilePayload {
                path: "x.wav".to_string(),
                path_range: Range {
                    start: pos(0, 0),
                    end: pos(0, 1),
                },
            }),
        };
        assert!(finding.as_zzfx_call().is_none());
        assert!(finding.as_zzfxm_song().is_none());
        assert!(finding.as_audio_file().is_some());
        assert!(finding.as_wad_synth().is_none());
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

    #[test]
    fn a_vec_of_mixed_kinds_round_trips_each_correctly() {
        // The actual shape document/parse produces: a heterogeneous list of
        // findings across all three kinds in one response.
        let findings = vec![
            Finding {
                id: "z1".to_string(),
                range: Range {
                    start: pos(0, 0),
                    end: pos(0, 1),
                },
                byte_range: ByteRange { start: 0, end: 1 },
                payload: FindingPayload::ZzfxCall(ZzfxPayload {
                    params: vec![1.0],
                    arg_range: Range {
                        start: pos(0, 0),
                        end: pos(0, 1),
                    },
                    var_ref: None,
                }),
            },
            Finding {
                id: "m1".to_string(),
                range: Range {
                    start: pos(1, 0),
                    end: pos(1, 1),
                },
                byte_range: ByteRange { start: 2, end: 3 },
                payload: FindingPayload::ZzfxmSong(ZzfxmPayload {
                    arg_range: Range {
                        start: pos(1, 0),
                        end: pos(1, 1),
                    },
                    var_ref: None,
                }),
            },
            Finding {
                id: "a1".to_string(),
                range: Range {
                    start: pos(2, 0),
                    end: pos(2, 1),
                },
                byte_range: ByteRange { start: 4, end: 5 },
                payload: FindingPayload::AudioFile(AudioFilePayload {
                    path: "a.mp3".to_string(),
                    path_range: Range {
                        start: pos(2, 0),
                        end: pos(2, 1),
                    },
                }),
            },
        ];
        let json = serde_json::to_string(&findings).unwrap();
        let back: Vec<Finding> = serde_json::from_str(&json).unwrap();
        assert_eq!(back, findings);
        assert_eq!(
            back.iter().map(Finding::kind).collect::<Vec<_>>(),
            vec![ZZFX_CALL_KIND, ZZFXM_SONG_KIND, AUDIO_FILE_KIND]
        );
    }
}
