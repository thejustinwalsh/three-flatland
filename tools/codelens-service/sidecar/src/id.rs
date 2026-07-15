//! FNV-1a 64-bit hashing used to derive stable finding ids.

const FNV_OFFSET_BASIS: u64 = 0xcbf29ce484222325;
const FNV_PRIME: u64 = 0x0000_0100_0000_01b3;

/// Hashes `bytes` with FNV-1a (64-bit).
pub fn fnv1a64(bytes: &[u8]) -> u64 {
    let mut hash = FNV_OFFSET_BASIS;
    for &byte in bytes {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    hash
}

/// Derives a stable finding id from the finding kind, its byte range, and the
/// canonical (JSON-serialized) parameter list. Stable across runs because it
/// depends only on content, never on process/allocation state.
pub fn finding_id(kind: &str, byte_start: usize, byte_end: usize, params: &[f64]) -> String {
    let mut input = String::with_capacity(kind.len() + 32);
    input.push_str(kind);
    input.push_str(&byte_start.to_string());
    input.push(':');
    input.push_str(&byte_end.to_string());
    input.push_str(&serde_json::to_string(params).unwrap_or_default());
    format!("{:016x}", fnv1a64(input.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_vector_empty_string() {
        // FNV-1a 64 of the empty string is the offset basis itself.
        assert_eq!(fnv1a64(b""), FNV_OFFSET_BASIS);
    }

    #[test]
    fn known_vector_a() {
        // Reference value from the FNV test suite ("a").
        assert_eq!(fnv1a64(b"a"), 0xaf63dc4c8601ec8c);
    }

    #[test]
    fn finding_id_is_deterministic() {
        let a = finding_id("zzfx.call", 4, 26, &[1.0, 0.05, 220.0]);
        let b = finding_id("zzfx.call", 4, 26, &[1.0, 0.05, 220.0]);
        assert_eq!(a, b);
    }

    #[test]
    fn finding_id_changes_with_range() {
        let a = finding_id("zzfx.call", 4, 26, &[1.0]);
        let b = finding_id("zzfx.call", 5, 26, &[1.0]);
        assert_ne!(a, b);
    }

    #[test]
    fn finding_id_changes_with_params() {
        let a = finding_id("zzfx.call", 4, 26, &[1.0]);
        let b = finding_id("zzfx.call", 4, 26, &[2.0]);
        assert_ne!(a, b);
    }

    #[test]
    fn finding_id_is_lowercase_hex_16_chars() {
        let id = finding_id("zzfx.call", 0, 0, &[]);
        assert_eq!(id.len(), 16);
        assert!(
            id.chars()
                .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
        );
    }
}
