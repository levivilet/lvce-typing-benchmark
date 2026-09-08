import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from 'playwright'
import { LayerMetricsCollector } from '../src/paintMetrics.ts'
import { startStaticServer } from '../src/staticServer.ts'

for (const id of ['lvce-editor-minimal', 'lvce-editor-single-thread']) {
  test(`${id} paints rows without translations and scrolls the shared wrapper`, async (context) => {
    const server = await startStaticServer('.tmp/static')
    context.after(() => server.close())
    const browser = await chromium.launch()
    context.after(() => browser.close())
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    const cdp = await page.context().newCDPSession(page)
    const collector = new LayerMetricsCollector(cdp)
    await collector.start()
    await page.goto(`${server.url}/${id}/?render=true`)
    await page.waitForFunction(() => document.documentElement.dataset.renderBenchmarkReady === 'true')

    const metrics = await collector.collect()
    assert.ok(metrics.paintCommands, 'Paint Profiler commands must be available')
    assert.equal(metrics.paintCommands.find((command) => command.method === 'translate')?.count ?? 0, 0)
    assert.ok(metrics.paintCommands.some((command) => command.method === 'drawTextBlob'))
    await collector.stop()

    await page.setViewportSize({ width: 1280, height: 120 })
    await page.waitForFunction(() => document.querySelectorAll('.EditorRow').length === 6)
    await page.mouse.move(100, 100)
    await page.mouse.wheel(0, 7)
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.EditorLayers')!).translate === '0px -7px')
    const rows = await page.locator('.EditorRow').evaluateAll((elements) => elements.map((element) => ({
      top: element.getBoundingClientRect().top,
      bottom: element.getBoundingClientRect().bottom,
      translate: getComputedStyle(element).translate,
    })))
    assert.equal(rows[0].top, -7)
    assert.ok(rows.at(-1)!.bottom >= 120, 'The partially visible bottom row must fill the viewport')
    assert.ok(rows.every((row) => row.translate === 'none'))

    await page.mouse.wheel(0, 13)
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.EditorLayers')!).translate === 'none')
    assert.equal(await page.locator('.EditorRow').first().evaluate((row) => row.getBoundingClientRect().top), 0)
  })
}
