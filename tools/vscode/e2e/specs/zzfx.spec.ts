import { expect, test } from '../fixtures'

// See e2e/fixtures/README.md and src/sounds.ts's own header comment for
// what each line is testing: a literal spread-array call (line 49, one-
// indexed), a named-const spread call resolving `LASER`'s declaration
// (line 53), and a commented-out call that must never surface a lens.
const SOUNDS_FILE = 'src/sounds.ts'
const LITERAL_CALL_LINE = 48 // 0-indexed
const VARIABLE_CALL_LINE = 52 // 0-indexed
const LASER_DECL_LINE = 44 // 0-indexed — `const LASER: ZzFXParams = [...]`
const LITERAL_CALL_TEXT = 'zzfx(...[0.5, 0, 300, 0, 0.02, 0.05, 1])'
const LITERAL_CALL_CANONICAL = 'zzfx(0.5, 0, 300, 0, 0.02, 0.05, 1)'
const LASER_ARRAY_TEXT = '[0.6, 0, 1500, 0, 0.03, 0.05, 4, 2, 0, 0, 900, 0.03]'
const LASER_ARRAY_FREQ_1800 = '[0.6, 0, 1800, 0, 0.03, 0.05, 4, 2, 0, 0, 900, 0.03]'

async function readFile(
  evaluateInVSCode: <R, Arg = undefined>(
    fn: (vscodeModule: typeof import('vscode'), arg: Arg) => R | Promise<R>,
    arg?: Arg
  ) => Promise<R>,
  file: string
): Promise<string> {
  return evaluateInVSCode(
    async (vscode, arg) => {
      const [folder] = vscode.workspace.workspaceFolders ?? []
      const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
      const doc = await vscode.workspace.openTextDocument(uri)
      return doc.getText()
    },
    { file }
  )
}

