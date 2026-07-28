import assert from 'node:assert/strict'
import { readdir, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { setupFixtures } from '../src/setup.ts'

test('generates an editor-only LVCE fixture without a renderer worker', async () => {
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
      label: 'LVCE Editor (Editor Only)',
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
  } finally {
    await rm(output, { force: true, recursive: true })
  }
})
