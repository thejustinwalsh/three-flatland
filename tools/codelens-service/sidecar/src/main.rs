//! stdio entry point: reads LSP-framed JSON-RPC requests from stdin, hands
//! each one to [`codelens_service::rpc::dispatch`], and writes the response
//! (if any) back to stdout. Single-threaded — one request is fully handled
//! before the next is read, which is fine at this workload (per-file parses
//! on a local workspace) and keeps the SQLite cache access unsynchronized.

use std::io::{BufReader, Write, stdin, stdout};

use codelens_service::framing::{read_message, write_message};
use codelens_service::handlers::AppState;
use codelens_service::rpc::{Dispatch, dispatch};

fn main() {
    let stdin = stdin();
    let mut reader = BufReader::new(stdin.lock());
    let stdout = stdout();
    let mut writer = stdout.lock();

    let mut state = AppState::new();

    loop {
        let body = match read_message(&mut reader) {
            Ok(Some(body)) => body,
            Ok(None) => break, // clean EOF: client closed the pipe.
            Err(err) => {
                eprintln!("codelens-service: framing error: {err}");
                break;
            }
        };

        match dispatch(&mut state, &body) {
            Dispatch::Respond(response) => {
                if let Err(err) = write_message(&mut writer, &response) {
                    eprintln!("codelens-service: write error: {err}");
                    break;
                }
            }
            Dispatch::NoResponse => {}
            Dispatch::Shutdown(response) => {
                if let Err(err) = write_message(&mut writer, &response) {
                    eprintln!("codelens-service: write error: {err}");
                }
                let _ = writer.flush();
                break;
            }
        }
    }
}
