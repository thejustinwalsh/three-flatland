//! LSP-style `Content-Length: N\r\n\r\n{json}` framing over any
//! `Read`/`Write` pair (in production, stdin/stdout).

use std::io::{self, BufRead, Write};

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
            let parsed = value.trim().parse::<usize>().map_err(|_| {
                io::Error::new(io::ErrorKind::InvalidData, "invalid Content-Length")
            })?;
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
}
