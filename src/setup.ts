import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { renderDocument } from '../fixtures/renderDocument.ts'
import { editorLabels } from './editors.ts'
import { ideLabels } from './ides.ts'
import type { EditorFixture, FixtureManifest } from './types.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultOutput = join(root, '.tmp', 'static')

const readPackageVersion = async (packageName: string): Promise<string> => {
  const packageJsonPath = join(root, 'node_modules', packageName, 'package.json')
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as { readonly version?: string }
  if (!packageJson.version) {
    throw new Error(`No version found in ${packageJsonPath}`)
  }
  return packageJson.version
}

const readTextVersion = async (packageName: string, fileName: string): Promise<string> => {
  return (await readFile(join(root, 'node_modules', packageName, fileName), 'utf8')).trim()
}

const assertSafeOutput = (output: string): void => {
  const temporaryRoot = join(root, '.tmp')
  const relativePath = relative(temporaryRoot, output)
  if (!relativePath || relativePath.startsWith('..') || relativePath.includes('/../')) {
    throw new Error(`Setup output must be a child of ${temporaryRoot}`)
  }
}

const writeHtml = async (output: string, label: string): Promise<void> => {
  const template = await readFile(join(root, 'fixtures', 'index.html'), 'utf8')
  await writeFile(join(output, 'index.html'), template.split('EDITOR_NAME').join(label))
}

const getLvceAssetDirectory = async (): Promise<string> => {
  const staticRoot = join(root, 'node_modules', '@lvce-editor', 'static-server', 'static')
  const indexHtml = await readFile(join(staticRoot, 'index.html'), 'utf8')
  const match = /href="\/([^/]+)\/css\/App\.css"/.exec(indexHtml)
  if (!match?.[1]) {
    throw new Error('Could not resolve the LVCE static asset directory')
  }
  return join(staticRoot, match[1])
}

const bundleMinimalLvceEditor = async (outputRoot: string): Promise<void> => {
  const output = join(outputRoot, 'lvce-editor-minimal')
  const rendererProcessRoot = join(root, 'node_modules', '@lvce-editor', 'renderer-process', 'dist')
  const editorWorkerRoot = join(root, 'node_modules', '@lvce-editor', 'editor-worker', 'dist')
  const syntaxHighlightingWorkerRoot = join(root, 'node_modules', '@lvce-editor', 'syntax-highlighting-worker', 'dist')
  const lvceAssetDirectory = await getLvceAssetDirectory()
  await mkdir(output, { recursive: true })
  await Promise.all([
    cp(join(rendererProcessRoot, 'editorOnly.css'), join(output, 'index.css')),
    cp(join(rendererProcessRoot, 'editorOnlyRendererProcessMain.js'), join(output, 'index.js')),
    cp(join(editorWorkerRoot, 'editorWorkerMain.js'), join(output, 'editorWorkerMain.js')),
    cp(
      join(syntaxHighlightingWorkerRoot, 'syntaxHighlightingWorkerMain.js'),
      join(output, 'syntaxHighlightingWorkerMain.js'),
    ),
    cp(
      join(lvceAssetDirectory, 'extensions', 'builtin.language-basics-html', 'src', 'tokenizeHtml.js'),
      join(output, 'tokenizeHtml.js'),
    ),
  ])
  const config = {
    editorOnly: {
      content: renderDocument,
      languageId: 'html',
      tokenizePath: './tokenizeHtml.js',
      uri: 'file:///benchmark.html',
    },
    editorWorkerUrl: './editorWorkerMain.js',
    syntaxHighlightingWorkerUrl: './syntaxHighlightingWorkerMain.js',
  }
  const serializedConfig = JSON.stringify(config).replaceAll('<', '\\u003c')
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${editorLabels['lvce-editor-minimal']} typing benchmark</title>
    <link rel="stylesheet" href="./index.css" />
    <script id="Config" type="application/json">${serializedConfig}</script>
  </head>
  <body>
    <script type="module" src="./index.js"></script>
  </body>
</html>
`
  await writeFile(join(output, 'index.html'), html)
}

const bundleVscode = async (outputRoot: string): Promise<void> => {
  const packageRoot = join(root, 'node_modules', '@github1s', 'vscode-web')
  const output = join(outputRoot, 'vscode-ide')
  await mkdir(output, { recursive: true })
  await Promise.all([
    cp(join(packageRoot, 'dependencies'), join(outputRoot, 'dependencies'), { recursive: true }),
    cp(join(packageRoot, 'extensions'), join(outputRoot, 'extensions'), { recursive: true }),
    cp(join(packageRoot, 'nls'), join(outputRoot, 'nls'), { recursive: true }),
    cp(join(packageRoot, 'vscode'), join(outputRoot, 'vscode'), { recursive: true }),
  ])
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VS Code startup benchmark</title>
    <link rel="stylesheet" href="/vscode/vs/workbench/workbench.web.main.css" />
  </head>
  <body>
    <script src="/vscode/nls.messages.js"></script>
    <script>
      globalThis._VSCODE_FILE_ROOT = new URL('/vscode/', window.location.origin).toString()
    </script>
    <script type="module">
      import { create, URI } from '/vscode/vs/workbench/workbench.web.main.internal.js'
      create(document.body, {
        webviewEndpoint: '/vscode/vs/workbench/contrib/webview/browser/pre',
        workspaceProvider: {
          workspace: { workspaceUri: URI.from({ scheme: 'tmp', path: '/benchmark.code-workspace' }) },
        },
      })
    </script>
  </body>
</html>
`
  await writeFile(join(output, 'index.html'), html)
}

