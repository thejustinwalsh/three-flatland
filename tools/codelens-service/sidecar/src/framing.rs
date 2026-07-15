//! LSP-style `Content-Length: N\r\n\r\n{json}` framing over any
//! `Read`/`Write` pair (in production, stdin/stdout).
//!
//! Parsing the header is deliberately strict: a header we can't trust
//! unambiguously (duplicated, non-numeric, or declaring an implausibly
//! large body) is a framing error, not a best-effort guess. Once the
//! header can't be trusted, byte alignment with the rest of the stream is
//! lost — the caller (`main.rs`) treats any [`io::Error`] from here as
//! fatal to the whole connection, since there is no way to know where the
//! next real frame boundary is.

use std::io::{self, BufRead, Write};

/// Upper bound on a single message body. Generous for any real zzfx source
/// file or findings payload, but bounded so a corrupt/adversarial
/// `Content-Length` can't force an unbounded allocation before we've even
/// validated the bytes it claims to describe.
pub const MAX_MESSAGE_BYTES: usize = 64 * 1024 * 1024;

/// Reads one framed message body. Returns `Ok(None)` on clean EOF (no bytes
/// read before the connection closed).
pub fn read_message<R: BufRead>(reader: &mut R) -> io::Result<Option<Vec<u8>>> {
    let mut content_length: Option<usize> = None;
    loop {
        let mut line = String::new();
        let n = reader.read_line(&mut line)?;
        if n == 0 {
            return Ok(None);
        }
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            break;
        }
        if let Some((name, value)) = trimmed.split_once(':')
            && name.eq_ignore_ascii_case("Content-Length")
        {
            if content_length.is_some() {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "duplicate Content-Length header",
                ));
            }
            let trimmed_value = value.trim();
            if trimmed_value.is_empty() || !trimmed_value.bytes().all(|b| b.is_ascii_digit()) {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "invalid Content-Length",
                ));
            }
            let parsed = trimmed_value.parse::<usize>().map_err(|_| {
                io::Error::new(io::ErrorKind::InvalidData, "invalid Content-Length")
            })?;
            if parsed > MAX_MESSAGE_BYTES {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!("Content-Length {parsed} exceeds the {MAX_MESSAGE_BYTES}-byte limit"),
                ));
            }
            content_length = Some(parsed);
        }
    }
    let len = content_length.ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidData, "missing Content-Length header")
    })?;
    let mut buf = vec![0u8; len];
    reader.read_exact(&mut buf)?;
    Ok(Some(buf))
}

/// Writes one framed message body and flushes.
pub fn write_message<W: Write>(writer: &mut W, body: &[u8]) -> io::Result<()> {
    write!(writer, "Content-Length: {}\r\n\r\n", body.len())?;
    writer.write_all(body)?;
    writer.flush()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufReader, Cursor};

    #[test]
    fn round_trips_a_single_message() {
        let mut buf: Vec<u8> = Vec::new();
        write_message(&mut buf, b"{\"hello\":true}").unwrap();
        let mut reader = BufReader::new(Cursor::new(buf));
        let msg = read_message(&mut reader).unwrap().unwrap();
        assert_eq!(msg, b"{\"hello\":true}");
    }

    #[test]
    fn round_trips_multiple_messages_back_to_back() {
        let mut buf: Vec<u8> = Vec::new();
        write_message(&mut buf, b"{\"a\":1}").unwrap();
        write_message(&mut buf, b"{\"b\":2}").unwrap();
        let mut reader = BufReader::new(Cursor::new(buf));
        assert_eq!(read_message(&mut reader).unwrap().unwrap(), b"{\"a\":1}");
        assert_eq!(read_message(&mut reader).unwrap().unwrap(), b"{\"b\":2}");
    }

    #[test]
    fn clean_eof_returns_none() {
        let mut reader = BufReader::new(Cursor::new(Vec::<u8>::new()));
        assert!(read_message(&mut reader).unwrap().is_none());
    }

    #[test]
    fn ignores_unrelated_headers() {
        let raw = b"Content-Type: application/json\r\nContent-Length: 4\r\n\r\ntest";
        let mut reader = BufReader::new(Cursor::new(raw.to_vec()));
        assert_eq!(read_message(&mut reader).unwrap().unwrap(), b"test");
    }

    #[test]
    fn missing_content_length_is_an_error_not_a_panic() {
        let raw = b"Content-Type: application/json\r\n\r\ntest";
        let mut reader = BufReader::new(Cursor::new(raw.to_vec()));
        assert!(read_message(&mut reader).is_err());
    }

    #[test]
    fn header_name_matching_is_case_insensitive() {
        let raw = b"content-length: 4\r\n\r\ntest";
        let mut reader = BufReader::new(Cursor::new(raw.to_vec()));
        assert_eq!(read_message(&mut reader).unwrap().unwrap(), b"test");
    }

    #[test]
    fn duplicate_content_length_headers_are_rejected_not_silently_resolved() {
        // A smuggling-style ambiguity: which one is authoritative? Neither —
        // reject the frame rather than silently pick a winner (and
        // critically, don't disagree with what the TS client picks either).
        let raw = b"Content-Length: 4\r\nContent-Length: 9999\r\n\r\ntest";
        let mut reader = BufReader::new(Cursor::new(raw.to_vec()));
        let err = read_message(&mut reader).unwrap_err();
        assert!(err.to_string().contains("duplicate"), "got: {err}");
    }

    #[test]
    fn content_length_with_trailing_garbage_is_rejected() {
        // A lenient numeric parser (e.g. one that stops at the first
        // non-digit) would silently accept "4abc" as 4. Ours must not.
        let raw = b"Content-Length: 4abc\r\n\r\ntest";
        let mut reader = BufReader::new(Cursor::new(raw.to_vec()));
        assert!(read_message(&mut reader).is_err());
    }

    #[test]
    fn content_length_with_a_decimal_point_is_rejected() {
        let raw = b"Content-Length: 1.5\r\n\r\ntest";
        let mut reader = BufReader::new(Cursor::new(raw.to_vec()));
        assert!(read_message(&mut reader).is_err());
    }

    #[test]
    fn negative_content_length_is_rejected() {
        let raw = b"Content-Length: -4\r\n\r\ntest";
        let mut reader = BufReader::new(Cursor::new(raw.to_vec()));
        assert!(read_message(&mut reader).is_err());
    }

    #[test]
    fn content_length_exceeding_the_max_is_rejected_before_allocating() {
        let raw = format!("Content-Length: {}\r\n\r\n", MAX_MESSAGE_BYTES + 1);
        let mut reader = BufReader::new(Cursor::new(raw.into_bytes()));
        let err = read_message(&mut reader).unwrap_err();
        assert!(err.to_string().contains("exceeds"), "got: {err}");
    }

    #[test]
    fn content_length_at_exactly_the_max_passes_the_bound_check() {
        // The bound is `> MAX_MESSAGE_BYTES`, not `>=` — a declared length
        // of exactly the max must clear the bound check and proceed to
        // read_exact, which then fails cleanly (not a panic) because the
        // reader has far fewer bytes than declared. Proves the boundary is
        // where we intend it, not off by one in either direction.
        let raw = format!("Content-Length: {MAX_MESSAGE_BYTES}\r\n\r\nshort");
        let mut reader = BufReader::new(Cursor::new(raw.into_bytes()));
        let err = read_message(&mut reader).unwrap_err();
        assert!(!err.to_string().contains("exceeds"), "got: {err}");
    }
}
