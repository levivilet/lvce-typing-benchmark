import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { bundleJavaScriptSource, generateIife } from './rollupBundle.ts'

const replaceExactlyOnce = (source: string, search: string, replacement: string, label: string): string => {
  const firstIndex = source.indexOf(search)
  if (firstIndex === -1) {
    throw new Error(`Could not patch ${label}`)
  }
  if (source.includes(search, firstIndex + search.length)) {
    throw new Error(`Patch for ${label} matched more than once`)
  }
  return `${source.slice(0, firstIndex)}${replacement}${source.slice(firstIndex + search.length)}`
}

const directRpcSource = `
const __lvceCreateDirectRpc = (commandMap) => {
  const invoke = (method, ...params) => {
    const command = commandMap[method]
    if (!command) {
      throw new Error(\`Direct LVCE command not found: \${method}\`)
    }
    return command(...params)
  }
  return {
    dispose: async () => undefined,
    invoke,
    invokeAndTransfer: invoke,
    send: invoke,
  }
}
`

const syntaxMain = `const main = async () => {
  await listen();
};

main();`

const createSyntaxBundle = (source: string): string => {
  const withEmbeddedTokenizer = replaceExactlyOnce(
    source,
    'const tokenizer = await import(tokenizePath);',
    "const tokenizer = tokenizePath === 'embedded:html' ? embeddedHtmlTokenizer : await import(tokenizePath);",
    'syntax-highlighting worker tokenizer import',
  )
  const withoutWorkerMain = replaceExactlyOnce(
    withEmbeddedTokenizer,
    syntaxMain,
    'return commandMap;',
    'syntax-highlighting worker main',
  )
  return `const __lvceSyntaxCommands = ((embeddedHtmlTokenizer) => {\n${withoutWorkerMain}\n})(__lvceHtmlTokenizer);\n`
}

const createSyntaxRpc = `const createSyntaxHighlightingWorkerRpc = async () => {
  try {
    const rpc = await create$e({
      commandMap: {},
      send: sendMessagePortToSyntaxHighlightingWorker
    });
    return rpc;
  } catch (error) {
    throw new VError(error, \`Failed to create syntax highlighting worker rpc\`);
  }
};`

const editorMain = `const main = async () => {
  setupUnhandledErrorHandling(globalThis);
  await listen();
  registerWidgets();
};

main();`

const createEditorBundle = (source: string): string => {
  const withDirectSyntax = replaceExactlyOnce(
    source,
    createSyntaxRpc,
    `const createSyntaxHighlightingWorkerRpc = async () => {
  return __lvceCreateDirectRpc(__lvceSyntaxCommands);
};`,
    'editor worker syntax-highlighting RPC',
  )
  const withoutWorkerMain = replaceExactlyOnce(
    withDirectSyntax,
    editorMain,
    `registerWidgets();
return {
  commands: commandMap,
  configureRenderer(rendererCommands) {
    set$b(__lvceCreateDirectRpc(rendererCommands));
  }
};`,
    'editor worker main',
  )
  return `const __lvceEditorWorker = (() => {\n${withoutWorkerMain}\n})();\n`
}

const launchWorker = `const launchWorker = async (name, url, commandMap) => {
  const {
    port1,
    port2
  } = new MessageChannel();
  await create$2({
    commandMap: {},
    name,
    port: port1,
    url
  });
  return create$3({
    commandMap,
    messagePort: port2
  });
};`

const createRendererBundle = (source: string): string => {
  const directLaunch = replaceExactlyOnce(
    source,
    launchWorker,
    `const launchWorker = async (name) => {
  if (name === 'Syntax Highlighting Worker') {
    return __lvceCreateDirectRpc(__lvceSyntaxCommands);
  }
  if (name === 'Editor Worker') {
    __lvceEditorWorker.configureRenderer(commandMapRef);
    return __lvceCreateDirectRpc(__lvceEditorWorker.commands);
  }
  throw new Error(\`Unsupported single-thread LVCE worker: \${name}\`);
};`,
    'renderer worker launcher',
  )
  return `(() => {\n${directLaunch}\n})();\n`
}

export interface SingleThreadLvceBundleOptions {
  readonly editorWorkerPath: string
  readonly htmlTokenizerPath: string
  readonly outputPath: string
  readonly rendererProcessPath: string
  readonly syntaxHighlightingWorkerPath: string
}

export const bundleSingleThreadLvce = async (options: SingleThreadLvceBundleOptions): Promise<void> => {
  const editorSource = await readFile(options.editorWorkerPath, 'utf8')
  const rendererSource = await readFile(options.rendererProcessPath, 'utf8')
  const syntaxSource = await readFile(options.syntaxHighlightingWorkerPath, 'utf8')
  const tokenizerSource = await generateIife(options.htmlTokenizerPath, '__lvceHtmlTokenizer')
  const bundle = [
    directRpcSource,
    tokenizerSource,
    createSyntaxBundle(syntaxSource),
    createEditorBundle(editorSource),
    createRendererBundle(rendererSource),
  ].join('\n')
  await bundleJavaScriptSource(bundle, options.outputPath)
}

export const getSingleThreadLvceBundlePaths = (root: string, lvceAssetDirectory: string, output: string): SingleThreadLvceBundleOptions => ({
  editorWorkerPath: join(root, 'node_modules', '@lvce-editor', 'editor-worker', 'dist', 'editorWorkerMain.js'),
  htmlTokenizerPath: join(lvceAssetDirectory, 'extensions', 'builtin.language-basics-html', 'src', 'tokenizeHtml.js'),
  outputPath: join(output, 'index.js'),
  rendererProcessPath: join(root, 'node_modules', '@lvce-editor', 'renderer-process', 'dist', 'editorOnlyRendererProcessMain.js'),
  syntaxHighlightingWorkerPath: join(
    root,
    'node_modules',
    '@lvce-editor',
    'syntax-highlighting-worker',
    'dist',
    'syntaxHighlightingWorkerMain.js',
  ),
})
