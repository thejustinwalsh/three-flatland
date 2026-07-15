//! Content-identity hashing for the cache: "is this the exact bytes I
//! parsed before?" BLAKE3 (not the FNV-1a64 in [`crate::id`]) — this hash
//! gates whether `document/parse` trusts a cached findings set instead of
//! reparsing, so it needs real collision resistance, not just a cheap
//! checksum. [`crate::id::fnv1a64`] remains fine for `finding_id`, which
//! only needs a stable display identifier, not a trust boundary.

/// Hex-encoded BLAKE3 digest (64 lowercase hex chars) of `bytes`.
pub fn content_hash(bytes: &[u8]) -> String {
    blake3::hash(bytes).to_hex().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_deterministic() {
        assert_eq!(content_hash(b"zzfx(1,2,3);"), content_hash(b"zzfx(1,2,3);"));
    }

    #[test]
    fn differs_for_different_content() {
        assert_ne!(content_hash(b"zzfx(1,2,3);"), content_hash(b"zzfx(1,2,4);"));
    }

    #[test]
    fn is_64_lowercase_hex_chars() {
        let hash = content_hash(b"anything");
        assert_eq!(hash.len(), 64);
        assert!(
            hash.chars()
                .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
        );
    }

    #[test]
    fn empty_input_hashes_to_the_known_blake3_empty_digest() {
        // Published BLAKE3 test vector for the empty input — verified
        // against a throwaway `blake3::hash(b"")` run, not typed from memory.
        assert_eq!(
            content_hash(b""),
            "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262"
        );
    }
}
