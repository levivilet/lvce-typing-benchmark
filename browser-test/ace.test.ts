import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from 'playwright'
import { renderDocument } from '../fixtures/renderDocument.ts'
import { startStaticServer } from '../src/staticServer.ts'

for (const renderMode of [false, true]) {
  test(`Ace supports ${renderMode ? 'HTML rendering' : 'plain-text typing'} with local assets`, async (context) => {
    const server = await startStaticServer('.tmp/static')
    context.after(() => server.close())
    const browser = await chromium.launch()
    context.after(() => browser.close())
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    const errors: string[] = []
    page.on('pageerror', (error) => {
      errors.push(error.message)
    })
    page.on('requestfailed', (request) => {
      errors.push(request.url())
    })
    page.on('response', (response) => {
      if (!response.ok()) {
        errors.push(`${response.status()} ${response.url()}`)
      }
    })
    await page.route('**/*', async (route) => {
      if (new URL(route.request().url()).origin !== server.url) {
        errors.push(route.request().url())
        await route.abort()
        return
      }
      await route.continue()
    })
    await page.goto(`${server.url}/ace-editor/${renderMode ? '?render=true' : ''}`)
    await page.waitForFunction(() => document.documentElement.dataset.benchmarkReady === 'true')
    if (renderMode) {
      await page.waitForFunction(() => document.documentElement.dataset.renderBenchmarkReady === 'true')
      assert.equal(await page.evaluate(() => (globalThis as unknown as Window).__typingBenchmark?.getText()), renderDocument)
      assert.ok(await page.locator('.ace_text-layer .ace_tag').count() > 0)
      assert.equal(await page.evaluate(() => performance.getEntriesByName('syntax-highlight-rendered', 'mark').length), 1)
    } else {
      assert.equal(await page.evaluate(() => (globalThis as unknown as Window).__typingBenchmark?.getText()), '')
      await page.evaluate(() => (globalThis as unknown as Window).__typingBenchmark?.focus())
      const text = 'a'.repeat(500)
      await page.keyboard.type(text)
      assert.equal(await page.evaluate(() => (globalThis as unknown as Window).__typingBenchmark?.getText()), text)
      await page.keyboard.press('Control+A')
      await page.keyboard.press('Backspace')
      assert.equal(await page.evaluate(() => (globalThis as unknown as Window).__typingBenchmark?.getText()), '')
    }
    assert.deepEqual(errors, [])
  })
}
