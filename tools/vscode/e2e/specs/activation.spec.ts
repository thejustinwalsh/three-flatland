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
})
