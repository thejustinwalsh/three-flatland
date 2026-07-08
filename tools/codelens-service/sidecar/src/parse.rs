//! tree-sitter-driven extraction of audio-reference findings from a source
//! file's text: `zzfx(...)` calls, `zzfxm(...)`/`zzfxM(...)` song calls, and
//! generic audio-file string-literal references (three.js/Howler/`Audio`/
//! `fetch`/etc.). One AST walk produces all three kinds — see
//! [`find_audio_findings`].

use tree_sitter::{Node, Parser};

use crate::id::finding_id;
use crate::model::{
    AUDIO_FILE_KIND, AudioFilePayload, ByteRange, Finding, FindingPayload, Range, VarRef,
    ZZFX_CALL_KIND, ZZFXM_SONG_KIND, ZzfxPayload, ZzfxmPayload,
};
use crate::position::LineIndex;
use crate::scan::AUDIO_EXTENSIONS;

const ZZFX_NAME: &str = "zzfx";
const ZZFXM_NAMES: [&str; 2] = ["zzfxm", "zzfxM"];

/// Picks the tree-sitter grammar by file extension: `.tsx`/`.jsx` need the
/// JSX-aware TSX grammar (plain TS/JS grammar rejects JSX syntax), everything
/// else (`.ts`, `.js`, `.mjs`, `.cjs`, unknown) uses the TypeScript grammar,
/// which is also a valid superset for parsing plain JavaScript call sites.
fn language_for_uri(uri: &str) -> tree_sitter::Language {
    let path = uri.rsplit(['/', '\\']).next().unwrap_or(uri);
    if path.ends_with(".tsx") || path.ends_with(".jsx") {
        tree_sitter_typescript::LANGUAGE_TSX.into()
    } else {
        tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into()
    }
}

/// Parses `text` (the contents of `uri`) and returns every recognized
/// finding: `zzfx.call`, `zzfxm.song`, and `audio.file`. Malformed source
/// does not error — findings are best-effort extracted from whatever the
/// parser could recover.
pub fn find_audio_findings(uri: &str, text: &str) -> Vec<Finding> {
    let mut parser = Parser::new();
    parser
        .set_language(&language_for_uri(uri))
        .expect("bundled grammar must load");
    let Some(tree) = parser.parse(text, None) else {
        return Vec::new();
    };

    let line_index = LineIndex::new(text);
    let mut findings = Vec::new();
    walk(tree.root_node(), text, &line_index, uri, &mut findings);
    findings
}

fn walk(node: Node, text: &str, line_index: &LineIndex, uri: &str, out: &mut Vec<Finding>) {
    match node.kind() {
        "call_expression" => {
            if let Some(finding) = extract_callee_call(node, text, line_index, uri) {
                out.push(finding);
            }
        }
        "string" => {
            if let Some(finding) = extract_audio_file(node, text, line_index) {
                out.push(finding);
            }
        }
        "template_string" if is_zero_substitution_template(node) => {
            if let Some(finding) = extract_audio_file(node, text, line_index) {
                out.push(finding);
            }
        }
        _ => {}
    }
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        walk(child, text, line_index, uri, out);
    }
}

fn node_text<'a>(node: Node, text: &'a str) -> &'a str {
    &text[node.start_byte()..node.end_byte()]
}

/// Returns the callee name if `node` (a `call_expression`'s `function`
/// field) refers to a bare identifier or a member expression whose property
/// is that identifier — i.e. `zzfx(...)` or `a.b.zzfx(...)`.
fn callee_name<'a>(function: Node, text: &'a str) -> Option<&'a str> {
    match function.kind() {
        "identifier" => Some(node_text(function, text)),
        "member_expression" => {
            let property = function.child_by_field_name("property")?;
            if property.kind() == "property_identifier" {
                Some(node_text(property, text))
            } else {
                None
            }
        }
        _ => None,
    }
}

/// Dispatches a `call_expression` node to whichever callee-named scanner (if
/// any) claims it. Adding a fourth callee-based scanner means adding one
/// more arm here.
fn extract_callee_call(
    call: Node,
    text: &str,
    line_index: &LineIndex,
    uri: &str,
) -> Option<Finding> {
    let function = call.child_by_field_name("function")?;
    let name = callee_name(function, text)?;
    if name == ZZFX_NAME {
        return extract_zzfx_call(call, text, line_index, uri);
    }
    if ZZFXM_NAMES.contains(&name) {
        return extract_zzfxm_call(call, text, line_index, uri);
    }
    None
}

fn extract_zzfx_call(call: Node, text: &str, line_index: &LineIndex, uri: &str) -> Option<Finding> {
    let arguments = call.child_by_field_name("arguments")?;

    let (arg_start, arg_end) = argument_interior_range(arguments);
    let arg_range = Range {
        start: line_index.position(text, arg_start),
        end: line_index.position(text, arg_end),
    };

    let (params, var_ref) = extract_params(arguments, text, uri);

    let byte_range = ByteRange {
        start: call.start_byte(),
        end: call.end_byte(),
    };
    let range = Range {
        start: line_index.position(text, call.start_byte()),
        end: line_index.position(text, call.end_byte()),
    };
    let id = finding_id(ZZFX_CALL_KIND, byte_range.start, byte_range.end, &params);

    Some(Finding {
        id,
        range,
        byte_range,
        payload: FindingPayload::ZzfxCall(ZzfxPayload {
            params,
            arg_range,
            var_ref,
        }),
    })
}

