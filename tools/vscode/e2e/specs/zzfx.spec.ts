import { expect, test } from '../fixtures'

// See e2e/fixtures/README.md and src/sounds.ts's own header comment for
// what each line is testing: a literal spread-array call (line 49, one-
// indexed), a named-const spread call resolving `LASER`'s declaration
// (line 53), and a commented-out call that must never surface a lens.
const SOUNDS_FILE = 'src/sounds.ts'
const LITERAL_CALL_LINE = 48 // 0-indexed
const VARIABLE_CALL_LINE = 52 // 0-indexed
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
        const ext = vscode.extensions.all.find(
          (e) => e.packageJSON.name === '@three-flatland/vscode'
        )
        if (ext && !ext.isActive) await ext.activate()

        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
        const doc = await vscode.workspace.openTextDocument(uri)
        await vscode.window.showTextDocument(doc)
        const lenses = (await vscode.commands.executeCommand(
          'vscode.executeCodeLensProvider',
          uri,
          100
        )) as { command?: { title: string } }[]
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

  test('threeFlatland.zzfx.playAtCursor opens (or reuses) the real editor panel for the literal call under the cursor, with preserveFocus', async ({
    evaluateInVSCode,
    webviewFrame,
  }) => {
    await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find(
          (e) => e.packageJSON.name === '@three-flatland/vscode'
        )
        if (ext && !ext.isActive) await ext.activate()

        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
        const doc = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(doc)
        editor.selection = new vscode.Selection(arg.line, 0, arg.line, 0)
        await vscode.commands.executeCommand('threeFlatland.zzfx.playAtCursor')
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

  test('threeFlatland.zzfx.openEditor (no args, command palette form) opens the full editor for the named-const call under the cursor, resolving LASER to real params', async ({
    evaluateInVSCode,
    webviewFrame,
  }) => {
    await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find(
          (e) => e.packageJSON.name === '@three-flatland/vscode'
        )
        if (ext && !ext.isActive) await ext.activate()

        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
        const doc = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(doc)
        editor.selection = new vscode.Selection(arg.line, 0, arg.line, 0)
        await vscode.commands.executeCommand('threeFlatland.zzfx.openEditor')
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
        const ext = vscode.extensions.all.find(
          (e) => e.packageJSON.name === '@three-flatland/vscode'
        )
        if (ext && !ext.isActive) await ext.activate()

        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
        const doc = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(doc)
        editor.selection = new vscode.Selection(arg.line, 0, arg.line, 0)
        await vscode.commands.executeCommand('threeFlatland.zzfx.openEditor')
      },
      { file: SOUNDS_FILE, line: VARIABLE_CALL_LINE }
    )

    const frame = await webviewFrame(/^ZzFX: sounds\.ts:53$/)
    await expect(frame.locator('vscode-toolbar-container')).toBeVisible()

    // Change ONE param (frequency 1500 -> 1800) so the write-back is
    // provably real, not just a no-op round-trip that happens to
    // reproduce the original text byte-for-byte.
    await frame.getByLabel('Frequency value').fill('1800')
    await frame.locator('vscode-toolbar-button[title^="Save"]').click()

    const actualText = await readFile(evaluateInVSCode, SOUNDS_FILE)

    // Whole-file strict equality, computed the same way as the literal
    // write-back test: only LASER's array text should differ, and only
    // by the one changed value — "const LASER: ZzFXParams = " and every
    // other line (including the `zzfx(...LASER)` call site itself, which
    // this write-back must NEVER touch) stay byte-identical.
    const expectedText = originalText.replace(LASER_ARRAY_TEXT, LASER_ARRAY_FREQ_1800)
    expect(actualText).toBe(expectedText)
    expect(actualText).toContain('zzfx(...LASER)')
  })

  test("Save refuses — loudly, without touching the file further — when LASER's initializer was edited to a non-array expression after the panel opened", async ({
    evaluateInVSCode,
    webviewFrame,
  }) => {
    await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find(
          (e) => e.packageJSON.name === '@three-flatland/vscode'
        )
        if (ext && !ext.isActive) await ext.activate()

        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
        const doc = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(doc)
        editor.selection = new vscode.Selection(arg.line, 0, arg.line, 0)
        await vscode.commands.executeCommand('threeFlatland.zzfx.openEditor')
      },
      { file: SOUNDS_FILE, line: VARIABLE_CALL_LINE }
    )

    const frame = await webviewFrame(/^ZzFX: sounds\.ts:53$/)
    await expect(frame.locator('vscode-toolbar-container')).toBeVisible()

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
    expect(text).toContain(
      "const LASER: ZzFXParams = getPreset('laser', 99999999999999999999999999999999)"
    )
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
        const ext = vscode.extensions.all.find(
          (e) => e.packageJSON.name === '@three-flatland/vscode'
        )
        if (ext && !ext.isActive) await ext.activate()

        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
        const doc = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(doc)
        editor.selection = new vscode.Selection(arg.line, 0, arg.line, 0)
        await vscode.commands.executeCommand('threeFlatland.zzfx.openEditor')
      },
      { file: SOUNDS_FILE, line: LITERAL_CALL_LINE }
    )

    const frame = await webviewFrame(/^ZzFX: sounds\.ts:49$/)
    await expect(frame.locator('vscode-toolbar-container')).toBeVisible()

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
    await frame.locator('vscode-toolbar-button[title^="Save"]').click()

    const actualText = await readFile(evaluateInVSCode, SOUNDS_FILE)

    // Whole-file strict equality against "the captured original, with
    // ONLY the known call-site substring replaced" — not just
    // `toContain`. Anything the write-back touched outside that exact
    // substring (whitespace elsewhere, a neighboring line, the comment
    // above it) would make this fail, which a `toContain` check on the
    // new text alone could never catch.
    const expectedText = originalText.replace(LITERAL_CALL_TEXT, LITERAL_CALL_CANONICAL)
    expect(actualText).toBe(expectedText)
  })

  test('Save fails safely — without corrupting the file — when the call has shifted position since the panel opened', async ({
    evaluateInVSCode,
    webviewFrame,
  }) => {
    await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find(
          (e) => e.packageJSON.name === '@three-flatland/vscode'
        )
        if (ext && !ext.isActive) await ext.activate()

        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
        const doc = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(doc)
        editor.selection = new vscode.Selection(arg.line, 0, arg.line, 0)
        await vscode.commands.executeCommand('threeFlatland.zzfx.openEditor')
      },
      { file: SOUNDS_FILE, line: LITERAL_CALL_LINE }
    )

    const frame = await webviewFrame(/^ZzFX: sounds\.ts:49$/)
    await expect(frame.locator('vscode-toolbar-container')).toBeVisible()

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

  test('Save fails safely — file byte-identical — when the call has been deleted entirely since the panel opened', async ({
    evaluateInVSCode,
    webviewFrame,
  }) => {
    const originalText = await readFile(evaluateInVSCode, SOUNDS_FILE)

    await evaluateInVSCode(
      async (vscode, arg) => {
        const ext = vscode.extensions.all.find(
          (e) => e.packageJSON.name === '@three-flatland/vscode'
        )
        if (ext && !ext.isActive) await ext.activate()

        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
        const doc = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(doc)
        editor.selection = new vscode.Selection(arg.line, 0, arg.line, 0)
        await vscode.commands.executeCommand('threeFlatland.zzfx.openEditor')
      },
      { file: SOUNDS_FILE, line: LITERAL_CALL_LINE }
    )

    const frame = await webviewFrame(/^ZzFX: sounds\.ts:49$/)
    await expect(frame.locator('vscode-toolbar-container')).toBeVisible()

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
})
