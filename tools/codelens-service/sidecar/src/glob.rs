//! Minimal glob matcher for `workspace/scan`'s `include`/`exclude` patterns.
//! Supports `*` (any run of characters within one path segment), `?` (one
//! character within a segment), and `**` (zero or more whole segments,
//! crossing `/`). No brace expansion (`{a,b}`) or character classes —
//! callers needing those should pass multiple explicit patterns instead.

pub fn glob_match(pattern: &str, path: &str) -> bool {
    let pattern_segments: Vec<&str> = pattern.split('/').filter(|s| !s.is_empty()).collect();
    let path_segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    match_segments(&pattern_segments, &path_segments)
}

fn match_segments(pattern: &[&str], path: &[&str]) -> bool {
    match pattern.first() {
        None => path.is_empty(),
        Some(&"**") => {
            match_segments(&pattern[1..], path)
                || (!path.is_empty() && match_segments(pattern, &path[1..]))
        }
        Some(segment) => match path.split_first() {
            Some((head, rest)) => {
                segment_match(segment, head) && match_segments(&pattern[1..], rest)
            }
            None => false,
        },
    }
}

fn segment_match(pattern: &str, text: &str) -> bool {
    fn helper(pattern: &[u8], text: &[u8]) -> bool {
        match (pattern.first(), text.first()) {
            (None, None) => true,
            (Some(b'*'), _) => {
                helper(&pattern[1..], text) || (!text.is_empty() && helper(pattern, &text[1..]))
            }
            (Some(b'?'), Some(_)) => helper(&pattern[1..], &text[1..]),
            (Some(p), Some(t)) if p == t => helper(&pattern[1..], &text[1..]),
            _ => false,
        }
    }
    helper(pattern.as_bytes(), text.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_match() {
        assert!(glob_match("src/foo.ts", "src/foo.ts"));
        assert!(!glob_match("src/foo.ts", "src/bar.ts"));
    }

    #[test]
    fn star_matches_within_segment_only() {
        assert!(glob_match("src/*.ts", "src/foo.ts"));
        assert!(!glob_match("src/*.ts", "src/nested/foo.ts"));
    }

    #[test]
    fn double_star_matches_across_segments() {
        assert!(glob_match("**/*.ts", "src/nested/deep/foo.ts"));
        assert!(glob_match("**/*.ts", "foo.ts"));
        assert!(!glob_match("**/*.ts", "foo.js"));
    }

    #[test]
    fn double_star_matches_zero_segments() {
        assert!(glob_match("src/**/foo.ts", "src/foo.ts"));
        assert!(glob_match("src/**/foo.ts", "src/a/b/foo.ts"));
    }

    #[test]
    fn exclude_node_modules_pattern() {
        assert!(glob_match(
            "**/node_modules/**",
            "a/node_modules/pkg/index.js"
        ));
        assert!(!glob_match("**/node_modules/**", "a/src/index.js"));
    }

    #[test]
    fn question_mark_matches_one_char() {
        assert!(glob_match("a?.ts", "ab.ts"));
        assert!(!glob_match("a?.ts", "abc.ts"));
    }
}
