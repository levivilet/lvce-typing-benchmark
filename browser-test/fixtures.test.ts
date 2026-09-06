import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from 'playwright'
import { renderDocument } from '../fixtures/renderDocument.ts'
import { startStaticServer } from '../src/staticServer.ts'

for (const [id, tokenSelector] of [
  ['codemirror5', '.cm-tag'],
  ['codejar-prism', '.token.tag'],
] as const) {
  test(`${id} preserves typed text and renders highlighted HTML before signaling readiness`, async () => {
    const server = await startStaticServer('.tmp/static')
    try {
      const browser = await chromium.launch()
      try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
        const errors: string[] = []
        page.on('pageerror', (error) => {
          errors.push(error.message)
        })
        await page.goto(`${server.url}/${id}/`)
        await page.waitForFunction(() => document.documentElement.dataset.benchmarkReady === 'true')
        assert.equal(await page.evaluate(() => globalThis.window.__typingBenchmark?.getText()), '')
        await page.evaluate(() => globalThis.window.__typingBenchmark?.focus())
        await page.keyboard.type('hello <world>&')
        assert.equal(await page.evaluate(() => globalThis.window.__typingBenchmark?.getText()), 'hello <world>&')
        await page.keyboard.press('Backspace')
        assert.equal(await page.evaluate(() => globalThis.window.__typingBenchmark?.getText()), 'hello <world>')
        assert.equal(await page.locator(tokenSelector).count(), 0)

        await page.goto(`${server.url}/${id}/?render=true`)
        await page.waitForFunction(() => document.documentElement.dataset.renderBenchmarkReady === 'true')
        assert.equal(await page.evaluate(() => globalThis.window.__typingBenchmark?.getText()), renderDocument)
        assert.ok(await page.locator(tokenSelector).count() > 0)
        assert.equal(await page.locator(tokenSelector).first().isVisible(), true)
        const colors = await page.locator(tokenSelector).first().evaluate((token) => ({
          token: getComputedStyle(token).color,
          parent: getComputedStyle(token.parentElement!).color,
        }))
        assert.notEqual(colors.token, colors.parent)
        assert.equal(await page.evaluate(() => performance.getEntriesByName('syntax-highlight-rendered').length), 1)
        assert.deepEqual(errors, [])
      } finally {
        await browser.close()
      }
    } finally {
      await server.close()
    }
  })
}
