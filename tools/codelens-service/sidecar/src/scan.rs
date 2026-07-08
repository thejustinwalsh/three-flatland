//! Fast byte-level candidate scan: does this source contain a signal for
//! ANY of our finding kinds — `zzfx` (covers `zzfx.call` and `zzfxm.song`,
//! since `zzfxm`/`zzfxM` both start with `zzfx`), or one of
//! [`AUDIO_EXTENSIONS`] (for `audio.file`) — outside a `//` or `/* */`
//! comment? This is a cheap pre-filter run over every workspace file before
//! the (much more expensive) tree-sitter parse; it intentionally does NOT
//! track string-literal state, so a needle inside an unrelated string is a
//! false positive (acceptable — the tree-sitter pass filters it out later).
//! Missing a real call/reference (a false negative) is not acceptable,
//! since nothing downstream would ever look at that file again.

/// Audio file extensions the `audio.file` scanner (`parse.rs`) and this
/// candidate pre-filter both recognize, case-insensitive.
pub const AUDIO_EXTENSIONS: [&str; 7] = [".wav", ".mp3", ".ogg", ".webm", ".m4a", ".aac", ".flac"];

#[derive(Clone, Copy, PartialEq, Eq)]
enum State {
    Code,
    LineComment,
    BlockComment,
}

/// Returns true if `bytes` contains a candidate signal for any scanner
/// outside of a `//` line comment or `/* */` block comment: the literal
/// `zzfx`, or any of [`AUDIO_EXTENSIONS`] (case-insensitive). Lowercases
/// once up front so both needle checks (and comment-delimiter matching,
/// which is ASCII either way) run over the same buffer in a single pass.
pub fn has_audio_candidate(bytes: &[u8]) -> bool {
    let lower = bytes.to_ascii_lowercase();
    let mut state = State::Code;
    let mut i = 0;
    while i < lower.len() {
        match state {
            State::Code => {
                if lower[i] == b'/' && lower.get(i + 1) == Some(&b'/') {
                    state = State::LineComment;
                    i += 2;
                    continue;
                }
                if lower[i] == b'/' && lower.get(i + 1) == Some(&b'*') {
                    state = State::BlockComment;
                    i += 2;
                    continue;
                }
                if lower[i..].starts_with(b"zzfx") {
                    return true;
                }
                if AUDIO_EXTENSIONS
                    .iter()
                    .any(|ext| lower[i..].starts_with(ext.as_bytes()))
                {
                    return true;
                }
                i += 1;
            }
            State::LineComment => {
                if lower[i] == b'\n' {
                    state = State::Code;
                }
                i += 1;
            }
            State::BlockComment => {
                if lower[i] == b'*' && lower.get(i + 1) == Some(&b'/') {
                    state = State::Code;
                    i += 2;
                    continue;
                }
                i += 1;
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn direct_call_is_candidate() {
        assert!(has_audio_candidate(b"zzfx(1,.05,220);"));
    }

    #[test]
    fn member_call_is_candidate() {
        assert!(has_audio_candidate(b"foo.zzfx(1,.05,220);"));
    }

    #[test]
    fn spread_call_is_candidate() {
        assert!(has_audio_candidate(b"zzfx(...LASER);"));
    }

    #[test]
    fn line_comment_is_not_candidate() {
        assert!(!has_audio_candidate(b"// zzfx(1,2,3) commented out\n"));
    }

    #[test]
    fn block_comment_is_not_candidate() {
        assert!(!has_audio_candidate(b"/* zzfx(1,2,3) block comment */"));
    }

    #[test]
    fn multiline_block_comment_is_not_candidate() {
        assert!(!has_audio_candidate(
            b"/*\n zzfx(1,2,3)\n block comment\n*/"
        ));
    }

    #[test]
    fn code_after_block_comment_is_still_scanned() {
        assert!(has_audio_candidate(b"/* not it */ zzfx(1,2,3);"));
    }

    #[test]
    fn code_after_line_comment_on_next_line_is_still_scanned() {
        assert!(has_audio_candidate(b"// nope\nzzfx(1,2,3);"));
    }

    #[test]
    fn string_containing_zzfx_is_candidate_false_positive_allowed() {
        // Over-inclusion here is fine: the tree-sitter pass filters it out.
        assert!(has_audio_candidate(b"const x = \"zzfx in a string\";"));
    }

    #[test]
    fn zero_calls_is_not_candidate() {
        assert!(!has_audio_candidate(
            b"const x = 1;\nfunction foo() { return x; }\n"
        ));
    }

    #[test]
    fn empty_file_is_not_candidate() {
        assert!(!has_audio_candidate(b""));
    }

    #[test]
    fn unterminated_block_comment_does_not_panic_or_leak_code_after() {
        // Malformed source (unterminated comment) must not crash the scanner
        // nor falsely report code after EOF as a candidate.
        assert!(!has_audio_candidate(b"/* zzfx never closes"));
    }

    #[test]
    fn zzfxm_lowercase_call_is_candidate_via_the_zzfx_prefix() {
        // zzfxm and zzfxM both literally start with "zzfx" — no separate
        // needle is needed, but this pins the assumption so a future
        // rename/refactor of either scanner can't silently break it.
        assert!(has_audio_candidate(b"zzfxm(song);"));
    }

    #[test]
    fn zzfxm_uppercase_m_call_is_candidate_via_the_zzfx_prefix() {
        assert!(has_audio_candidate(b"zzfxM(song, 1, 0.5);"));
    }

    #[test]
    fn audio_extension_makes_a_file_a_candidate() {
        assert!(has_audio_candidate(b"audioLoader.load('jump.ogg');"));
    }

    #[test]
    fn every_recognized_audio_extension_is_a_candidate() {
        for ext in AUDIO_EXTENSIONS {
            let src = format!("foo('bar{ext}');");
            assert!(
                has_audio_candidate(src.as_bytes()),
                "{ext} must be a recognized candidate needle"
            );
        }
    }

    #[test]
    fn audio_extension_matching_is_case_insensitive() {
        assert!(has_audio_candidate(b"new Audio('BOOM.MP3');"));
    }

    #[test]
    fn audio_extension_inside_a_line_comment_is_not_candidate() {
        assert!(!has_audio_candidate(
            b"// new Audio('jump.ogg');\nconst x = 1;\n"
        ));
    }

    #[test]
    fn audio_extension_inside_a_block_comment_is_not_candidate() {
        assert!(!has_audio_candidate(
            b"/* new Audio('jump.ogg'); */\nconst x = 1;\n"
        ));
    }

    #[test]
    fn a_file_with_neither_signal_is_not_candidate() {
        assert!(!has_audio_candidate(
            b"export function silence() { return 1; }\n"
        ));
    }
}
