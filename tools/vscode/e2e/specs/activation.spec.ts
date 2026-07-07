import { expect, test } from '../fixtures'

test.describe('extension activation', () => {
  test('activates and registers the FL commands', async ({ evaluateInVSCode }) => {
    const result = await evaluateInVSCode(async (vscode) => {
      const ext = vscode.extensions.all.find((e) => e.packageJSON.publisher === 'three-flatland')
      if (ext && !ext.isActive) await ext.activate()
      const commands = await vscode.commands.getCommands(true)
      return {
        found: !!ext,
        active: ext?.isActive ?? false,
        hasAtlasCommand: commands.includes('threeFlatland.atlas.openEditor'),
        hasEncodeCommand: commands.includes('threeFlatland.encode.open'),
        hasMergeCommand: commands.includes('threeFlatland.merge.openMergeTool'),
      }
    })

    expect(result.found, 'extension with publisher "three-flatland" should be present').toBe(true)
    expect(result.active, 'extension should be active after ext.activate()').toBe(true)
    expect(result.hasAtlasCommand).toBe(true)
    expect(result.hasEncodeCommand).toBe(true)
    expect(result.hasMergeCommand).toBe(true)
  })

  test('workspace folder resolves to the per-test fixture copy', async ({
    evaluateInVSCode,
    baseDir,
  }) => {
    const workspacePath = await evaluateInVSCode((vscode) => {
      return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null
    })

    expect(workspacePath).toBe(baseDir)
  })

  // These two tests are ordered on purpose (workers: 1, fullyParallel:
  // false guarantee it) — together they prove the window-reuse-per-file
  // fixture (`_sharedWindow` in ../fixtures.ts) actually resets workspace
  // content between tests that share one VS Code window, not just that it
  // reuses the window. Without this pair, a broken reset could pass every
  // spec that only *reads* workspace state and never *writes* it.
  test('writes a marker file for the next test to check', async ({ evaluateInVSCode }) => {
    await evaluateInVSCode(async (vscode) => {
      const folder = vscode.workspace.workspaceFolders![0]!
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(folder.uri, 'e2e-reset-marker.txt'),
        new Uint8Array()
      )
    })
  })

  test('the previous test marker did not survive the window-reuse reset', async ({
    evaluateInVSCode,
  }) => {
    const markerExists = await evaluateInVSCode(async (vscode) => {
      const folder = vscode.workspace.workspaceFolders![0]!
      try {
        await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, 'e2e-reset-marker.txt'))
        return true
      } catch {
        return false
      }
    })

    expect(markerExists).toBe(false)
  })
})
