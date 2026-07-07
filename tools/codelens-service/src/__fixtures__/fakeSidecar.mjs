#!/usr/bin/env node
// Minimal stand-in for the Rust codelens-service sidecar, used only to
// test CodelensServiceClient's process/framing/request-correlation plumbing
// without depending on a Rust toolchain being available. Deliberately a
// separate, from-scratch framing implementation (not importing src/framing.ts)
// so it exercises the wire format as an independent peer, the way the real
// Rust binary does.
//
// Behavior mirrors the real sidecar's contract for the methods this fixture
// implements; it is NOT a full reimplementation (no tree-sitter, no SQLite).

let buffer = Buffer.alloc(0)
const didChangeLog = []

function writeMessage(body) {
  const json = Buffer.from(JSON.stringify(body), 'utf8')
  process.stdout.write(`Content-Length: ${json.byteLength}\r\n\r\n`)
  process.stdout.write(json)
}

function handleRequest(message) {
  const { id, method, params } = message
  switch (method) {
    case 'initialize':
      return respond(id, {
        version: '0.0.0-fake',
        capabilities: { scan: true, parse: true, incremental: true },
      })
    case 'workspace/scan':
      return respond(id, {
        matches: (params.candidates ?? []).map((uri) => ({
          uri,
          contentHash: 'fake-hash',
          hasCandidate: true,
        })),
      })
    case 'document/parse':
      return respond(id, {
        uri: params.uri,
        findings: [
          {
            kind: 'zzfx.call',
            id: 'fakefindingid0001',
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 16 } },
            byteRange: { start: 0, end: 16 },
            payload: {
              params: [1, 0.05, 220],
              argRange: { start: { line: 0, character: 5 }, end: { line: 0, character: 14 } },
            },
          },
        ],
        // Surfaces whether a prior didChange for this uri was received, so
        // tests can assert notify() actually reached the child process.
        _didChangeSeen: didChangeLog.includes(params.uri),
      })
    case 'shutdown':
      respond(id, null)
      process.stdout.end(() => process.exit(0))
      return
    case 'boom':
      return respondError(id, -32000, 'boom requested')
    default:
      return respondError(id, -32601, `method not found: ${method}`)
  }
}

function respond(id, result) {
  writeMessage({ jsonrpc: '2.0', id, result })
}

function respondError(id, code, message) {
  writeMessage({ jsonrpc: '2.0', id, error: { code, message } })
}

function handleNotification(message) {
  if (message.method === 'document/didChange') {
    didChangeLog.push(message.params.uri)
    process.stderr.write(`didChange: ${message.params.uri}\n`)
  }
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk])
  for (;;) {
    const headerEnd = buffer.indexOf('\r\n\r\n')
    if (headerEnd === -1) return
    const header = buffer.subarray(0, headerEnd).toString('ascii')
    const match = /Content-Length:\s*(\d+)/i.exec(header)
    if (!match) throw new Error('fakeSidecar: missing Content-Length')
    const length = Number(match[1])
    const bodyStart = headerEnd + 4
    const bodyEnd = bodyStart + length
    if (buffer.byteLength < bodyEnd) return
    const body = buffer.subarray(bodyStart, bodyEnd)
    buffer = buffer.subarray(bodyEnd)

    const message = JSON.parse(body.toString('utf8'))
    if (message.id !== undefined) handleRequest(message)
    else handleNotification(message)
  }
})