const bundleEditor = async (id: 'monaco-editor' | 'codemirror', sourceDirectory: 'monaco' | 'codemirror', outputRoot: string): Promise<void> => {
  const output = join(outputRoot, id)
  await mkdir(output, { recursive: true })
  await build({
    bundle: true,
    entryPoints: [join(root, 'fixtures', sourceDirectory, 'index.ts')],
    format: 'esm',
    legalComments: 'none',
    minify: true,
    outfile: join(output, 'index.js'),
    platform: 'browser',
    target: ['chrome120'],
  })
  await writeHtml(output, editorLabels[id])
}

export const setupFixtures = async (output = defaultOutput): Promise<FixtureManifest> => {
  const resolvedOutput = resolve(output)
  assertSafeOutput(resolvedOutput)
  await rm(resolvedOutput, { force: true, recursive: true })
  await mkdir(resolvedOutput, { recursive: true })

  await Promise.all([
    bundleEditor('monaco-editor', 'monaco', resolvedOutput),
    bundleEditor('codemirror', 'codemirror', resolvedOutput),
    bundleMinimalLvceEditor(resolvedOutput),
    bundleVscode(resolvedOutput),
    cp(join(root, 'node_modules', '@lvce-editor', 'static-server', 'static'), join(resolvedOutput, 'lvce-editor'), { recursive: true }),
  ])
  const editors: readonly EditorFixture[] = [
    {
      id: 'lvce-editor-minimal',
      label: editorLabels['lvce-editor-minimal'],
      version: await readPackageVersion('@lvce-editor/renderer-process'),
      kind: 'static',
      path: 'lvce-editor-minimal/',
    },
    {
      id: 'monaco-editor',
      label: editorLabels['monaco-editor'],
      version: await readPackageVersion('monaco-editor'),
      kind: 'static',
      path: 'monaco-editor/',
    },
    {
      id: 'codemirror',
      label: editorLabels.codemirror,
      version: await readPackageVersion('codemirror'),
      kind: 'static',
      path: 'codemirror/',
    },
  ]
  const ides = [
    {
      id: 'lvce-editor',
      label: ideLabels['lvce-editor'],
      version: await readPackageVersion('@lvce-editor/static-server'),
      kind: 'lvce',
      path: 'lvce-editor/',
    },
    {
      id: 'vscode',
      label: ideLabels.vscode,
      version: await readTextVersion('@github1s/vscode-web', '.VERSION'),
      kind: 'static',
      path: 'vscode-ide/',
    },
  ] as const
  const manifest: FixtureManifest = {
    generatedAt: new Date().toISOString(),
    editors,
    ides,
  }
  await writeFile(join(resolvedOutput, 'manifest.json'), `${JSON.stringify(manifest, undefined, 2)}\n`)
  await mkdir(join(root, '.tmp', 'workspace'), { recursive: true })
  await writeFile(join(root, '.tmp', 'workspace', 'benchmark.txt'), '')
  await writeFile(join(root, '.tmp', 'workspace', 'benchmark.html'), renderDocument)
  console.info(`Generated ${editors.length} editor fixtures and ${ides.length} IDE fixtures in ${resolvedOutput}`)
  return manifest
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  setupFixtures(process.argv[2]).catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error)
    process.exitCode = 1
  })
}
