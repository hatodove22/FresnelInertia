import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.EXPLAINER_URL||'http://127.0.0.1:4175';
const output='../output/playwright/atlas';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
  const errors=[],badAssets=[],checks=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.url().startsWith(base)&&response.status()>=400)badAssets.push(`${response.status()} ${response.url()}`);});
  await page.goto(`${base}/atlas.html`,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
  assert.match(await page.title(),/Possibility Atlas/);assert.equal(await page.locator('[data-concept]').count(),12);
  assert.equal(await page.locator('.webgl-fallback').isVisible(),false,'Real WebGL must render');
  await page.screenshot({path:`${output}/desktop-intro.png`});
  await page.locator('#sketch-tilt').focus();await page.keyboard.press('End');
  assert.equal(await page.locator('#sketch-degrees').textContent(),'35°');
  await page.waitForFunction(()=>document.querySelector('#state-value').textContent==='壁に吸着',null,{timeout:15000});
  await page.locator('#play').click();
  const frozenTime=await page.locator('#sketch-time').textContent();
  const paused1=await page.locator('#sketch-canvas').screenshot();await page.waitForTimeout(200);
  const paused2=await page.locator('#sketch-canvas').screenshot();assert.ok(paused1.equals(paused2));
  assert.equal(await page.locator('#sketch-time').textContent(),frozenTime);
  await page.locator('#lab').screenshot({path:`${output}/magnetic-lab.png`});
  await page.locator('#shake').click();assert.equal(await page.locator('#event-label').textContent(),'壁から離れた');
  assert.equal(await page.locator('#state-value').textContent(),'自由に転がる');checks.push('tilt, attachment, frozen pause, release in paused single step');
  await page.locator('[data-scenario="pour"]').click();await page.locator('#sketch-tilt').focus();await page.keyboard.press('End');
  await page.locator('#lab').screenshot({path:`${output}/pour-lab.png`});
  const pouring=await page.locator('#sketch-canvas').screenshot();assert.ok(!paused1.equals(pouring));
  await page.locator('#play').click();
  await page.waitForFunction(()=>document.querySelector('#event-label').textContent==='最後の粒が出た',null,{timeout:20000});
  assert.equal(await page.locator('#state-value').textContent(),'0%');await page.locator('#play').click();
  checks.push('separate material rendering, depletion to empty, end event');
  await page.locator('[data-scenario="seed"]').click();await page.locator('#shake').click();
  assert.equal(await page.locator('#event-label').textContent(),'目を覚ました');
  await page.locator('#lab').screenshot({path:`${output}/seed-lab.png`});
  const awakened=await page.locator('#sketch-time').textContent();await page.locator('#step').click();assert.notEqual(await page.locator('#sketch-time').textContent(),awakened);
  await page.locator('#reset').click();assert.equal(await page.locator('#sketch-time').textContent(),'00.0 s');checks.push('seed wake, explicit stepping, reset');
  for(const [filter,count] of [['presentation',3],['software',6],['tracking',2],['hardware',1],['all',12]]){
    await page.locator(`[data-filter="${filter}"]`).click();assert.equal(await page.locator('[data-concept]').count(),count);
  }
  for(const id of ['C01','C05','C10','C12']){
    await page.locator(`[data-concept="${id}"]`).click();assert.match(page.url(),new RegExp(`#${id}$`));assert.ok((await page.locator('.first-experiment').textContent()).length>50);
  }
  await page.locator('[data-concept="C05"]').click();
  const downloadEvent=page.waitForEvent('download');await page.locator('#download-concept').click();const download=await downloadEvent;
  assert.equal(download.suggestedFilename(),'fresnel-inertia-C05.json');await download.saveAs(`${output}/concept-C05.json`);
  await page.locator('#possibilities').screenshot({path:`${output}/concept-atlas.png`});
  await page.locator('.detail-sources a').first().click();assert.ok(await page.locator('details[open]').count());checks.push('four capability filters, recipe selection, deep links, JSON download, linked research');
  const widths=[1440,768,390,320];
  for(const width of widths){await page.setViewportSize({width,height:900});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`No horizontal overflow at ${width}`);}
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${output}/mobile-intro.png`});
  await page.locator('#lab').screenshot({path:`${output}/mobile-lab.png`});
  await page.locator('#possibilities').screenshot({path:`${output}/mobile-atlas.png`});
  const reduced=await browser.newPage({reducedMotion:'reduce',viewport:{width:390,height:844}});await reduced.goto(`${base}/atlas.html#C04`,{waitUntil:'networkidle'});
  assert.equal(await reduced.locator('#play').getAttribute('aria-pressed'),'false');assert.match(await reduced.locator('#concept-title').textContent(),/一粒/);
  const before=await reduced.locator('#sketch-time').textContent();await reduced.waitForTimeout(250);assert.equal(await reduced.locator('#sketch-time').textContent(),before);
  checks.push('responsive 1440/768/390/320, reduced motion frozen, initial recipe deep link');
  assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);
  const result={status:'PASS',renderer:'Playwright / Chromium WebGL',widths,checks,pageErrors:errors,missingAssets:badAssets};
  await writeFile(`${output}/verification.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
