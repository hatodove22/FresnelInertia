// Actual Lab/Wasm inputs with presentation-only solid depth. No hardware/audio IO.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.FRESNEL_PLAYWRIGHT_MODULE || 'playwright');
const url=new URL(process.env.FRESNEL_DEMO_URL || 'http://127.0.0.1:8082/'); url.searchParams.set('lab','1');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio',
  ...(process.env.FRESNEL_SOFTWARE_WEBGL==='1'?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])]});
const page=await browser.newPage({viewport:{width:1100,height:800},ignoreHTTPSErrors:true});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error' && /shader|WebGL|THREE/.test(m.text())) errors.push(m.text());});
await page.addInitScript(()=>{
  window.__depthIO=[]; window.__depthFrames=0;
  const block=name=>()=>{window.__depthIO.push(name);throw Error(`Unexpected IO: ${name}`);};
  Object.defineProperty(navigator,'serial',{configurable:true,value:{requestPort:block('serial'),getPorts:block('serial')}});
  Object.defineProperty(navigator,'usb',{configurable:true,value:{requestDevice:block('usb'),getDevices:block('usb')}});
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:block('camera')}});
  window.AudioContext=block('audio');
  const raf=requestAnimationFrame.bind(window);
  window.requestAnimationFrame=callback=>raf(time=>{
    callback(time); window.__depthFrames++;
    const label=document.querySelector('#lab-model-state')?.textContent ?? '';
    const t=Number(label.match(/([\d.]+) s$/)?.[1]);
    if(window.__depthPauseAt!==undefined && t>=window.__depthPauseAt){
      window.__depthPauseAt=undefined;
      const button=document.querySelector('#lab-pause'); if(button?.getAttribute('aria-pressed')!=='true')button?.click();
    }
  });
});
const output=new URL('../../tmp/browser/',import.meta.url); await mkdir(output,{recursive:true});
const pause=page.locator('#lab-pause');
const at=async time=>{
  await page.evaluate(t=>{window.__depthPauseAt=t;},time);
  if(await pause.getAttribute('aria-pressed')==='true') await pause.click();
  await page.waitForFunction(()=>document.querySelector('#lab-pause').getAttribute('aria-pressed')==='true',null,{timeout:60000});
};
const pitch=async value=>page.locator('#lab-pitch').evaluate((input,v)=>{input.value=String(v);input.dispatchEvent(new Event('input',{bubbles:true}));},value);
try {
  await page.goto(url.href);
  for(const [preset,label] of [['granular_single_marble_box','marble'],['granular_coin_box','coins'],['granular_single_coin_box','single-coin']]) {
    await page.locator(`[data-lab-preset="${preset}"]`).click();
    await page.locator('#lab-reset').click();
    await pitch(30); await at(.8);
    await page.screenshot({path:fileURLToPath(new URL(`solid-depth-${label}-front.png`,output))});
    const text=await page.locator('#lab-model-state').textContent();
    assert.match(text,/重心 x 0\.0 mm · 接触 0 回/,'pure pitch did not invent a C++ collision or horizontal mass movement');
    const canvas=page.locator('#scene'), frozen=await canvas.screenshot();
    const frames=await page.evaluate(()=>window.__depthFrames);
    await page.waitForFunction(n=>window.__depthFrames>=n+3,frames);
    assert.ok((await canvas.screenshot()).equals(frozen),'paused source holds solid position/rolling and container together');
    await pitch(-30); await at(1.6);
    await page.screenshot({path:fileURLToPath(new URL(`solid-depth-${label}-back.png`,output))});
    assert.match(await page.locator('#lab-model-state').textContent(),/重心 x 0\.0 mm · 接触 0 回/);
    console.log(`PASS ${label}: pitch in both directions, unchanged C++ x/contact counters, paused canvas.`);
  }
  await page.setViewportSize({width:412,height:915});
  await page.screenshot({path:fileURLToPath(new URL('solid-depth-mobile.png',output))});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#lab-reset').click(); await at(.2);
  assert.equal(await page.locator('#lab-pitch').inputValue(),'0');
  assert.deepEqual(await page.evaluate(()=>window.__depthIO),[]);
  assert.deepEqual(errors,[]);
  console.log('PASS production Lab solid depth/pause/reset/mobile; no page/shader errors or hardware/camera/audio IO.');
} finally {await browser.close();}