/// Extracts a `zzfxm(...)`/`zzfxM(...)` song call. Only the FIRST argument
/// matters for detection — a bare identifier there, or a spread of one
/// (`zzfxM(...songVar)`, the canonical zzfxm-tool output shape), resolves to
/// a `varRef` exactly like `zzfx`'s preset resolution (same
/// `resolve_var_ref` path); anything else (an inline array literal, a call
/// expression, a spread of a non-identifier, ...) yields no `varRef`.
/// Trailing args (playback position, speed) are irrelevant here.
fn extract_zzfxm_call(
    call: Node,
    text: &str,
    line_index: &LineIndex,
    uri: &str,
) -> Option<Finding> {
    let arguments = call.child_by_field_name("arguments")?;

    let (arg_start, arg_end) = argument_interior_range(arguments);
    let arg_range = Range {
        start: line_index.position(text, arg_start),
        end: line_index.position(text, arg_end),
    };

    let mut cursor = arguments.walk();
    let first = arguments.named_children(&mut cursor).next();
    let var_ref = match first {
        Some(n) if n.kind() == "identifier" => {
            let name = node_text(n, text).to_string();
            Some(resolve_var_ref(name, arguments, text, uri))
        }
        Some(n) if n.kind() == "spread_element" => match n.named_child(0) {
            Some(inner) if inner.kind() == "identifier" => {
                let name = node_text(inner, text).to_string();
                Some(resolve_var_ref(name, arguments, text, uri))
            }
            _ => None,
        },
        _ => None,
    };

    let byte_range = ByteRange {
        start: call.start_byte(),
        end: call.end_byte(),
    };
    let range = Range {
        start: line_index.position(text, call.start_byte()),
        end: line_index.position(text, call.end_byte()),
    };
    let id = finding_id(ZZFXM_SONG_KIND, byte_range.start, byte_range.end, &[]);

    Some(Finding {
        id,
        range,
        byte_range,
        payload: FindingPayload::ZzfxmSong(ZzfxmPayload { arg_range, var_ref }),
    })
}

/// True only for a template literal with NO `${}` substitutions — its value
/// is then statically knowable from source text alone, same as a plain
/// string literal. A template with any substitution is unresolvable
/// statically and must be skipped (per the audio.file contract).
fn is_zero_substitution_template(node: Node) -> bool {
    let mut cursor = node.walk();
    !node
        .children(&mut cursor)
        .any(|c| c.kind() == "template_substitution")
}

/// A `string`/zero-substitution `template_string` node's interior text and
/// byte range, with the surrounding quote/backtick trimmed off. Both are
/// delimited by a single 1-byte token on each side, so a plain byte trim
/// is exact — verified empirically against tree-sitter-typescript's actual
/// node boundaries (no leading/trailing trivia inside the node).
fn string_literal_interior(node: Node, text: &str) -> (String, usize, usize) {
    let start = node.start_byte() + 1;
    let end = node.end_byte() - 1;
    (text[start..end].to_string(), start, end)
}

fn has_audio_extension(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    AUDIO_EXTENSIONS.iter().any(|ext| lower.ends_with(ext))
}

/// Walks up from `node` to the nearest enclosing `arguments` node and
/// returns that node's parent (the `call_expression`/`new_expression` that
/// owns it) — i.e. the closest call this node is an argument of, at any
/// depth (through arrays/objects/pairs). Returns `None` if `node` isn't
/// inside any call's argument list at all. Deliberately stops at the
/// NEAREST `arguments` ancestor, not the outermost: for `foo(bar('x.wav'))`
/// this attributes `'x.wav'` to `bar(...)`, not `foo(...)` — the closer,
/// more specific call is the more useful lens anchor, and it avoids
/// double-reporting the same string against every level of call nesting.
fn enclosing_call_via_arguments(node: Node) -> Option<Node> {
    let mut current = node;
    while let Some(parent) = current.parent() {
        if parent.kind() == "arguments" {
            return parent.parent();
        }
        current = parent;
    }
    None
}

/// Extracts an `audio.file` finding from a `string`/zero-substitution
/// `template_string` node whose value ends in a recognized audio extension
/// AND sits somewhere inside a call's argument list. Returns `None` for
/// everything else: wrong extension, or not inside any call at all (a bare
/// top-level string literal doesn't count).
fn extract_audio_file(node: Node, text: &str, line_index: &LineIndex) -> Option<Finding> {
    let (path, path_start, path_end) = string_literal_interior(node, text);
    if !has_audio_extension(&path) {
        return None;
    }
    let call = enclosing_call_via_arguments(node)?;
    if call.kind() != "call_expression" && call.kind() != "new_expression" {
        return None;
    }

    let path_range = Range {
        start: line_index.position(text, path_start),
        end: line_index.position(text, path_end),
    };
    let byte_range = ByteRange {
        start: call.start_byte(),
        end: call.end_byte(),
    };
    let range = Range {
        start: line_index.position(text, call.start_byte()),
        end: line_index.position(text, call.end_byte()),
    };
    // Keyed on the STRING's own byte range, not the call's — multiple audio
    // files can share one enclosing call (e.g. Howler's `src: [...]` array),
    // and each needs a distinct, stable id.
    let id = finding_id(AUDIO_FILE_KIND, path_start, path_end, &[]);

    Some(Finding {
        id,
        range,
        byte_range,
        payload: FindingPayload::AudioFile(AudioFilePayload { path, path_range }),
    })
}

