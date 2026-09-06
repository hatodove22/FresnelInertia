import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const base=process.env.EXPLAINER_URL||'http://127.0.0.1:4175';
const directory=new URL('../../output/fresnel-series-film/',import.meta.url);
await fs.mkdir(directory,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const result={routes:[],layouts:[],chapters:[],errors:[],missing:[]};
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();
  page.on('pageerror',error=>result.errors.push(error.message));
  page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)result.missing.push({url:r.url(),status:r.status()});});
  await page.goto(base+'/series.html',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelectorAll('[data-chapter]:not(:disabled)').length===4);
  await page.waitForFunction(()=>document.querySelector('#series-transcript')?.textContent?.includes('Fresnel'));
  const metadata=await page.evaluate(()=>{
    const v=document.querySelector('video'); return {duration:v.duration,width:v.videoWidth,height:v.videoHeight,paused:v.paused,tracks:v.textTracks.length,heading:document.querySelector('h1').textContent};
  });
  assert(metadata.paused);assert(metadata.duration>180&&metadata.duration<300);assert.equal(metadata.width,1920);assert.equal(metadata.height,1080);assert.equal(metadata.tracks,1);
  result.metadata=metadata;
  const chapters=await page.evaluate(async()=>await(await fetch('/media/fresnel-series-chapters.json')).json());
  for(const width of [1440,768,390,320]){
    await page.setViewportSize({width,height:width<500?850:1000});
    await page.waitForTimeout(120);
    const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,video:document.querySelector('video').getBoundingClientRect().toJSON()}));
    assert(layout.scrollWidth<=width,JSON.stringify(layout));assert(layout.video.width>width*.75);result.layouts.push(layout);
    if(width===1440||width===390)await page.screenshot({path:fileURLToPath(new URL(`series-site-${width}.png`,directory)),fullPage:true});
  }
  await page.setViewportSize({width:1440,height:1000});
  for(const id of ['shape','stiffness','center-of-gravity','inertia']){
    const expected=chapters.chapters.find(c=>c.id===id).start;
    await page.locator(`[data-chapter="${id}"]`).click();
    await page.waitForFunction(start=>{const v=document.querySelector('video');return !v.paused&&!v.seeking&&v.readyState>=2&&v.currentTime>start+.1&&v.currentTime<start+2;},expected);
    const observed=await page.evaluate(()=>{const v=document.querySelector('video');v.pause();return{time:v.currentTime,readyState:v.readyState};});
    assert(Math.abs(observed.time-expected)<2);result.chapters.push({id,expected,...observed});
  }
  await page.locator('details summary').click();assert(await page.locator('#series-transcript').isVisible());
  const text=await page.locator('#series-transcript').textContent();assert(text.length>2000);assert(!text.includes('\uFFFD'));
  await page.evaluate(()=>{const v=document.querySelector('video');v.textTracks[0].mode='showing';});
  await page.waitForFunction(()=>document.querySelector('video').textTracks[0].cues?.length>15);
  result.subtitleCues=await page.evaluate(()=>document.querySelector('video').textTracks[0].cues.length);
  for(const route of ['/','/atlas.html']){
    await page.goto(base+route,{waitUntil:'networkidle'});
    if(route==='/'){
      await page.waitForSelector('#container-canvas[data-ready="true"]');
      assert(await page.locator('a[href="/series.html"]').count()>0);
    }
    result.routes.push({route,title:await page.title()});
  }
  assert.deepEqual(result.errors,[]);assert.deepEqual(result.missing,[]);
  result.status='PASS';await fs.writeFile(new URL('series-site-verification.json',directory),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
