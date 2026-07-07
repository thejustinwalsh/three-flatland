//! Byte-offset -> LSP `Pos` (0-based line, UTF-16 code-unit character)
//! conversion. Tree-sitter node offsets are always byte offsets into the
//! UTF-8 source; VS Code/LSP positions are UTF-16 code units within a line,
//! so non-ASCII text on a line shifts the column and must be converted
//! explicitly rather than treated as a byte count.

use crate::model::Pos;

pub struct LineIndex {
    /// Byte offset of the start of each line; `line_starts[0] == 0`.
    line_starts: Vec<usize>,
}

impl LineIndex {
    pub fn new(text: &str) -> Self {
        let mut line_starts = vec![0];
        for (i, byte) in text.bytes().enumerate() {
            if byte == b'\n' {
                line_starts.push(i + 1);
            }
        }
        LineIndex { line_starts }
    }

    /// Converts a byte offset into `text` to a 0-based line / UTF-16-unit
    /// character position. `byte_offset` must land on a UTF-8 char boundary
    /// (true for every tree-sitter node/token offset in practice).
    pub fn position(&self, text: &str, byte_offset: usize) -> Pos {
        let line = match self.line_starts.binary_search(&byte_offset) {
            Ok(idx) => idx,
            Err(idx) => idx.saturating_sub(1),
        };
        let line_start = self.line_starts[line];
        let character = text[line_start..byte_offset].encode_utf16().count() as u32;
        Pos {
            line: line as u32,
            character,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ascii_single_line() {
        let text = "zzfx(1,2,3);";
        let idx = LineIndex::new(text);
        assert_eq!(
            idx.position(text, 0),
            Pos {
                line: 0,
                character: 0
            }
        );
        assert_eq!(
            idx.position(text, 5),
            Pos {
                line: 0,
                character: 5
            }
        );
    }

    #[test]
    fn multi_line_offsets() {
        let text = "const a = 1;\nzzfx(1,2,3);\n";
        let idx = LineIndex::new(text);
        // "zzfx" starts right after the first newline, at byte 13.
        assert_eq!(
            idx.position(text, 13),
            Pos {
                line: 1,
                character: 0
            }
        );
        assert_eq!(
            idx.position(text, 17),
            Pos {
                line: 1,
                character: 4
            }
        );
    }

    #[test]
    fn non_ascii_before_call_shifts_utf16_character() {
        // "é" is 2 UTF-8 bytes but 1 UTF-16 code unit; "字" is 3 UTF-8 bytes
        // but 1 UTF-16 code unit. Byte offset of "zzfx" must not be used
        // directly as the character count.
        let text = "// é字 comment\nzzfx(1,2,3);\n";
        let idx = LineIndex::new(text);
        let zzfx_byte_offset = text.find("zzfx").unwrap();
        let pos = idx.position(text, zzfx_byte_offset);
        assert_eq!(pos.line, 1);
        assert_eq!(pos.character, 0);
    }

    #[test]
    fn non_ascii_same_line_as_call() {
        // Prefix "// é字 " is 6 Unicode scalars ('/','/',' ','é','字',' '),
        // each 1 UTF-16 code unit (both é and 字 are within the BMP), but
        // 9 UTF-8 bytes ('é' = 2 bytes, '字' = 3 bytes). The character
        // offset must reflect the UTF-16 count (6), not the byte count (9).
        let text = "// é字 zzfx(1,2,3);";
        let idx = LineIndex::new(text);
        let zzfx_byte_offset = text.find("zzfx").unwrap();
        assert_eq!(zzfx_byte_offset, 9);
        let pos = idx.position(text, zzfx_byte_offset);
        assert_eq!(pos.line, 0);
        assert_eq!(pos.character, 6);
    }

    #[test]
    fn end_of_file_offset() {
        let text = "zzfx();";
        let idx = LineIndex::new(text);
        assert_eq!(
            idx.position(text, text.len()),
            Pos {
                line: 0,
                character: 7
            }
        );
    }
}
