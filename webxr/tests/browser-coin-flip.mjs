// Observe the actual production renderer's instance uploads, not a test scene.
// The Lab's spatial shake is the only input. Observe contact-driven orientation,
// not a prescribed half-turn event/timing. No application test hooks or device IO.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.FRESNEL_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio',
  ...(process.env.FRESNEL_SOFTWARE_WEBGL==='1'?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])]});
const page=await browser.newPage({viewport:{width:1100,height:800}});
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
await mkdir(new URL('../../tmp/browser/',import.meta.url),{recursive:true});
await page.addInitScript(()=>{
  const forbidden=[];
  const block=name=>()=>{forbidden.push(name);throw Error(`Unexpected coin-test IO: ${name}`);};
  Object.defineProperty(navigator,'serial',{configurable:true,value:{requestPort:block('serial'),getPorts:block('serial')}});
  Object.defineProperty(navigator,'usb',{configurable:true,value:{requestDevice:block('usb'),getDevices:block('usb')}});
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:block('camera')}});
  window.AudioContext=block('audio');
  let target=null, capture=null, latest=null;
  const inspect=data=>{
    if(!(data instanceof Float32Array)||![16,128].includes(data.length))return;
    const preset=document.querySelector('[data-lab-preset][aria-pressed="true"]')?.dataset.labPreset;
    const count=preset==='granular_single_coin_box'?1:preset==='granular_coin_box'?8:0;
    if(data.length!==count*16||!count)return;
    const r=Math.hypot(data[0],data[1],data[2]);
    if(r<.006||r>.011||data[15]!==1)return;
    const normals=Array.from({length:count},(_,i)=>data[i*16+5]/Math.hypot(data[i*16+4],data[i*16+5],data[i*16+6]));
    latest={normals,matrices:Array.from(data)};
    if(target && normals.some(n=>target==='edge'?Math.abs(n)<.30:n<-.95)) {
      capture={...latest,target}; target=null;
      queueMicrotask(()=>{const pause=document.querySelector('#lab-pause');if(pause?.getAttribute('aria-pressed')!=='true')pause.click();});
    }
  };
  for(const proto of [WebGLRenderingContext.prototype,WebGL2RenderingContext.prototype]) {
    for(const method of ['bufferData','bufferSubData']) {
      const original=proto[method];
      proto[method]=function(...args){const result=original.apply(this,args);inspect(args[method==='bufferData'?1:2]);return result;};
    }
  }
  window.__coinFlipProbe={arm(value){target=value;capture=null;},read(){return {capture,latest,forbidden};}};
});
try {
  await page.goto(process.env.FRESNEL_DEMO_URL||'http://127.0.0.1:8082/?lab=1',{waitUntil:'networkidle'});
  await page.locator('#lab-shake').waitFor();
  assert.ok(!(await page.evaluate(()=>performance.getEntriesByType('resource').some(e=>/rapier-[^/]+\.js/.test(e.name)))), 'water-first page does not fetch coin physics');
  for(const [name,label] of [['granular_single_coin_box','single'],['granular_coin_box','pile']]) {
    await page.locator(`[data-lab-preset="${name}"]`).click();
    await page.waitForFunction(()=>performance.getEntriesByType('resource').some(e=>/rapier-[^/]+\.js/.test(e.name)) && document.querySelector('#presentation-status').hidden);
    await page.locator('#lab-slow').evaluate(input=>{const details=input.closest('details');if(details&&!details.open)details.querySelector('summary').click();});
    await page.locator('#lab-slow').check();
    await page.evaluate(()=>window.__coinFlipProbe.arm('edge'));
    await page.locator('#lab-shake').click();
    await page.waitForFunction(()=>window.__coinFlipProbe.read().capture?.target==='edge',null,{timeout:30000});
    await page.waitForFunction(()=>document.querySelector('#lab-pause').getAttribute('aria-pressed')==='true');
    await page.screenshot({path:fileURLToPath(new URL(`../../tmp/browser/coin-flip-${label}-edge.png`,import.meta.url))});
    const frozen=await page.evaluate(()=>window.__coinFlipProbe.read().latest.matrices);
    await page.waitForTimeout(180);
    assert.deepEqual(await page.evaluate(()=>window.__coinFlipProbe.read().latest.matrices),frozen,'paused edge pose must hold');
    await page.evaluate(()=>window.__coinFlipProbe.arm('back'));
    await page.locator('#lab-pause').click();
    await page.waitForFunction(()=>window.__coinFlipProbe.read().capture?.target==='back',null,{timeout:30000});
    await page.waitForFunction(()=>document.querySelector('#lab-pause').getAttribute('aria-pressed')==='true');
    await page.screenshot({path:fileURLToPath(new URL(`../../tmp/browser/coin-flip-${label}-back.png`,import.meta.url))});
    const result=await page.evaluate(()=>window.__coinFlipProbe.read());
    assert.ok(result.latest.normals.some(n=>n<-.95),'visible reverse face, not small rocking');
    await page.locator('#lab-reset').click();
    await page.waitForFunction(()=>window.__coinFlipProbe.read().latest.normals.every(n=>n>.99));
    console.log(`PASS ${label}: spatial input produces edge/reverse contact poses, pause hold and reset initial arrangement.`);
  }
  await page.setViewportSize({width:412,height:915});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile-width controls fit without horizontal overflow');
  await page.screenshot({path:fileURLToPath(new URL('../../tmp/browser/coin-flip-mobile.png',import.meta.url))});
  assert.deepEqual(errors,[]);
  assert.deepEqual(await page.evaluate(()=>window.__coinFlipProbe.read().forbidden),[]);
  console.log('PASS actual WebGL coin turnover; no page errors or hardware/camera/audio IO.');
} finally {await browser.close();}
