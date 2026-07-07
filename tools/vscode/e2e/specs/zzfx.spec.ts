import { expect, test } from '../fixtures'

// See e2e/fixtures/README.md and src/sounds.ts's own header comment for
// what each line is testing: a literal spread-array call (line 49, one-
// indexed), a named-const spread call resolving `LASER`'s declaration
// (line 53), and a commented-out call that must never surface a lens.
const SOUNDS_FILE = 'src/sounds.ts'
const LITERAL_CALL_LINE = 48 // 0-indexed
const VARIABLE_CALL_LINE = 52 // 0-indexed

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

  test('threeFlatland.zzfx.playAtCursor opens the player panel for the literal call under the cursor', async ({
    evaluateInVSCode,
    workbox,
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

    await expect(workbox.getByRole('tab', { name: 'FL ZzFX Player' })).toBeVisible()
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
  })

  test("Save writes the canonical params back into the literal call site's argRange", async ({
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
    await frame.locator('vscode-toolbar-button[title="Save"]').click()

    const text = await evaluateInVSCode(
      async (vscode, arg) => {
        const [folder] = vscode.workspace.workspaceFolders ?? []
        const uri = vscode.Uri.joinPath(folder!.uri, arg.file)
        const doc = await vscode.workspace.openTextDocument(uri)
        return doc.getText()
      },
      { file: SOUNDS_FILE }
    )

    expect(text).toContain('zzfx(0.5, 0, 300, 0, 0.02, 0.05, 1)')
  })
})
