import assert from 'node:assert/strict'
import { readdir, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { setupFixtures } from '../src/setup.ts'

test('generates separate editor and IDE fixtures', async () => {
  const output = resolve('.tmp', 'setup-test-static')
  try {
    const manifest = await setupFixtures(output)
    const rendererPackage = JSON.parse(
      await readFile(resolve('node_modules', '@lvce-editor', 'renderer-process', 'package.json'), 'utf8'),
    ) as { readonly version: string }
    const fixture = manifest.editors.find((editor) => editor.id === 'lvce-editor-minimal')
    assert.deepEqual(fixture, {
      id: 'lvce-editor-minimal',
      kind: 'static',
      label: 'LVCE Editor Only',
      path: 'lvce-editor-minimal/',
      version: rendererPackage.version,
    })

    const files = await readdir(join(output, 'lvce-editor-minimal'))
    assert.deepEqual(
      files.toSorted((left, right) => left.localeCompare(right)),
      [
        'editorWorkerMain.js',
        'index.css',
        'index.html',
        'index.js',
        'syntaxHighlightingWorkerMain.js',
        'tokenizeHtml.js',
      ],
    )
    assert.equal(
      files.some((file) => file.toLowerCase().includes('rendererworker')),
      false,
    )

    const html = await readFile(join(output, 'lvce-editor-minimal', 'index.html'), 'utf8')
    assert.match(html, /"editorWorkerUrl":"\.\/editorWorkerMain\.js"/)
    assert.match(html, /"syntaxHighlightingWorkerUrl":"\.\/syntaxHighlightingWorkerMain\.js"/)
    assert.doesNotMatch(html, /rendererWorkerUrl/)

    const vscodeFixture = manifest.ides.find((ide) => ide.id === 'vscode')
    assert.deepEqual(vscodeFixture, {
      id: 'vscode',
      kind: 'static',
      label: 'VS Code',
      path: 'vscode-ide/',
      version: '1.108.2',
    })
    assert.deepEqual(
      manifest.ides.map((ide) => ide.id),
      ['lvce-editor', 'vscode'],
    )
    const vscodeHtml = await readFile(join(output, 'vscode-ide', 'index.html'), 'utf8')
    assert.match(vscodeHtml, /workbench\.web\.main\.internal\.js/)
    assert.match(vscodeHtml, /benchmark\.code-workspace/)
    assert.equal(await readFile(join(output, 'vscode', 'nls.messages.js'), 'utf8').then(Boolean), true)
  } finally {
    await rm(output, { force: true, recursive: true })
  }
})
