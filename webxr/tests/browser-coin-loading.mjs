// Failed/late optional physics must not silently freeze a live-looking coin.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.FRESNEL_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio',
  ...(process.env.FRESNEL_SOFTWARE_WEBGL==='1'?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])]});
const page=await browser.newPage({viewport:{width:1100,height:800}}), errors=[];
page.on('pageerror',e=>errors.push(e.message));
let reject=true, downloads=0;
await page.route('**/assets/rapier-*.js',async route=>{downloads++; if(reject)await route.abort();else await route.continue();});
try {
  await page.goto(process.env.FRESNEL_DEMO_URL||'http://127.0.0.1:8082/?lab=1',{waitUntil:'networkidle'});
  assert.equal(downloads,0,'non-coin initial view needs no physics download');
  await page.locator('[data-lab-preset="granular_single_coin_box"]').click();
  const status=page.locator('#presentation-status');
  await status.filter({hasText:'再読み込み'}).waitFor({state:'visible'});
  assert.equal(await page.locator('#lab-shake').isEnabled(),true,'Lab remains available on optional visual load failure');
  reject=false; await page.reload({waitUntil:'networkidle'});
  await page.locator('[data-lab-preset="granular_single_coin_box"]').click();
  await page.waitForFunction(()=>performance.getEntriesByType('resource').some(e=>/rapier-[^/]+\.js/.test(e.name)) && document.querySelector('#presentation-status').hidden);
  await page.locator('[data-lab-preset="liquid_small_box"]').click();
  assert.equal(await status.isVisible(),false,'successful material replacement leaves no stale error');
  assert.deepEqual(errors,[]);
  console.log('PASS optional coin module: lazy load, visible download failure, successful reload/reselection and no stale error.');
} finally {await browser.close();}
