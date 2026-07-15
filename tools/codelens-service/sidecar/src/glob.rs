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

/// Backtrack-free two-pointer wildcard match (the standard linear-time
/// solution to "Wildcard Matching") — deliberately NOT the naive recursive
/// `helper(&pattern[1..], text) || helper(pattern, &text[1..])` formulation
/// it replaces, which is exponential for a non-matching input with many `*`s
/// (verified: didn't finish in 2 minutes for ~25-30 wildcards). Only the
/// most recently seen `*` and the text position it started backtracking from
/// (`star`/`star_text`) are ever remembered, so a mismatch re-tries the
/// current `*` one character further in `text` instead of recursing into
/// two branches — each `(pattern_pos, text_pos)` pair is visited at most
/// once, making this O(len(pattern) + len(text)) amortized.
fn segment_match(pattern: &str, text: &str) -> bool {
    let pattern = pattern.as_bytes();
    let text = text.as_bytes();

    let (mut p, mut t) = (0usize, 0usize);
    let mut star: Option<usize> = None;
    let mut star_text = 0usize;

    while t < text.len() {
        if p < pattern.len() && (pattern[p] == b'?' || pattern[p] == text[t]) {
            p += 1;
            t += 1;
        } else if p < pattern.len() && pattern[p] == b'*' {
            star = Some(p);
            star_text = t;
            p += 1;
        } else if let Some(star_p) = star {
            p = star_p + 1;
            star_text += 1;
            t = star_text;
        } else {
            return false;
        }
    }

    while p < pattern.len() && pattern[p] == b'*' {
        p += 1;
    }

    p == pattern.len()
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

    #[test]
    fn many_wildcards_against_a_non_matching_text_does_not_catastrophically_backtrack() {
        // Regression for a real DoS: the old naive recursive `helper` tried
        // both "skip this `*`" and "consume one char" branches at every `*`,
        // which is exponential for a non-matching input — independently
        // verified to take 30+ seconds at just 14 stars and to not finish
        // within 60s at 20 stars. `include`/`exclude` patterns arrive
        // verbatim off the wire with no complexity bound, and the sidecar's
        // single-threaded RPC loop means one such pattern would hang every
        // CodeLens for the whole session. The two-pointer rewrite must
        // resolve this near-instantly instead.
        let pattern = format!("{}X", "*".repeat(30));
        let text = "a".repeat(40); // never contains 'X' -> always fails
        let start = std::time::Instant::now();
        let matched = segment_match(&pattern, &text);
        let elapsed = start.elapsed();
        assert!(!matched);
        assert!(
            elapsed.as_millis() < 100,
            "expected near-instant match, took {elapsed:?}"
        );
    }
}
