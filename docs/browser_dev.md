# Iterative bug-fixing with Playwright + non-headless Chrome

A loop for finding and fixing UI bugs on saysheep by driving a *real* Chrome window against the live (or local) site, watching it happen, and reading console/network errors programmatically.

## Prereqs
- `@playwright/test` is already a dependency. System Chrome is at `/usr/bin/google-chrome`.
- An X11 display is needed for non-headless. On this machine `DISPLAY=:0` works.

## Why non-headless
You *see* the interaction (catches layout/visual bugs an assertion won't), and the same script captures console errors, page errors, and failed requests (4xx/5xx) that reveal silent failures.

## The harness pattern

```js
// explore.mjs  — run with: node explore.mjs
import { chromium } from '@playwright/test'
import fs from 'fs'

const URL = process.env.URL || 'https://sloev.github.io/saysheep'
fs.mkdirSync('explore-artifacts', { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await chromium.launch({
  channel: 'chrome',     // use system Chrome, not bundled Chromium
  headless: false,
  slowMo: 80,            // slow enough to watch
})

// Test BOTH layouts — saysheep switches between mobile + desktop-sidebar
for (const vp of [{ name: 'mobile', width: 412, height: 870 },
                  { name: 'desktop', width: 1280, height: 800 }]) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    permissions: ['geolocation'],
    geolocation: { latitude: 55.0598, longitude: 10.6068 }, // Svendborg — has gazetteer data
  })
  await ctx.grantPermissions(['geolocation'], { origin: URL })
  const page = await ctx.newPage()

  // Capture everything that hints at a bug
  const errors = [], fails = []
  page.on('console', m => { if (/error|warn/i.test(m.type())) errors.push(`[${m.type()}] ${m.text()}`) })
  page.on('pageerror', e => errors.push(`PAGEERROR ${e.message}`))
  page.on('requestfailed', r => fails.push(`${r.failure()?.errorText} ${r.url()}`))
  page.on('response', r => { if (r.status() >= 400) fails.push(`HTTP ${r.status()} ${r.url()}`) })

  // Auto-accept dialogs (the take-flow uses prompt()/alert())
  page.on('dialog', async d => { console.log(`DIALOG [${d.type()}] ${d.message().slice(0,80)}`); await d.accept().catch(()=>{}) })

  console.log(`\n##### ${vp.name} #####`)
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#map', { timeout: 20000 }).catch(()=>console.log('no #map'))
  await sleep(4500) // let GPS + relays settle

  // --- drive a flow + ASSERT something concrete ---
  await page.locator('.map-search-input').fill('Svendborg')
  await page.locator('.map-search-btn').click()
  await sleep(3000)
  await page.screenshot({ path: `explore-artifacts/${vp.name}-search.png` })

  // Make assertions specific and machine-checkable, e.g.:
  const topbar = await page.locator('.topbar-marquee').innerText().catch(()=> '')
  if (/slogan\.\d/.test(topbar)) console.log('BUG: untranslated i18n keys in topbar')

  console.log(`errors: ${errors.length}`); errors.slice(0,15).forEach(e => console.log('  '+e.slice(0,140)))
  console.log(`failed requests:`); [...new Set(fails)].slice(0,15).forEach(f => console.log('  '+f.slice(0,140)))
  await ctx.close()
}
await browser.close()
```

## The iterative loop
1. **Run** `node explore.mjs` and watch the window.
2. **Read** the printed console errors + failed requests + screenshots in `explore-artifacts/`.
3. **Identify** one concrete bug (a 404, a raw error, a visibly wrong layout).
4. **Fix** the source, then `npm run build`.
5. **Re-run** against the *deployed* site after CI, or against a local `vite preview` for faster turnaround.
6. Repeat until errors == 0 in both viewports.

## Tips specific to saysheep
- **Geolocation matters:** search and the list viewport-filter only work where gazetteer/items exist. Use Svendborg (`55.0598, 10.6068`) or Copenhagen (`55.6761, 12.5683`). The CI E2E uses Bouvet Island (`-54.42, 3.36`) to avoid polluting public relays — don't use that for QA, it's empty.
- **Two layouts, two nav paths:** mobile uses bottom-nav `.nav-list`/`.nav-new`; desktop uses the sidebar `.btn-give-away` button. A selector that works on mobile may silently no-op on desktop — assert `route-*` class on `#app` after navigating.
- **Forms scroll:** clicking a `boundingBox()` center can miss if the element is below the fold — `scrollIntoViewIfNeeded()` first, then click.
- **Markers:** the app uses Leaflet `divIcon`s (no image). If you see `marker-icon.png`/`marker-shadow.png` 404s, someone added a default `L.marker()` somewhere — use a divIcon.
- **Don't commit artifacts:** keep `explore.mjs` and `explore-artifacts/` out of git (a stray `git add -A` once swept screenshots into a commit). Add them to `.gitignore`.
- **Local fast loop:** `npm run build && npx vite preview --port 5173` in `client/`, then `URL=http://localhost:5173 node explore.mjs` — but P2P/relay features need the relay running (`node relay/src/index.js`, slow to boot via native iroh/sqlite/sharp).