test.describe('FL ZzFX Studio', () => {
  test('CodeLens provider surfaces exactly Play/Edit pairs for the two real call sites, distinguishing the variable case', async ({
    evaluateInVSCode,
  }) => {
    const titles = await evaluateInVSCode(
      async (vscode, arg) => {
        // Explicit activation rather than relying on onLanguage:* timing —
        // opening the document schedules activation but doesn't await its
        // completion, so a CodeLens query issued immediately after can
        // race a provider that isn't registered yet.
        const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
        if (ext && !ext.isActive) await ext.activate()

        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
        const doc = await vscode.workspace.openTextDocument(uri)
        await vscode.window.showTextDocument(doc)
        const lenses = (await vscode.commands.executeCommand('vscode.executeCodeLensProvider', uri, 100)) as {
          command?: { title: string }
        }[]
        return lenses.map((l) => l.command?.title ?? null)
      },
      { file: SOUNDS_FILE }
    )

    // Two findings (literal + named-const) x 2 lenses each. The
    // commented-out `zzfx(...WALL_HIT)` must contribute nothing, and the
    // named-const finding's Edit lens must read "(variable)" — proving
    // the sidecar's varRef resolution reaches the CodeLens title, not
    // just that some fixed number of lenses appeared.
    expect(titles.sort()).toEqual(['▶ Play', '▶ Play', '⚙ Edit', '⚙ Edit (variable)'].sort())
  })

  test('threeFlatland.audio.playAtCursor opens (or reuses) the real editor panel for the literal call under the cursor, with preserveFocus', async ({
    evaluateInVSCode,
    webviewFrame,
  }) => {
    await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
        if (ext && !ext.isActive) await ext.activate()

        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
        const doc = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(doc)
        editor.selection = new vscode.Selection(arg.line, 0, arg.line, 0)
        await vscode.commands.executeCommand('threeFlatland.audio.playAtCursor')
      },
      { file: SOUNDS_FILE, line: LITERAL_CALL_LINE }
    )

    // playAtCursor routes through host.ts's playInEditorPanel, which opens
    // the SAME real per-finding editor panel `openEditor` would (title
    // `ZzFX: sounds.ts:<1-indexed line>`) rather than a separate throwaway
    // player — proving the CodeLens-alone play route actually resolved
    // the real finding at the cursor and reached a live panel, not just
    // that "some" tab appeared.
    const frame = await webviewFrame(/^ZzFX: sounds\.ts:49$/)
    await expect(frame.locator('vscode-toolbar-container')).toBeVisible()
  })

  test('threeFlatland.audio.openEditor (no args, command palette form) opens the full editor for the named-const call under the cursor, resolving LASER to real params', async ({
    evaluateInVSCode,
    webviewFrame,
  }) => {
    await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
        if (ext && !ext.isActive) await ext.activate()

        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
        const doc = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(doc)
        editor.selection = new vscode.Selection(arg.line, 0, arg.line, 0)
        await vscode.commands.executeCommand('threeFlatland.audio.openEditor')
      },
      { file: SOUNDS_FILE, line: VARIABLE_CALL_LINE }
    )

    // host.ts titles the panel `ZzFX: <filename>:<1-indexed line>`.
    const frame = await webviewFrame(/^ZzFX: sounds\.ts:53$/)
    await expect(frame.locator('vscode-toolbar-container')).toBeVisible()

    // "resolving LASER to real params" isn't proven by the panel merely
    // opening — assert the actual loaded value against LASER's real
    // frequency (1500, index 2 of LASER_ARRAY_TEXT), a value nowhere near
    // the param's default (220) so this can't pass by coincidence. Proves
    // resolveParams.ts correctly parsed the (now Z7a-corrected)
    // value-only defRange rather than silently falling back to defaults.
    await expect(frame.getByLabel('Frequency value')).toHaveValue('1500')
  })

  test("Save writes the canonical params back into LASER's declaration, preserving the declarator's name/type/'=' — never touching the call site", async ({
    evaluateInVSCode,
    webviewFrame,
  }) => {
    const originalText = await readFile(evaluateInVSCode, SOUNDS_FILE)
    expect(originalText).toContain(`const LASER: ZzFXParams = ${LASER_ARRAY_TEXT}`)

    await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
        if (ext && !ext.isActive) await ext.activate()

        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
        const doc = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(doc)
        editor.selection = new vscode.Selection(arg.line, 0, arg.line, 0)
        await vscode.commands.executeCommand('threeFlatland.audio.openEditor')
      },
      { file: SOUNDS_FILE, line: VARIABLE_CALL_LINE }
    )

    const frame = await webviewFrame(/^ZzFX: sounds\.ts:53$/)
    await expect(frame.locator('vscode-toolbar-container')).toBeVisible()

    // Init landed: the field showing LASER's real 1500 proves `zzfx/init`
    // delivered findingId, i.e. Save is enabled — a click before that
    // silently no-ops on the (correctly) disabled button, leaving the
    // file untouched. Caught as a real under-load flake in a full-suite
    // run; same pre-init-race family as follow-up #19.
    await expect(frame.getByLabel('Frequency value')).toHaveValue('1500')

    // Change ONE param (frequency 1500 -> 1800) so the write-back is
    // provably real, not just a no-op round-trip that happens to
    // reproduce the original text byte-for-byte.
    await frame.getByLabel('Frequency value').fill('1800')
    // The fill's input event commits synchronously into session state and
    // flips `dirty`, which retitles Save — wait for that so the save
    // request provably snapshots the 1800.
    await expect(frame.locator('vscode-toolbar-button[title="Save (unsaved changes)"]')).toBeVisible()

    // Save is asynchronous (webview → host IPC → applyEdit). Await the causal
    // completion signal — data-save-generation ticks only after the host's
    // zzfx/save response resolves, which awaits applyEdit — before reading, so
    // we never race a bare read against the edit landing.
    const panel = frame.locator('[data-save-generation]')
    const gen = Number(await panel.getAttribute('data-save-generation'))
    await frame.locator('vscode-toolbar-button[title^="Save"]').click()
    await expect(panel).toHaveAttribute('data-save-generation', String(gen + 1))

    // Whole-file strict equality, computed the same way as the literal
    // write-back test: only LASER's array text should differ, and only
    // by the one changed value — "const LASER: ZzFXParams = " and every
    // other line (including the `zzfx(...LASER)` call site itself, which
    // this write-back must NEVER touch) stay byte-identical.
    const expectedText = originalText.replace(LASER_ARRAY_TEXT, LASER_ARRAY_FREQ_1800)
    const actualText = await readFile(evaluateInVSCode, SOUNDS_FILE)
    expect(actualText).toBe(expectedText)
    expect(actualText).toContain('zzfx(...LASER)')
  })

  test("Save refuses — loudly, without touching the file further — when LASER's initializer was edited to a non-array expression after the panel opened", async ({
    evaluateInVSCode,
    webviewFrame,
  }) => {
    await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
        if (ext && !ext.isActive) await ext.activate()

        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
        const doc = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(doc)
        editor.selection = new vscode.Selection(arg.line, 0, arg.line, 0)
        await vscode.commands.executeCommand('threeFlatland.audio.openEditor')
      },
      { file: SOUNDS_FILE, line: VARIABLE_CALL_LINE }
    )

    const frame = await webviewFrame(/^ZzFX: sounds\.ts:53$/)
    await expect(frame.locator('vscode-toolbar-container')).toBeVisible()
    // Init landed (field shows LASER's real value) ⇒ Save is enabled —
    // required before the click below can exercise the refusal path at
    // all rather than no-op on a still-disabled button.
    await expect(frame.getByLabel('Frequency value')).toHaveValue('1500')

    // Edit the DOCUMENT directly (not through the panel) — LASER's
    // initializer becomes a call expression, exactly the
    // "sidecar reports the range unvalidated" case
    // tools/codelens-service/CLAUDE.md's contract calls out. host.ts's
    // save-path revalidation (isNumberArrayLiteralText) is the only
    // thing standing between this and silently overwriting a function
    // call with a hardcoded array.
    await evaluateInVSCode(
      async (vscode, arg) => {
        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
        const doc = await vscode.workspace.openTextDocument(uri)
        const text = doc.getText()
        const start = text.indexOf(arg.oldArray)
        const edit = new vscode.WorkspaceEdit()
        const startPos = doc.positionAt(start)
        const endPos = doc.positionAt(start + arg.oldArray.length)
        edit.replace(uri, new vscode.Range(startPos, endPos), arg.newInitializer)
        await vscode.workspace.applyEdit(edit)
      },
      {
        file: SOUNDS_FILE,
        oldArray: LASER_ARRAY_TEXT,
        newInitializer: "getPreset('laser', 99999999999999999999999999999999)",
      }
    )

    await frame.locator('vscode-toolbar-button[title^="Save"]').click()
    await expect(frame.getByText(/not a plain array literal/)).toBeVisible()

    const text = await readFile(evaluateInVSCode, SOUNDS_FILE)
    // The direct-document edit survived (it happened outside the panel,
    // independent of the refused save) and the call site is untouched —
    // proving the refusal didn't also revert or otherwise mutate the file.
    expect(text).toContain("const LASER: ZzFXParams = getPreset('laser', 99999999999999999999999999999999)")
    expect(text).toContain('zzfx(...LASER)')
  })

  test("Save writes the canonical params back into the literal call site's argRange, byte-for-byte across the whole file", async ({
    evaluateInVSCode,
    webviewFrame,
  }) => {
    const originalText = await readFile(evaluateInVSCode, SOUNDS_FILE)
    expect(originalText).toContain(LITERAL_CALL_TEXT)

    await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
        if (ext && !ext.isActive) await ext.activate()

        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
        const doc = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(doc)
        editor.selection = new vscode.Selection(arg.line, 0, arg.line, 0)
        await vscode.commands.executeCommand('threeFlatland.audio.openEditor')
      },
      { file: SOUNDS_FILE, line: LITERAL_CALL_LINE }
    )

    const frame = await webviewFrame(/^ZzFX: sounds\.ts:49$/)
    await expect(frame.locator('vscode-toolbar-container')).toBeVisible()
    // Init landed (field shows the call's real 300) ⇒ Save is enabled.
    await expect(frame.getByLabel('Frequency value')).toHaveValue('300')

    // No slider changes — clicking Save with the panel's freshly-loaded,
    // unmodified params proves the write-back mechanism itself (argRange
    // replace + applyEdit) round-trips correctly for a real file, since
    // `toArgs(fromArgs(originalParams))` reproduces the original values
    // exactly for this call (its last value, shape=1, is non-default, so
    // nothing trims off the end).
    //
    // argRange spans the ENTIRE original arg list as written — including
    // the `...[...]` spread-array wrapper for this fixture line, per a
    // direct sidecar probe (argRange covers columns 5..39 of
    // `zzfx(...[0.5, 0, 300, 0, 0.02, 0.05, 1])`, i.e. `...[0.5, ..., 1]`).
    // host.ts's write-back always emits a plain comma list, so Save here
    // normalizes the call from spread-array to plain positional args —
    // functionally identical, and the expected/only sane behavior since
    // nothing specifies "preserve original calling-convention style."
    // Save is asynchronous (webview → host IPC → sidecar parse → applyEdit),
    // and Playwright's click() resolves on DOM dispatch, not on the save chain.
    // Await the causal completion signal — data-save-generation ticks only
    // after the host's zzfx/save response resolves, which awaits applyEdit —
    // before reading. A bare read here can observe the file before applyEdit
    // commits, which was exactly the intermittent "file unchanged after Save"
    // flake. This is a no-op-params save, so `dirty` never toggles; the
    // generation counter still ticks (any committed save counts), which is why
    // it — not the dirty dot — is the correct signal here.
    const panel = frame.locator('[data-save-generation]')
    const gen = Number(await panel.getAttribute('data-save-generation'))
    await frame.locator('vscode-toolbar-button[title^="Save"]').click()
    await expect(panel).toHaveAttribute('data-save-generation', String(gen + 1))

    // Whole-file strict equality against "the captured original, with ONLY the
    // known call-site substring replaced" — not just `toContain`. Anything the
    // write-back touched outside that exact substring (whitespace elsewhere, a
    // neighboring line, the comment above it) would make this fail, which a
    // `toContain` check on the new text alone could never catch.
    const expectedText = originalText.replace(LITERAL_CALL_TEXT, LITERAL_CALL_CANONICAL)
    expect(await readFile(evaluateInVSCode, SOUNDS_FILE)).toBe(expectedText)
  })

  test('Save fails safely — without corrupting the file — when the call has shifted position since the panel opened', async ({
    evaluateInVSCode,
    webviewFrame,
  }) => {
    await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
        if (ext && !ext.isActive) await ext.activate()

        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
        const doc = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(doc)
        editor.selection = new vscode.Selection(arg.line, 0, arg.line, 0)
        await vscode.commands.executeCommand('threeFlatland.audio.openEditor')
      },
      { file: SOUNDS_FILE, line: LITERAL_CALL_LINE }
    )

    const frame = await webviewFrame(/^ZzFX: sounds\.ts:49$/)
    await expect(frame.locator('vscode-toolbar-container')).toBeVisible()
    // Init landed (field shows the call's real 300) ⇒ Save is enabled.
    await expect(frame.getByLabel('Frequency value')).toHaveValue('300')

    // Shift the call's byte offset by inserting an unrelated line above
    // it, WITHOUT touching the call's own text. The sidecar's finding id
    // is fnv1a(kind, byte-range, params) — see
    // tools/codelens-service/sidecar/src/id.rs — so this genuinely
    // changes the id host.ts captured when the panel opened, even though
    // "the same call" is still right there, just moved. host.ts's
    // zzfx/save handler re-parses fresh text and re-locates by that exact
    // id before writing; when it can't find a match it must refuse and
    // error rather than guess a range. This is the test that proves that
    // refusal actually fires end-to-end, not just that the code exists.
    await evaluateInVSCode(
      async (vscode, arg) => {
        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
        const edit = new vscode.WorkspaceEdit()
        edit.insert(uri, new vscode.Position(0, 0), '// shifted\n')
        await vscode.workspace.applyEdit(edit)
      },
      { file: SOUNDS_FILE }
    )

    await frame.locator('vscode-toolbar-button[title^="Save"]').click()
    await expect(frame.getByText(/could not be found/)).toBeVisible()

    const text = await readFile(evaluateInVSCode, SOUNDS_FILE)
    // The inserted line survived AND the original call site is untouched
    // (still spread-array form, un-normalized) — proving the refused save
    // didn't partially apply or land on the wrong location.
    expect(text).toContain('// shifted')
    expect(text).toContain(LITERAL_CALL_TEXT)
  })

  test('waveform preview draws a real trace for the LASER finding', async ({ evaluateInVSCode, webviewFrame }) => {
    await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
        if (ext && !ext.isActive) await ext.activate()

        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
        const doc = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(doc)
        editor.selection = new vscode.Selection(arg.line, 0, arg.line, 0)
        await vscode.commands.executeCommand('threeFlatland.audio.openEditor')
      },
      { file: SOUNDS_FILE, line: VARIABLE_CALL_LINE }
    )

    const frame = await webviewFrame(/^ZzFX: sounds\.ts:53$/)
    const canvas = frame.locator('canvas[aria-label="Waveform preview"]')
    await expect(canvas).toBeVisible()

    // `data-waveform-peak` is written imperatively at the END of the draw
    // routine (WaveformPreview.tsx), so a nonzero value means real samples
    // were synthesized AND rendered — LASER's volume is 0.6, nowhere near
    // an all-defaults silent buffer. Chosen over comparing the canvas's
    // dataURL against a blank-canvas reference because the backing store
    // is sized in DEVICE pixels: the "blank" reference itself would vary
    // with the runner's DPR and window size, while this attribute poll is
    // deterministic and auto-retries across the ~100ms debounced
    // synth+draw window.
    await expect.poll(async () => Number(await canvas.getAttribute('data-waveform-peak'))).toBeGreaterThan(0)
  })

  test('header source link for a variable finding shows the variable name alone and clicking it reveals + focuses the declaration', async ({
    evaluateInVSCode,
    webviewFrame,
  }) => {
    await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
        if (ext && !ext.isActive) await ext.activate()

        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
        const doc = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(doc)
        editor.selection = new vscode.Selection(arg.line, 0, arg.line, 0)
        await vscode.commands.executeCommand('threeFlatland.audio.openEditor')
      },
      { file: SOUNDS_FILE, line: VARIABLE_CALL_LINE }
    )

    const frame = await webviewFrame(/^ZzFX: sounds\.ts:53$/)
    // Label is exactly the variable name — the location detail lives in
    // the tooltip (declaration's workspace-relative path:1-based-line),
    // because the panel tab already carries the call-site file:line and
    // the header must not duplicate it.
    const link = frame.getByRole('link', { name: 'LASER', exact: true })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('title', `${SOUNDS_FILE}:${LASER_DECL_LINE + 1}`)

    await link.click()

    // Assert on the SELECTED TEXT, not just a line number: the
    // panel-opening boilerplate above already parked an (empty) selection
    // in this file, so a location-only assertion could pass without the
    // click doing anything. Only revealSource's own initializer-range
    // selection can produce LASER's exact array text — and it must land
    // on the DECLARATION line, not the call line the panel was opened
    // from. `activeTextEditor` matching doubles as the focus assertion:
    // it is by definition the focused editor group's editor, which a
    // preserveFocus reveal would not have made this one.
    await expect
      .poll(() =>
        evaluateInVSCode(async (vscode) => {
          const editor = vscode.window.activeTextEditor
          if (!editor) return null
          return {
            file: editor.document.uri.path.split('/').pop(),
            line: editor.selection.start.line,
            selectedText: editor.document.getText(editor.selection),
          }
        })
      )
      .toEqual({ file: 'sounds.ts', line: LASER_DECL_LINE, selectedText: LASER_ARRAY_TEXT })
  })

  test('header source link for a literal finding shows file:line and clicking it reveals + focuses the call site', async ({
    evaluateInVSCode,
    webviewFrame,
  }) => {
    await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
        if (ext && !ext.isActive) await ext.activate()

        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
        const doc = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(doc)
        editor.selection = new vscode.Selection(arg.line, 0, arg.line, 0)
        await vscode.commands.executeCommand('threeFlatland.audio.openEditor')
      },
      { file: SOUNDS_FILE, line: LITERAL_CALL_LINE }
    )

    const frame = await webviewFrame(/^ZzFX: sounds\.ts:49$/)
    // A literal call has no better name than its location — file:line
    // (1-based) is the label, full workspace-relative path the tooltip.
    const link = frame.getByRole('link', { name: 'sounds.ts:49' })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('title', SOUNDS_FILE)

    await link.click()

    // Same selected-text rigor as the variable case: only revealSource's
    // full-call-range selection can produce the exact call text.
    await expect
      .poll(() =>
        evaluateInVSCode(async (vscode) => {
          const editor = vscode.window.activeTextEditor
          if (!editor) return null
          return {
            file: editor.document.uri.path.split('/').pop(),
            line: editor.selection.start.line,
            selectedText: editor.document.getText(editor.selection),
          }
        })
      )
      .toEqual({ file: 'sounds.ts', line: LITERAL_CALL_LINE, selectedText: LITERAL_CALL_TEXT })
  })

  test('Save fails safely — file byte-identical — when the call has been deleted entirely since the panel opened', async ({
    evaluateInVSCode,
    webviewFrame,
  }) => {
    const originalText = await readFile(evaluateInVSCode, SOUNDS_FILE)

    await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
        if (ext && !ext.isActive) await ext.activate()

        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
        const doc = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(doc)
        editor.selection = new vscode.Selection(arg.line, 0, arg.line, 0)
        await vscode.commands.executeCommand('threeFlatland.audio.openEditor')
      },
      { file: SOUNDS_FILE, line: LITERAL_CALL_LINE }
    )

    const frame = await webviewFrame(/^ZzFX: sounds\.ts:49$/)
    await expect(frame.locator('vscode-toolbar-container')).toBeVisible()
    // Init landed (field shows the call's real 300) ⇒ Save is enabled.
    await expect(frame.getByLabel('Frequency value')).toHaveValue('300')

    // Delete the call's entire line — there is no "new position" to
    // relocate to; re-parsing the current text simply can't produce a
    // finding with the id host.ts captured at open time. This is the
    // cleanest, least ambiguous case for the guard: any matching strategy
    // (exact id, or a looser kind+params fallback) must fail here, since
    // the call plain doesn't exist anymore.
    await evaluateInVSCode(
      async (vscode, arg) => {
        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
        const doc = await vscode.workspace.openTextDocument(uri)
        const edit = new vscode.WorkspaceEdit()
        const line = doc.lineAt(arg.line)
        edit.delete(uri, line.rangeIncludingLineBreak)
        await vscode.workspace.applyEdit(edit)
      },
      { file: SOUNDS_FILE, line: LITERAL_CALL_LINE }
    )

    await frame.locator('vscode-toolbar-button[title^="Save"]').click()
    await expect(frame.getByText(/could not be found/)).toBeVisible()

    const text = await readFile(evaluateInVSCode, SOUNDS_FILE)
    // File is exactly "the original minus the deleted line" — the refused
    // save left the (already-applied, independent) deletion alone and
    // wrote nothing else.
    const expectedText = originalText
      .split('\n')
      .filter((line) => line !== LITERAL_CALL_TEXT)
      .join('\n')
    expect(text).toBe(expectedText)
  })

  // ── AI candidate history (Z14) ────────────────────────────────────────
  //
  // These two tests are deliberately LAST in the file: the history store
  // lives under globalStorageUri, which persists across tests within this
  // spec file's shared VS Code window (resetWindowWorkspace only resets
  // the workspace folder) — seeding here must not be able to leak into
  // the tests above.
  //
  // Seeding goes through the ExtensionApi seam (extension/index.ts) —
  // the SAME singleton store instance the panel reads, so "the seeded
  // batch renders" proves the real init path end-to-end. The
  // generate→persist route itself is NOT driven here (disclosed seam:
  // this test host has no vscode.lm model, so generate degrades to the
  // preset fallback, which is by design never persisted) — that branch
  // is covered by history/core.test.ts's batchFromOutcome + append tests.

  test('seeded AI history renders for the LASER finding, and a deleted candidate stays gone across panel close + reopen', async ({
    evaluateInVSCode,
    webviewFrame,
  }) => {
    await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
        if (ext && !ext.isActive) await ext.activate()
        const api = ext!.exports as {
          zzfxHistory: {
            keyFor: (source: { uri: string; line: number; varRef?: { name: string; defUri?: string } }) => string
            append: (key: string, batch: unknown) => Promise<unknown>
          }
        }
        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file).toString()
        // LASER is a variable finding — the key is defUri + name, exactly
        // what host.ts computes from the sidecar's varRef (defUri equals
        // the parse uri for a same-file declaration).
        const key = api.zzfxHistory.keyFor({
          uri,
          line: arg.callLine,
          varRef: { name: 'LASER', defUri: uri },
        })
        await api.zzfxHistory.append(key, {
          ts: 1_000_000,
          category: 'Laser',
          styles: ['punchy'],
          source: 'lm',
          candidates: [
            { label: 'Seeded Zap A', params: [0.6, 0, 900, 0, 0.03, 0.05, 4, 2], rationale: 'a' },
            { label: 'Seeded Zap B', params: [0.6, 0, 1400, 0, 0.03, 0.05, 4, 2], rationale: 'b' },
          ],
        })
      },
      { file: SOUNDS_FILE, callLine: VARIABLE_CALL_LINE }
    )

    await evaluateInVSCode(
      async (vscode, arg) => {
        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
        const doc = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(doc)
        editor.selection = new vscode.Selection(arg.line, 0, arg.line, 0)
        await vscode.commands.executeCommand('threeFlatland.audio.openEditor')
      },
      { file: SOUNDS_FILE, line: VARIABLE_CALL_LINE }
    )

    const frame = await webviewFrame(/^ZzFX: sounds\.ts:53$/)
    await expect(frame.getByText('Seeded Zap A')).toBeVisible()
    await expect(frame.getByText('Seeded Zap B')).toBeVisible()

    // Per-candidate delete — the quiet trash button titled with the label.
    await frame.locator('vscode-toolbar-button[title=\'Delete "Seeded Zap A"\']').click()
    await expect(frame.getByText('Seeded Zap A')).toHaveCount(0)
    await expect(frame.getByText('Seeded Zap B')).toBeVisible()

    // Kill the webview entirely (retainContextWhenHidden is false and the
    // panel disposes on close) and reopen — the surviving candidate must
    // come back from HOST storage, the deleted one must not.
    await evaluateInVSCode(async (vscode) => {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    })
    await evaluateInVSCode(
      async (vscode, arg) => {
        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
        const doc = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(doc)
        editor.selection = new vscode.Selection(arg.line, 0, arg.line, 0)
        await vscode.commands.executeCommand('threeFlatland.audio.openEditor')
      },
      { file: SOUNDS_FILE, line: VARIABLE_CALL_LINE }
    )
    const reopened = await webviewFrame(/^ZzFX: sounds\.ts:53$/)
    await expect(reopened.getByText('Seeded Zap B')).toBeVisible()
    await expect(reopened.getByText('Seeded Zap A')).toHaveCount(0)
  })

  test('clear-all requires the two-step confirm, empties the history, and it stays empty after reopen', async ({
    evaluateInVSCode,
    webviewFrame,
  }) => {
    // Seed a fresh batch. NOTE: 'Seeded Zap B' from the previous test may
    // still be in the store (globalStorage persists across tests in this
    // window) — that's fine, clear-all must wipe it too, which makes the
    // final emptiness assertion a stronger proof.
    await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find((e) => e.packageJSON.name === '@three-flatland/vscode')
        if (ext && !ext.isActive) await ext.activate()
        const api = ext!.exports as {
          zzfxHistory: {
            keyFor: (source: { uri: string; line: number; varRef?: { name: string; defUri?: string } }) => string
            append: (key: string, batch: unknown) => Promise<unknown>
          }
        }
        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file).toString()
        const key = api.zzfxHistory.keyFor({
          uri,
          line: arg.callLine,
          varRef: { name: 'LASER', defUri: uri },
        })
        await api.zzfxHistory.append(key, {
          ts: 2_000_000,
          category: 'Laser',
          styles: [],
          source: 'cache',
          candidates: [{ label: 'Seeded Zap C', params: [0.6, 0, 700, 0, 0.03, 0.05, 4, 2], rationale: 'c' }],
        })
      },
      { file: SOUNDS_FILE, callLine: VARIABLE_CALL_LINE }
    )

    await evaluateInVSCode(
      async (vscode, arg) => {
        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
        const doc = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(doc)
        editor.selection = new vscode.Selection(arg.line, 0, arg.line, 0)
        await vscode.commands.executeCommand('threeFlatland.audio.openEditor')
      },
      { file: SOUNDS_FILE, line: VARIABLE_CALL_LINE }
    )

    const frame = await webviewFrame(/^ZzFX: sounds\.ts:53$/)
    await expect(frame.getByText('Seeded Zap C')).toBeVisible()

    // First click only ARMS the button (title flips to the explicit
    // confirm wording); the history must still be intact.
    await frame.locator('vscode-toolbar-button[title="Clear history for this sound"]').click()
    const confirm = frame.locator('vscode-toolbar-button[title="Click again to clear all history for this sound"]')
    await expect(confirm).toBeVisible()
    await expect(frame.getByText('Seeded Zap C')).toBeVisible()

    await confirm.click()
    await expect(frame.getByText('Seeded Zap C')).toHaveCount(0)

    // Survives the webview's death: reopen and the history is still empty.
    await evaluateInVSCode(async (vscode) => {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    })
    await evaluateInVSCode(
      async (vscode, arg) => {
        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
        const doc = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(doc)
        editor.selection = new vscode.Selection(arg.line, 0, arg.line, 0)
        await vscode.commands.executeCommand('threeFlatland.audio.openEditor')
      },
      { file: SOUNDS_FILE, line: VARIABLE_CALL_LINE }
    )
    const reopened = await webviewFrame(/^ZzFX: sounds\.ts:53$/)
    // Init landed (real param value) BEFORE asserting absence — otherwise
    // an empty pre-init panel would vacuously pass.
    await expect(reopened.getByLabel('Frequency value')).toHaveValue('1500')
    await expect(reopened.getByText('Seeded Zap C')).toHaveCount(0)
    await expect(reopened.getByText('Seeded Zap B')).toHaveCount(0)
  })
})
