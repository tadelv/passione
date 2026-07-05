import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1024, height: 600 } })
await page.goto('http://localhost:5173/#/recipe/edit', { waitUntil: 'domcontentloaded' })
// give the app time to mount + bootReady fallback (5s) to elapse
await page.waitForTimeout(6500)
await page.screenshot({ path: 'scratch/recipe-editor-1024x600.png' })
// also capture body scrollHeight vs viewport to check the no-scroll guarantee
const metrics = await page.evaluate(() => ({
  scrollH: document.documentElement.scrollHeight,
  clientH: document.documentElement.clientHeight,
  hasRail: !!document.querySelector('.recipe-pill-rail'),
  quadrants: document.querySelectorAll('.recipe-editor__quadrant').length,
}))
console.log(JSON.stringify(metrics))
await browser.close()