/// The `arguments` node spans the parens themselves (e.g. `(1, 2)`). This
/// returns the interior byte range only — first byte after `(` to the last
/// byte before `)` — which is what an editor WorkspaceEdit should replace
/// when rewriting call arguments. For an empty argument list this is an
/// empty (zero-length) range positioned right after `(`.
fn argument_interior_range(arguments: Node) -> (usize, usize) {
    let mut cursor = arguments.walk();
    let mut open_end = arguments.start_byte();
    let mut close_start = arguments.end_byte();
    for child in arguments.children(&mut cursor) {
        match child.kind() {
            "(" => open_end = child.end_byte(),
            ")" => close_start = child.start_byte(),
            _ => {}
        }
    }
    (open_end, close_start)
}

/// Extracts numeric params from a `zzfx(...)` argument list, handling the
/// three shapes the ZzFX ecosystem actually emits:
///   - direct numeric args: `zzfx(1, .05, 220)`
///   - the idiomatic spread-of-array-literal: `zzfx(...[1, .05, 220])`
///   - a spread/bare variable reference: `zzfx(...LASER)` / `zzfx(myPreset)`
///
/// The first two resolve to a concrete `params` list; the third yields an
/// empty `params` list plus a `varRef` naming the identifier.
fn extract_params(arguments: Node, text: &str, uri: &str) -> (Vec<f64>, Option<VarRef>) {
    let named: Vec<Node> = {
        let mut cursor = arguments.walk();
        arguments.named_children(&mut cursor).collect()
    };

    if named.is_empty() {
        return (Vec::new(), None);
    }

    // zzfx(...[1, .05, 220]) or zzfx(...LASER)
    if named.len() == 1 && named[0].kind() == "spread_element" {
        let inner = named[0].named_child(0);
        if let Some(inner) = inner {
            if inner.kind() == "array" {
                let params = numbers_in(inner, text);
                return (params, None);
            }
            if inner.kind() == "identifier" {
                let name = node_text(inner, text).to_string();
                return (
                    Vec::new(),
                    Some(resolve_var_ref(name, arguments, text, uri)),
                );
            }
        }
        return (Vec::new(), None);
    }

    // zzfx(myPreset) - single bare identifier, no spread.
    if named.len() == 1 && named[0].kind() == "identifier" {
        let name = node_text(named[0], text).to_string();
        return (
            Vec::new(),
            Some(resolve_var_ref(name, arguments, text, uri)),
        );
    }

    // zzfx(1, .05, 220) - direct numeric args (including negative/float).
    let params: Vec<f64> = named
        .iter()
        .filter_map(|n| number_value(*n, text))
        .collect();
    (params, None)
}

fn numbers_in(array: Node, text: &str) -> Vec<f64> {
    let mut cursor = array.walk();
    array
        .named_children(&mut cursor)
        .filter_map(|n| number_value(n, text))
        .collect()
}

fn number_value(node: Node, text: &str) -> Option<f64> {
    match node.kind() {
        "number" => node_text(node, text).parse::<f64>().ok(),
        "unary_expression" => {
            let operator = node.child_by_field_name("operator")?;
            let argument = node.child_by_field_name("argument")?;
            let value = number_value(argument, text)?;
            match node_text(operator, text) {
                "-" => Some(-value),
                "+" => Some(value),
                _ => None,
            }
        }
        _ => None,
    }
}

/// Resolves `name`'s declaration within the same file only (v0 scope: no
/// cross-file resolution). Walks up from `from` to the enclosing program and
/// scans top-level `variable_declarator` nodes for a matching name.
///
/// `def_range` covers only the declarator's **value** (initializer) node —
/// e.g. just `[1, .05, 220]` in `const preset: number[] = [1, .05, 220]` —
/// not the name, any type annotation, or the `=`. The point of `defRange`
/// is "jump to / preview the actual preset values," and neither the
/// variable name nor its type annotation is that. A declarator with no
/// initializer (`let preset;`) has no value node to point at, so `def_uri`
/// is still set (there IS a declaration site) but `def_range` is `None`.
fn resolve_var_ref(name: String, from: Node, text: &str, uri: &str) -> VarRef {
    let mut root = from;
    while let Some(parent) = root.parent() {
        root = parent;
    }
    let line_index = LineIndex::new(text);
    let declarator = find_declarator(root, &name, text);
    match declarator {
        Some(decl) => VarRef {
            name,
            def_uri: Some(uri.to_string()),
            def_range: decl.child_by_field_name("value").map(|value| Range {
                start: line_index.position(text, value.start_byte()),
                end: line_index.position(text, value.end_byte()),
            }),
        },
        None => VarRef {
            name,
            def_uri: None,
            def_range: None,
        },
    }
}

