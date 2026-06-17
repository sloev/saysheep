import { chromium } from '@playwright/test'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const b=await chromium.launch({headless:true})
const ctx=await b.newContext({permissions:['geolocation'],geolocation:{latitude:55.05,longitude:10.60},viewport:{width:412,height:870}})
await ctx.grantPermissions(['geolocation'],{origin:'http://127.0.0.1:5191'})
const p=await ctx.newPage()
const errs=[]; p.on('pageerror',e=>errs.push(e.message))
await p.goto('http://127.0.0.1:5191',{waitUntil:'domcontentloaded'})
await p.waitForSelector('#map',{timeout:20000}).catch(()=>{})
await sleep(3000)
const search=async q=>{ await p.locator('.map-search-input').fill(q); await p.locator('.map-search-btn').click(); await sleep(2200);
  const rows=await p.locator('.map-search-result').count();
  const out=[]; for(let i=0;i<Math.min(rows,4);i++){ const name=await p.locator('.msr-name').nth(i).innerText().catch(()=>'?'); const dist=await p.locator('.map-search-result').nth(i).locator('.msr-dist').innerText().catch(()=>'(none)'); out.push(`${name} [${dist}]`); }
  console.log(q,'->',out.join(' | ')); }
await search('København')
await search('Paris')
await search('Svendborg')
console.log('pageerrors:',errs.slice(0,3))
await b.close()
