import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from 'playwright'
import { armTypingLagSample } from '../src/typingLag.ts'

test('waits for the text DOM even when the input model has already updated', async (context) => {
  const browser = await chromium.launch()
  context.after(() => browser.close())
  const page = await browser.newPage()
  await page.setContent('<input autofocus><div class="ace_text-layer"><div class="ace_line"></div></div>')
  await page.locator('input').focus()
  await armTypingLagSample(page, 'ace-editor', 1, 5_000)
  await page.keyboard.press('a')
  assert.equal(await page.locator('input').inputValue(), 'a')
  assert.equal(await page.evaluate(() => performance.getEntriesByName('typing-lag:1:keydown').length), 1)
  assert.equal(await page.evaluate(() => performance.getEntriesByName('typing-lag:1:dom').length), 0)
  assert.equal(await page.evaluate(() => document.documentElement.dataset.typingLagSettled), '')
  await page.locator('.ace_line').evaluate((line) => { line.textContent = 'a' })
  await page.waitForFunction(() => document.documentElement.dataset.typingLagSettled === '1')
  assert.equal(await page.evaluate(() => performance.getEntriesByName('typing-lag:1:dom').length), 1)
})
