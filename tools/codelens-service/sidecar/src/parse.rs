//! tree-sitter-driven extraction of `zzfx(...)` call findings from a source
//! file's text.

use tree_sitter::{Node, Parser};

use crate::id::finding_id;
use crate::model::{ByteRange, Finding, Payload, Range, VarRef, ZZFX_CALL_KIND};
use crate::position::LineIndex;

const ZZFX_NAME: &str = "zzfx";

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

/// Parses `text` (the contents of `uri`) and returns every `zzfx(...)` /
/// `*.zzfx(...)` call site found. Malformed source does not error — findings
/// are best-effort extracted from whatever the parser could recover.
pub fn find_zzfx_calls(uri: &str, text: &str) -> Vec<Finding> {
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
    if node.kind() == "call_expression"
        && let Some(finding) = extract_call(node, text, line_index, uri)
    {
        out.push(finding);
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

fn extract_call(call: Node, text: &str, line_index: &LineIndex, uri: &str) -> Option<Finding> {
    let function = call.child_by_field_name("function")?;
    if callee_name(function, text)? != ZZFX_NAME {
        return None;
    }
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
        kind: ZZFX_CALL_KIND.to_string(),
        id,
        range,
        byte_range,
        payload: Payload {
            params,
            arg_range,
            var_ref,
        },
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
            def_range: Some(Range {
                start: line_index.position(text, decl.start_byte()),
                end: line_index.position(text, decl.end_byte()),
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

    fn call(uri: &str, text: &str) -> Finding {
        let mut findings = find_zzfx_calls(uri, text);
        assert_eq!(
            findings.len(),
            1,
            "expected exactly one finding in {text:?}"
        );
        findings.remove(0)
    }

    #[test]
    fn spread_of_array_literal_is_the_common_idiom() {
        let f = call("a.ts", "zzfx(...[1,.05,220,0,.02]);");
        assert_eq!(f.payload.params, vec![1.0, 0.05, 220.0, 0.0, 0.02]);
        assert!(f.payload.var_ref.is_none());
    }

    #[test]
    fn direct_args() {
        let f = call("a.ts", "zzfx(1,.05,220);");
        assert_eq!(f.payload.params, vec![1.0, 0.05, 220.0]);
    }

    #[test]
    fn trailing_zeros_omitted() {
        let f = call("a.ts", "zzfx(1,.05,220,0,0,0);");
        assert_eq!(f.payload.params, vec![1.0, 0.05, 220.0, 0.0, 0.0, 0.0]);
    }

    #[test]
    fn negative_and_float_params() {
        let f = call("a.ts", "zzfx(1,-0.5,.2,-.75);");
        assert_eq!(f.payload.params, vec![1.0, -0.5, 0.2, -0.75]);
    }

    #[test]
    fn spread_var_reference() {
        let f = call("a.ts", "zzfx(...LASER);");
        assert_eq!(f.payload.params, Vec::<f64>::new());
        let var_ref = f.payload.var_ref.expect("expected varRef");
        assert_eq!(var_ref.name, "LASER");
        assert!(var_ref.def_uri.is_none());
    }

    #[test]
    fn bare_preset_variable() {
        let f = call("a.ts", "zzfx(myPreset);");
        assert_eq!(f.payload.params, Vec::<f64>::new());
        let var_ref = f.payload.var_ref.expect("expected varRef");
        assert_eq!(var_ref.name, "myPreset");
    }

    #[test]
    fn var_ref_resolves_same_file_declaration() {
        let src = "const myPreset = [1,.05,220];\nzzfx(myPreset);";
        let f = call("a.ts", src);
        let var_ref = f.payload.var_ref.expect("expected varRef");
        assert_eq!(var_ref.name, "myPreset");
        assert_eq!(var_ref.def_uri.as_deref(), Some("a.ts"));
        assert!(var_ref.def_range.is_some());
    }

    #[test]
    fn calls_inside_line_comments_do_not_match() {
        let findings = find_zzfx_calls("a.ts", "// zzfx(1,2,3) commented out\n");
        assert!(findings.is_empty());
    }

    #[test]
    fn calls_inside_block_comments_do_not_match() {
        let findings = find_zzfx_calls("a.ts", "/* zzfx(4,5,6) block comment */\n");
        assert!(findings.is_empty());
    }

    #[test]
    fn member_expression_call() {
        let f = call("a.ts", "foo.zzfx(1,-0.5,.2);");
        assert_eq!(f.payload.params, vec![1.0, -0.5, 0.2]);
    }

    #[test]
    fn zero_calls_file() {
        let findings = find_zzfx_calls("a.ts", "const x = 1;\nfunction foo() { return x; }\n");
        assert!(findings.is_empty());
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
        // tree-sitter parse + find_zzfx_calls, not just LineIndex directly.
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
        let f = call("a.ts", src);
        assert_eq!(f.range.start.line, 1);
        assert_eq!(f.range.start.character, 0);
        assert_eq!(f.payload.params, vec![1.0, 2.0, 3.0]);
    }

    #[test]
    fn arg_range_covers_interior_only_not_parens() {
        let src = "zzfx(1,.05,220);";
        let f = call("a.ts", src);
        // "(" at byte 4..5, ")" at byte 14..15 -> interior is [5, 14).
        assert_eq!(f.byte_range.start, 0);
        assert_eq!(f.byte_range.end, 15);
        assert_eq!(f.payload.arg_range.start.character, 5);
        assert_eq!(f.payload.arg_range.end.character, 14);
    }

    #[test]
    fn arg_range_is_empty_range_for_zero_args() {
        let src = "zzfx();";
        let f = call("a.ts", src);
        assert_eq!(f.payload.arg_range.start, f.payload.arg_range.end);
        assert_eq!(f.payload.arg_range.start.character, 5);
    }

    #[test]
    fn tsx_extension_parses_jsx_without_error() {
        let src = "const el = <div>{zzfx(1,.05,220)}</div>;";
        let findings = find_zzfx_calls("component.tsx", src);
        assert_eq!(findings.len(), 1);
    }

    #[test]
    fn plain_js_file_parses_under_typescript_grammar() {
        let f = call("plain.js", "zzfx(...[1,.05,220]);");
        assert_eq!(f.payload.params, vec![1.0, 0.05, 220.0]);
    }

    #[test]
    fn ids_are_stable_across_repeated_parses() {
        let src = "zzfx(1,.05,220);";
        let a = call("a.ts", src);
        let b = call("a.ts", src);
        assert_eq!(a.id, b.id);
    }
}
