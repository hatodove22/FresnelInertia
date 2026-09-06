import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
await mkdir('../output/cad-motion-film/rig-review',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1400,height:900}});
await page.goto('http://127.0.0.1:4175');
await page.evaluate(async()=>{document.body.innerHTML='<canvas style="width:1400px;height:900px"></canvas>';const m=await import('/src/device.ts');window.rigReview=await m.createDeviceViewer(document.querySelector('canvas'),{variant:'film',manual:true,pixelRatio:1});});
for(const [name,position,target,cutaway] of [['front',[.002,.035,.17],[0,-.002,.008],false],['front-cut',[.002,.035,.17],[0,-.002,.008],true],['diagonal',[.055,.05,.17],[0,0,0],false],['gear',[.002,.008,.115],[0,-.002,.023],true]]){
 await page.evaluate(({position,target,cutaway})=>window.rigReview.renderFrame({leftDeg:10,rightDeg:-10,pulse:[1,.3,0,.7],cutaway,camera:{position,target,fov:34}}),{position,target,cutaway});
 await page.screenshot({path:`../output/cad-motion-film/rig-review/${name}.png`});
}
await browser.close();
