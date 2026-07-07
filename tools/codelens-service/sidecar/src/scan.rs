//! Fast byte-level candidate scan: does this source contain the literal
//! `zzfx` outside a `//` or `/* */` comment? This is a cheap pre-filter run
//! over every workspace file before the (much more expensive) tree-sitter
//! parse; it intentionally does NOT track string-literal state, so `zzfx`
//! inside a string is a false positive (acceptable — the tree-sitter pass
//! filters it out later). Missing a real call (a false negative) is not
//! acceptable, since nothing downstream would ever look at that file again.

#[derive(Clone, Copy, PartialEq, Eq)]
enum State {
    Code,
    LineComment,
    BlockComment,
}

/// Returns true if `bytes` contains the literal `zzfx` outside of a
/// `//` line comment or `/* */` block comment.
pub fn has_zzfx_candidate(bytes: &[u8]) -> bool {
    let mut state = State::Code;
    let mut i = 0;
    while i < bytes.len() {
        match state {
            State::Code => {
                if bytes[i] == b'/' && bytes.get(i + 1) == Some(&b'/') {
                    state = State::LineComment;
                    i += 2;
                    continue;
                }
                if bytes[i] == b'/' && bytes.get(i + 1) == Some(&b'*') {
                    state = State::BlockComment;
                    i += 2;
                    continue;
                }
                if bytes[i..].starts_with(b"zzfx") {
                    return true;
                }
                i += 1;
            }
            State::LineComment => {
                if bytes[i] == b'\n' {
                    state = State::Code;
                }
                i += 1;
            }
            State::BlockComment => {
                if bytes[i] == b'*' && bytes.get(i + 1) == Some(&b'/') {
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
        assert!(has_zzfx_candidate(b"zzfx(1,.05,220);"));
    }

    #[test]
    fn member_call_is_candidate() {
        assert!(has_zzfx_candidate(b"foo.zzfx(1,.05,220);"));
    }

    #[test]
    fn spread_call_is_candidate() {
        assert!(has_zzfx_candidate(b"zzfx(...LASER);"));
    }

    #[test]
    fn line_comment_is_not_candidate() {
        assert!(!has_zzfx_candidate(b"// zzfx(1,2,3) commented out\n"));
    }

    #[test]
    fn block_comment_is_not_candidate() {
        assert!(!has_zzfx_candidate(b"/* zzfx(1,2,3) block comment */"));
    }

    #[test]
    fn multiline_block_comment_is_not_candidate() {
        assert!(!has_zzfx_candidate(b"/*\n zzfx(1,2,3)\n block comment\n*/"));
    }

    #[test]
    fn code_after_block_comment_is_still_scanned() {
        assert!(has_zzfx_candidate(b"/* not it */ zzfx(1,2,3);"));
    }

    #[test]
    fn code_after_line_comment_on_next_line_is_still_scanned() {
        assert!(has_zzfx_candidate(b"// nope\nzzfx(1,2,3);"));
    }

    #[test]
    fn string_containing_zzfx_is_candidate_false_positive_allowed() {
        // Over-inclusion here is fine: the tree-sitter pass filters it out.
        assert!(has_zzfx_candidate(b"const x = \"zzfx in a string\";"));
    }

    #[test]
    fn zero_calls_is_not_candidate() {
        assert!(!has_zzfx_candidate(
            b"const x = 1;\nfunction foo() { return x; }\n"
        ));
    }

    #[test]
    fn empty_file_is_not_candidate() {
        assert!(!has_zzfx_candidate(b""));
    }

    #[test]
    fn unterminated_block_comment_does_not_panic_or_leak_code_after() {
        // Malformed source (unterminated comment) must not crash the scanner
        // nor falsely report code after EOF as a candidate.
        assert!(!has_zzfx_candidate(b"/* zzfx never closes"));
    }
}
