// Non-headless exploration of the live site to surface bugs.
// Usage: node explore-live.mjs
import { chromium } from '@playwright/test'
import fs from 'fs'

const URL = 'https://sloev.github.io/saysheep'
const OUT = 'explore-artifacts'
fs.mkdirSync(OUT, { recursive: true })

const consoleMsgs = []
const pageErrors = []
const failedReqs = []

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const shot = async (page, name) => {
  try { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false }) } catch {}
}

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: false, slowMo: 150 })
  const context = await browser.newContext({
    permissions: ['geolocation'],
    geolocation: { latitude: 55.0598, longitude: 10.6068 }, // Svendborg
    viewport: { width: 412, height: 870 },
  })
  await context.grantPermissions(['geolocation'], { origin: URL })
  const page = await context.newPage()

  page.on('console', m => consoleMsgs.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', e => pageErrors.push(e.message))
  page.on('requestfailed', r => failedReqs.push(`${r.failure()?.errorText} ${r.url()}`))
  page.on('response', r => { if (r.status() >= 400) failedReqs.push(`HTTP ${r.status()} ${r.url()}`) })

  page.on('dialog', async d => { console.log(`DIALOG [${d.type()}]: ${d.message()}`); await d.accept().catch(() => {}) })

  console.log('Loading', URL)
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#map', { timeout: 20000 }).catch(() => console.log('no #map'))
  await sleep(4000)
  await shot(page, '01-home')

  // --- Search box ---
  const searchInput = page.locator('.map-search-input')
  if (await searchInput.count()) {
    console.log('Testing search: Svendborg')
    await searchInput.fill('Svendborg')
    await page.locator('.map-search-btn').click()
    await sleep(3500)
    await shot(page, '02-search-svendborg')
  } else {
    console.log('No .map-search-input visible')
  }

  // --- List route ---
  console.log('Navigating list')
  await page.locator('.nav-list, a[href*="list"]').first().click().catch(() => {})
  await sleep(2000)
  await shot(page, '03-list')

  // --- New item route + map-click position ---
  console.log('Navigating new item')
  await page.locator('.nav-new').first().click().catch(() => {})
  await sleep(1500)
  await shot(page, '04-new')
  // toggle manual location
  const manual = page.locator('#manual-loc')
  if (await manual.count()) {
    await manual.check().catch(() => {})
    await sleep(1500)
    await shot(page, '05-new-manual')
    // click on the picker map center
    const pick = page.locator('.location-picker-map')
    if (await pick.count()) {
      const box = await pick.boundingBox()
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
        await sleep(800)
        await shot(page, '06-new-picked')
      }
    } else {
      console.log('No .location-picker-map found')
    }
  }

  // --- Settings + agents ---
  for (const [sel, name] of [['.nav-agents', '07-agents'], ['.nav-settings', '08-settings']]) {
    const loc = page.locator(sel).first()
    if (await loc.count()) { await loc.click().catch(() => {}); await sleep(1500); await shot(page, name) }
  }

  await sleep(1000)
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ consoleMsgs, pageErrors, failedReqs }, null, 2))
  console.log('\n===== CONSOLE (errors/warnings) =====')
  consoleMsgs.filter(m => /error|warn/i.test(m)).forEach(m => console.log(m))
  console.log('\n===== PAGE ERRORS ====='); pageErrors.forEach(m => console.log(m))
  console.log('\n===== FAILED REQUESTS ====='); [...new Set(failedReqs)].forEach(m => console.log(m))

  await browser.close()
}

run().catch(e => { console.error(e); process.exit(1) })