fn find_declarator<'a>(node: Node<'a>, name: &str, text: &str) -> Option<Node<'a>> {
    if node.kind() == "variable_declarator"
        && let Some(id) = node.child_by_field_name("name")
        && id.kind() == "identifier"
        && node_text(id, text) == name
    {
        return Some(node);
    }
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if let Some(found) = find_declarator(child, name, text) {
            return Some(found);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn findings(uri: &str, text: &str) -> Vec<Finding> {
        find_audio_findings(uri, text)
    }

    fn call(uri: &str, text: &str) -> Finding {
        let mut findings = find_audio_findings(uri, text);
        assert_eq!(
            findings.len(),
            1,
            "expected exactly one finding in {text:?}, got {findings:?}"
        );
        findings.remove(0)
    }

    fn zzfx(uri: &str, text: &str) -> ZzfxPayload {
        call(uri, text)
            .as_zzfx_call()
            .expect("expected zzfx.call payload")
            .clone()
    }

    #[test]
    fn spread_of_array_literal_is_the_common_idiom() {
        let f = zzfx("a.ts", "zzfx(...[1,.05,220,0,.02]);");
        assert_eq!(f.params, vec![1.0, 0.05, 220.0, 0.0, 0.02]);
        assert!(f.var_ref.is_none());
    }

    #[test]
    fn direct_args() {
        let f = zzfx("a.ts", "zzfx(1,.05,220);");
        assert_eq!(f.params, vec![1.0, 0.05, 220.0]);
    }

    #[test]
    fn trailing_zeros_omitted() {
        let f = zzfx("a.ts", "zzfx(1,.05,220,0,0,0);");
        assert_eq!(f.params, vec![1.0, 0.05, 220.0, 0.0, 0.0, 0.0]);
    }

    #[test]
    fn negative_and_float_params() {
        let f = zzfx("a.ts", "zzfx(1,-0.5,.2,-.75);");
        assert_eq!(f.params, vec![1.0, -0.5, 0.2, -0.75]);
    }

    #[test]
    fn spread_var_reference() {
        let f = zzfx("a.ts", "zzfx(...LASER);");
        assert_eq!(f.params, Vec::<f64>::new());
        let var_ref = f.var_ref.expect("expected varRef");
        assert_eq!(var_ref.name, "LASER");
        assert!(var_ref.def_uri.is_none());
    }

    #[test]
    fn bare_preset_variable() {
        let f = zzfx("a.ts", "zzfx(myPreset);");
        assert_eq!(f.params, Vec::<f64>::new());
        let var_ref = f.var_ref.expect("expected varRef");
        assert_eq!(var_ref.name, "myPreset");
    }

    #[test]
    fn var_ref_resolves_same_file_declaration() {
        let src = "const myPreset = [1,.05,220];\nzzfx(myPreset);";
        let f = zzfx("a.ts", src);
        let var_ref = f.var_ref.expect("expected varRef");
        assert_eq!(var_ref.name, "myPreset");
        assert_eq!(var_ref.def_uri.as_deref(), Some("a.ts"));
        assert!(var_ref.def_range.is_some());
    }

    /// Computes the expected defRange for a `{prefix}{value};` declarator
    /// line (both plain-ASCII in these tests, so byte/UTF-16 counts agree)
    /// and asserts it against the actual resolved varRef — shared by the
    /// const/let/var/type-annotation cases below, which only vary the prefix.
    fn assert_def_range_covers_value(prefix: &str, value: &str, src: &str) {
        let f = zzfx("a.ts", src);
        let var_ref = f.var_ref.expect("expected varRef");
        let def_range = var_ref.def_range.expect("expected defRange");
        assert_eq!(def_range.start.line, 0);
        assert_eq!(
            def_range.start.character,
            prefix.encode_utf16().count() as u32,
            "defRange must start at the value, not the declarator's name/keyword"
        );
        assert_eq!(
            def_range.end.character,
            (prefix.encode_utf16().count() + value.encode_utf16().count()) as u32,
            "defRange must end at the value's own end, not extend into type/`;`"
        );
    }

    #[test]
    fn var_ref_def_range_covers_only_the_value_for_const() {
        let prefix = "const myPreset = ";
        let value = "[1,.05,220]";
        let src = format!("{prefix}{value};\nzzfx(myPreset);");
        assert_def_range_covers_value(prefix, value, &src);
    }

    #[test]
    fn var_ref_def_range_covers_only_the_value_for_let() {
        let prefix = "let myPreset = ";
        let value = "[1,.05,220]";
        let src = format!("{prefix}{value};\nzzfx(myPreset);");
        assert_def_range_covers_value(prefix, value, &src);
    }

    #[test]
    fn var_ref_def_range_excludes_the_type_annotation() {
        // The type annotation sits BETWEEN the name and the value
        // (`name: Type = value`) — defRange must skip over it entirely,
        // not just trim the declarator's tail.
        let prefix = "let myPreset: number[] = ";
        let value = "[1,.05,220]";
        let src = format!("{prefix}{value};\nzzfx(myPreset);");
        assert_def_range_covers_value(prefix, value, &src);
    }

    #[test]
    fn var_ref_def_range_is_none_when_the_declarator_has_no_initializer() {
        // `let myPreset;` — declared but never assigned in this scope.
        // There is no value node to point at, so defRange must be None —
        // but defUri stays Some, since there genuinely IS a declaration
        // site, just not one with a value worth previewing.
        let src = "let myPreset;\nzzfx(myPreset);";
        let f = zzfx("a.ts", src);
        let var_ref = f.var_ref.expect("expected varRef");
        assert_eq!(var_ref.def_uri.as_deref(), Some("a.ts"));
        assert!(var_ref.def_range.is_none());
    }

    #[test]
    fn var_ref_def_range_is_none_when_a_typed_declarator_has_no_initializer() {
        // Same as above, but with a type annotation and no initializer —
        // proves the "no value field" detection doesn't get confused by a
        // present `type` field when `value` is absent.
        let src = "let myPreset: number[];\nzzfx(myPreset);";
        let f = zzfx("a.ts", src);
        let var_ref = f.var_ref.expect("expected varRef");
        assert_eq!(var_ref.def_uri.as_deref(), Some("a.ts"));
        assert!(var_ref.def_range.is_none());
    }

    #[test]
    fn var_ref_def_range_covers_only_the_value_for_var() {
        // `var` is legacy but still valid TS/JS — same declarator shape as
        // const/let, must behave identically.
        let prefix = "var myPreset = ";
        let value = "[1,.05,220]";
        let src = format!("{prefix}{value};\nzzfx(myPreset);");
        assert_def_range_covers_value(prefix, value, &src);
    }

    #[test]
    fn var_ref_def_range_reports_a_non_array_initializers_range_unvalidated() {
        // The sidecar reports the initializer's range regardless of its
        // shape — it does not require (or check) that the value is an
        // array literal. `getPreset()` here is a call expression, not an
        // array, and defRange must still cover exactly that expression;
        // deciding what to do with a non-array initializer is the client's
        // job, not this layer's.
        let prefix = "const myPreset = ";
        let value = "getPreset()";
        let src = format!("{prefix}{value};\nzzfx(myPreset);");
        assert_def_range_covers_value(prefix, value, &src);
    }

    #[test]
    fn calls_inside_line_comments_do_not_match() {
        let f = findings("a.ts", "// zzfx(1,2,3) commented out\n");
        assert!(f.is_empty());
    }

    #[test]
    fn calls_inside_block_comments_do_not_match() {
        let f = findings("a.ts", "/* zzfx(4,5,6) block comment */\n");
        assert!(f.is_empty());
    }

    #[test]
    fn member_expression_call() {
        let f = zzfx("a.ts", "foo.zzfx(1,-0.5,.2);");
        assert_eq!(f.params, vec![1.0, -0.5, 0.2]);
    }

    #[test]
    fn zero_calls_file() {
        let f = findings("a.ts", "const x = 1;\nfunction foo() { return x; }\n");
        assert!(f.is_empty());
    }

    #[test]
    fn non_ascii_before_call_same_line_utf16_position() {
        // Non-ASCII code (not a comment) precedes the call on the same
        // line: 'é' and '字' are each 1 UTF-16 unit but 2/3 UTF-8 bytes, so
        // a byte-offset-as-character bug would overshoot the position.
        let prefix = "const s = \"é字\"; ";
        assert_ne!(
            prefix.len(),
            prefix.encode_utf16().count(),
            "fixture must exercise multi-byte chars"
        );
        let src = format!("{prefix}zzfx(1,2,3);");
        let f = call("a.ts", &src);
        assert_eq!(f.range.start.line, 0);
        assert_eq!(
            f.range.start.character,
            prefix.encode_utf16().count() as u32
        );
    }

    #[test]
    fn surrogate_pair_before_call_end_to_end_through_tree_sitter() {
        // Full-pipeline version of position.rs's LineIndex-level test: an
        // astral character (outside the BMP, so a UTF-16 surrogate pair —
        // 2 code units) sharing a line with the call, run through the real
        // tree-sitter parse + find_audio_findings, not just LineIndex
        // directly.
        let prefix = "const s = \"😀\"; ";
        let src = format!("{prefix}zzfx(1,2,3);");
        let f = call("a.ts", &src);
        assert_eq!(f.range.start.line, 0);
        assert_eq!(
            f.range.start.character,
            prefix.encode_utf16().count() as u32
        );
    }

    #[test]
    fn crlf_source_end_to_end_through_tree_sitter() {
        // A CRLF-terminated file, parsed for real (not just LineIndex in
        // isolation) — proves tree-sitter's own byte offsets plus our
        // position conversion agree on where the call actually is.
        let src = "const a = 1;\r\nzzfx(1,2,3);\r\n";
        let f = zzfx("a.ts", src);
        let full = call("a.ts", src);
        assert_eq!(full.range.start.line, 1);
        assert_eq!(full.range.start.character, 0);
        assert_eq!(f.params, vec![1.0, 2.0, 3.0]);
    }

    #[test]
    fn arg_range_covers_interior_only_not_parens() {
        let src = "zzfx(1,.05,220);";
        let f = call("a.ts", src);
        // "(" at byte 4..5, ")" at byte 14..15 -> interior is [5, 14).
        assert_eq!(f.byte_range.start, 0);
        assert_eq!(f.byte_range.end, 15);
        let p = f.as_zzfx_call().unwrap();
        assert_eq!(p.arg_range.start.character, 5);
        assert_eq!(p.arg_range.end.character, 14);
    }

    #[test]
    fn arg_range_is_empty_range_for_zero_args() {
        let src = "zzfx();";
        let f = call("a.ts", src);
        let p = f.as_zzfx_call().unwrap();
        assert_eq!(p.arg_range.start, p.arg_range.end);
        assert_eq!(p.arg_range.start.character, 5);
    }

    #[test]
    fn tsx_extension_parses_jsx_without_error() {
        let src = "const el = <div>{zzfx(1,.05,220)}</div>;";
        let f = findings("component.tsx", src);
        assert_eq!(f.len(), 1);
    }

    #[test]
    fn plain_js_file_parses_under_typescript_grammar() {
        let f = zzfx("plain.js", "zzfx(...[1,.05,220]);");
        assert_eq!(f.params, vec![1.0, 0.05, 220.0]);
    }

    #[test]
    fn ids_are_stable_across_repeated_parses() {
        let src = "zzfx(1,.05,220);";
        let a = call("a.ts", src);
        let b = call("a.ts", src);
        assert_eq!(a.id, b.id);
    }

    // ---- zzfxm.song ----

    #[test]
    fn zzfxm_lowercase_literal_song_has_no_var_ref() {
        let f = call("a.ts", "zzfxm([[[1,0,220]],[[0,0,0,1]],[1]]);");
        assert_eq!(f.kind(), ZZFXM_SONG_KIND);
        let p = f.as_zzfxm_song().expect("expected zzfxm.song payload");
        assert!(p.var_ref.is_none());
    }

    #[test]
    fn zzfxm_uppercase_m_is_recognized_too() {
        let f = call("a.ts", "zzfxM([[[1,0,220]],[[0,0,0,1]],[1]]);");
        assert_eq!(f.kind(), ZZFXM_SONG_KIND);
    }

    #[test]
    fn zzfxm_has_no_params_field_ever() {
        // Payload-level contract: zzfxm.song never carries a params array —
        // it's structurally absent, not just empty.
        let f = call("a.ts", "zzfxm(mySong);");
        let json = serde_json::to_value(&f).unwrap();
        assert!(json["payload"].get("params").is_none());
    }

    #[test]
    fn zzfxm_bare_identifier_resolves_a_var_ref() {
        let src = "const mySong = [[[1,0,220]],[[0,0,0,1]],[1]];\nzzfxm(mySong);";
        let f = call("a.ts", src);
        let p = f.as_zzfxm_song().expect("expected zzfxm.song payload");
        let var_ref = p.var_ref.as_ref().expect("expected varRef");
        assert_eq!(var_ref.name, "mySong");
        assert_eq!(var_ref.def_uri.as_deref(), Some("a.ts"));
        assert!(
            var_ref.def_range.is_some(),
            "song has an initializer, defRange must be Some"
        );
    }

    #[test]
    fn zzfxm_spread_identifier_resolves_a_var_ref_like_a_bare_one() {
        // `zzfxM(...songVar)` is the canonical zzfxm-tool output shape —
        // the spread must resolve the SAME varRef a bare `zzfxm(songVar)`
        // does, not fall through to "no varRef" (the old graceful-refusal
        // path, which read as a bug: the bare form of the same variable
        // played while the spread form refused).
        let src = "const mySong = [[[1,0,220]],[[0,0,0,1]],[1]];\nzzfxM(...mySong);";
        let f = call("a.ts", src);
        let p = f.as_zzfxm_song().expect("expected zzfxm.song payload");
        let var_ref = p.var_ref.as_ref().expect("expected varRef from spread");
        assert_eq!(var_ref.name, "mySong");
        assert_eq!(var_ref.def_uri.as_deref(), Some("a.ts"));
        assert!(var_ref.def_range.is_some());
    }

    #[test]
    fn zzfxm_spread_of_array_literal_still_has_no_var_ref() {
        // Only a spread OF AN IDENTIFIER resolves — spreading an inline
        // array literal has no declaration to point at.
        let f = call("a.ts", "zzfxm(...[[[1,0,220]],[[0,0,0,1]],[1]]);");
        let p = f.as_zzfxm_song().unwrap();
        assert!(p.var_ref.is_none());
    }

    #[test]
    fn zzfxm_trailing_position_and_speed_args_are_irrelevant_to_detection() {
        let f = call("a.ts", "zzfxm(mySong, 1, 0.5);");
        assert_eq!(f.kind(), ZZFXM_SONG_KIND);
        let p = f.as_zzfxm_song().unwrap();
        assert_eq!(p.var_ref.as_ref().unwrap().name, "mySong");
    }

    #[test]
    fn zzfxm_arg_range_covers_interior_only() {
        let src = "zzfxm(mySong);";
        let f = call("a.ts", src);
        let p = f.as_zzfxm_song().unwrap();
        // "(" at byte 5..6, ")" at byte 12..13 -> interior [6, 12).
        assert_eq!(p.arg_range.start.character, 6);
        assert_eq!(p.arg_range.end.character, 12);
    }

    #[test]
    fn zzfxm_call_inside_a_comment_does_not_match() {
        let f = findings("a.ts", "// zzfxm(song) commented out\n");
        assert!(f.is_empty());
    }

    #[test]
    fn zzfxm_member_expression_call_is_recognized() {
        let f = call("a.ts", "audio.zzfxm(mySong);");
        assert_eq!(f.kind(), ZZFXM_SONG_KIND);
    }

    // ---- audio.file ----

    #[test]
    fn direct_string_argument_is_an_audio_file_finding() {
        let f = call("a.ts", "new Audio('explosion.mp3');");
        assert_eq!(f.kind(), AUDIO_FILE_KIND);
        let p = f.as_audio_file().unwrap();
        assert_eq!(p.path, "explosion.mp3");
    }

    #[test]
    fn path_range_excludes_the_surrounding_quotes() {
        let src = "new Audio('explosion.mp3');";
        let f = call("a.ts", src);
        let p = f.as_audio_file().unwrap();
        // "new Audio(" is 10 chars, then the quote, then the path.
        assert_eq!(p.path_range.start.character, 11);
        assert_eq!(p.path_range.end.character, 24); // 11 + len("explosion.mp3")
        assert_eq!(&src[11..24], "explosion.mp3");
    }

    #[test]
    fn call_expression_direct_arg_is_recognized_not_just_new_expression() {
        let f = call("a.ts", "audioLoader.load('jump.ogg');");
        let p = f.as_audio_file().unwrap();
        assert_eq!(p.path, "jump.ogg");
    }

    #[test]
    fn fetch_call_is_recognized() {
        let f = call("a.ts", "fetch('boom.wav');");
        assert_eq!(f.as_audio_file().unwrap().path, "boom.wav");
    }

    #[test]
    fn chained_call_attributes_to_the_nearest_inner_call_not_the_outer_one() {
        // Tone.Player('riff.mp3').toDestination() — the enclosing call for
        // the string is Tone.Player(...), the nearest arguments ancestor,
        // not the outer .toDestination() call.
        let src = "Tone.Player('riff.mp3').toDestination();";
        let f = call("a.ts", src);
        let p = f.as_audio_file().unwrap();
        assert_eq!(p.path, "riff.mp3");
        assert_eq!(f.range.start.character, 0);
        assert_eq!(
            f.range.end.character,
            "Tone.Player('riff.mp3')".encode_utf16().count() as u32
        );
    }

    #[test]
    fn howler_style_nested_strings_produce_one_finding_per_string() {
        // new Howl({ src: ['ambient.ogg', 'ambient.mp3'] }) — two audio.file
        // findings, both sharing the SAME enclosing call range but each with
        // its own distinct path/pathRange/id.
        let src = "new Howl({src:['ambient.ogg','ambient.mp3']});";
        let all = findings("a.ts", src);
        assert_eq!(all.len(), 2, "expected one finding per string literal");
        let paths: Vec<&str> = all
            .iter()
            .map(|f| f.as_audio_file().unwrap().path.as_str())
            .collect();
        assert_eq!(paths, vec!["ambient.ogg", "ambient.mp3"]);
        assert_eq!(
            all[0].range, all[1].range,
            "both share the enclosing new Howl(...) call's range"
        );
        assert_ne!(
            all[0].id, all[1].id,
            "each string gets a distinct, stable id"
        );
    }

    #[test]
    fn nested_array_of_objects_still_reaches_the_string_at_any_depth() {
        let src = "player.load([{path:'x.wav'}]);";
        let f = call("a.ts", src);
        assert_eq!(f.as_audio_file().unwrap().path, "x.wav");
    }

    #[test]
    fn wad_file_mode_source_nested_in_a_new_expressions_object_arg_is_recognized() {
        // Wad (github.com/rserota/wad): `new Wad({ source: 'jump.wav' })` —
        // no dedicated scanner needed, it's exactly the generic audio.file
        // shape (a string at depth 1 inside a new-expression's object arg),
        // pinned here by name so the coverage claim isn't just implied by
        // the more generic nested-object test above.
        let f = call("a.ts", "new Wad({source:'sounds/jump.wav'});");
        assert_eq!(f.kind(), AUDIO_FILE_KIND);
        assert_eq!(f.as_audio_file().unwrap().path, "sounds/jump.wav");
    }

    #[test]
    fn wad_synthesis_mode_source_has_no_audio_extension_and_is_correctly_not_a_finding() {
        // Wad's OTHER mode: `source: 'sine'`/'square'/etc. synthesizes a
        // tone instead of loading a file — no audio extension, so this
        // must NOT be a finding. Pins the boundary explicitly rather than
        // leaving it an accidental consequence of the extension check.
        let f = findings("a.ts", "new Wad({source:'sine'});");
        assert!(f.is_empty());
    }

    #[test]
    fn wad_reverb_impulse_two_levels_deep_is_a_finding() {
        // Wad's convolution reverb references its impulse-response FILE two
        // object levels down (`{reverb:{impulse:'ir.wav'}}`) — the generic
        // depth-agnostic walk reaches it with no Wad-specific code, pinned
        // here by name (same reasoning as the file-mode source test above).
        let f = call("a.ts", "new Wad({reverb:{impulse:'ir.wav'}});");
        assert_eq!(f.kind(), AUDIO_FILE_KIND);
        assert_eq!(f.as_audio_file().unwrap().path, "ir.wav");
    }

    #[test]
    fn wad_sound_iterator_files_array_reports_only_the_file_string() {
        // `new Wad.SoundIterator({files:[...]})` mixes real file paths with
        // inline `new Wad(...)` synthesis objects in one array. Exactly ONE
        // finding: 'riff.mp3'. The inner `new Wad({source:'square'})` is
        // synthesis (no audio extension) — its presence must not produce a
        // finding nor swallow the sibling path's.
        let src = "new Wad.SoundIterator({files:['riff.mp3', new Wad({source:'square'})]});";
        let f = call("a.ts", src);
        assert_eq!(f.kind(), AUDIO_FILE_KIND);
        assert_eq!(f.as_audio_file().unwrap().path, "riff.mp3");
        // Attribution: 'riff.mp3''s nearest enclosing call is the
        // SoundIterator new-expression itself, not the inner new Wad.
        assert_eq!(f.range.start.character, 0);
        assert_eq!(f.range.end.character, (src.len() - 1) as u32);
    }

    #[test]
    fn wad_every_synthesis_mode_source_is_not_a_finding() {
        // The full synthesis vocabulary, not just 'sine' (pinned above):
        // oscillator shapes, noise, and live mic input all name NO file.
        for source in ["square", "sawtooth", "triangle", "noise", "mic"] {
            let src = format!("new Wad({{source:'{source}'}});");
            let f = findings("a.ts", &src);
            assert!(f.is_empty(), "source:'{source}' must not be a finding");
        }
    }

    #[test]
    fn wad_sprite_segments_alone_are_not_findings() {
        // An audio sprite maps names to [start, duration] SEGMENTS of the
        // source — numbers, not separate files. Nothing here has an audio
        // extension, so the sprite map alone contributes no finding.
        let f = findings("a.ts", "new Wad({sprite:{hello:[0,0.4]}});");
        assert!(f.is_empty());
    }

    #[test]
    fn wad_preset_member_expression_is_not_a_finding() {
        // `new Wad(Wad.presets.hiHatClosed)` — a member expression, no
        // string literal anywhere in the arguments; no user file involved.
        let f = findings("a.ts", "new Wad(Wad.presets.hiHatClosed);");
        assert!(f.is_empty());
    }

    #[test]
    fn extension_matching_is_case_insensitive() {
        let f = call("a.ts", "new Audio('BOOM.MP3');");
        assert_eq!(f.as_audio_file().unwrap().path, "BOOM.MP3");
    }

    #[test]
    fn every_recognized_extension_is_detected() {
        for ext in AUDIO_EXTENSIONS {
            let src = format!("new Audio('clip{ext}');");
            let f = findings("a.ts", &src);
            assert_eq!(f.len(), 1, "{ext} must be recognized");
        }
    }

    #[test]
    fn a_non_audio_string_argument_is_not_a_finding() {
        let f = findings("a.ts", "console.log('hello world');");
        assert!(f.is_empty());
    }

    #[test]
    fn a_bare_top_level_string_not_inside_any_call_is_not_a_finding() {
        let f = findings("a.ts", "const path = 'jump.ogg';");
        assert!(f.is_empty());
    }

    #[test]
    fn zero_substitution_template_literal_is_recognized() {
        let f = call("a.ts", "new Audio(`jump.ogg`);");
        assert_eq!(f.as_audio_file().unwrap().path, "jump.ogg");
    }

    #[test]
    fn template_literal_with_a_substitution_is_skipped_unresolvable_statically() {
        let f = findings("a.ts", "new Audio(`jump-${id}.ogg`);");
        assert!(f.is_empty());
    }

    #[test]
    fn audio_file_string_inside_a_comment_does_not_match() {
        let f = findings("a.ts", "// new Audio('jump.ogg');\n");
        assert!(f.is_empty());
    }

    #[test]
    fn zzfx_call_with_no_string_args_never_produces_an_audio_file_finding() {
        // zzfx's own args are numeric; make sure the audio.file scanner
        // doesn't somehow misfire against a zzfx call's own finding.
        let f = findings("a.ts", "zzfx(1,.05,220);");
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].kind(), ZZFX_CALL_KIND);
    }

    #[test]
    fn a_file_can_mix_all_three_kinds() {
        let src = "\
const preset = [1,.05,220];
export function boom() { zzfx(...preset); }
export function song() { zzfxm(mySong); }
export function sfx() { new Audio('explosion.mp3'); }
";
        let all = findings("a.ts", src);
        assert_eq!(all.len(), 3);
        let kinds: Vec<&str> = all.iter().map(Finding::kind).collect();
        assert_eq!(
            kinds,
            vec![ZZFX_CALL_KIND, ZZFXM_SONG_KIND, AUDIO_FILE_KIND]
        );
    }
}
