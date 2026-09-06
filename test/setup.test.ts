import assert from 'node:assert/strict'
import { readdir, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { setupFixtures } from '../src/setup.ts'

const assertMinified = async (path: string): Promise<void> => {
  const source = await readFile(path, 'utf8')
  assert.equal(source.trim().split('\n').length, 1, `${path} should contain one minified line`)
}

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

    const singleThreadFixture = manifest.editors.find((editor) => editor.id === 'lvce-editor-single-thread')
    assert.deepEqual(singleThreadFixture, {
      id: 'lvce-editor-single-thread',
      kind: 'static',
      label: 'LVCE Editor Single Thread',
      path: 'lvce-editor-single-thread/',
      version: rendererPackage.version,
    })
    const singleThreadFiles = await readdir(join(output, 'lvce-editor-single-thread'))
    assert.deepEqual(singleThreadFiles.toSorted((left, right) => left.localeCompare(right)), [
      'index.css',
      'index.html',
      'index.js',
    ])
    const singleThreadHtml = await readFile(join(output, 'lvce-editor-single-thread', 'index.html'), 'utf8')
    assert.match(singleThreadHtml, /"tokenizePath":"embedded:html"/)
    assert.doesNotMatch(singleThreadHtml, /WorkerUrl/)
    const singleThreadBundle = await readFile(join(output, 'lvce-editor-single-thread', 'index.js'), 'utf8')
    assert.match(singleThreadBundle, /Direct LVCE command not found/)
    assert.match(singleThreadBundle, /embedded:html/)

    await assertMinified(join(output, 'codemirror', 'index.js'))
    await assertMinified(join(output, 'monaco-editor', 'index.js'))
    await assertMinified(join(output, 'lvce-editor-minimal', 'index.js'))
    await assertMinified(join(output, 'lvce-editor-minimal', 'editorWorkerMain.js'))
    await assertMinified(join(output, 'lvce-editor-minimal', 'syntaxHighlightingWorkerMain.js'))
    await assertMinified(join(output, 'lvce-editor-minimal', 'tokenizeHtml.js'))
    await assertMinified(join(output, 'lvce-editor-single-thread', 'index.js'))

    const vscodeFixture = manifest.ides.find((ide) => ide.id === 'vscode')
    assert.deepEqual(vscodeFixture, {
      id: 'vscode',
      kind: 'static',
      label: 'VS Code',
      path: 'vscode-ide/',
      version: '1.132.1',
    })
    assert.deepEqual(
      manifest.editors.map((editor) => editor.id),
      ['lvce-editor-minimal', 'lvce-editor-single-thread', 'monaco-editor', 'codemirror'],
    )
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

test('bundles fixtures sequentially', async () => {
  const setupSource = await readFile(resolve('src', 'setup.ts'), 'utf8')
  const singleThreadSource = await readFile(resolve('src', 'lvceSingleThreadBundle.ts'), 'utf8')
  assert.doesNotMatch(setupSource, /Promise\.all/)
  assert.doesNotMatch(singleThreadSource, /Promise\.all/)
})
