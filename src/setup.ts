import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { editorLabels } from './editors.ts'
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
    cp(join(root, 'node_modules', '@lvce-editor', 'static-server', 'static'), join(resolvedOutput, 'lvce-editor'), { recursive: true }),
  ])

  const editors: readonly EditorFixture[] = [
    {
      id: 'lvce-editor',
      label: editorLabels['lvce-editor'],
      version: await readPackageVersion('@lvce-editor/static-server'),
      kind: 'lvce',
      path: 'lvce-editor/',
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
  const manifest: FixtureManifest = {
    generatedAt: new Date().toISOString(),
    editors,
  }
  await writeFile(join(resolvedOutput, 'manifest.json'), `${JSON.stringify(manifest, undefined, 2)}\n`)
  await mkdir(join(root, '.tmp', 'workspace'), { recursive: true })
  await writeFile(join(root, '.tmp', 'workspace', 'benchmark.txt'), '')
  console.info(`Generated ${editors.length} editor fixtures in ${resolvedOutput}`)
  return manifest
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  setupFixtures(process.argv[2]).catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error)
    process.exitCode = 1
  })
}
