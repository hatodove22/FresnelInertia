import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const built=await build({entryPoints:[fileURLToPath(new URL('../src/renderer/SolidDepthMotion.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {SolidDepthMotion}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const base={timeS:0,gravityZ:0,supportG:1,halfTravelM:.015,fill:.2};

test('neutral orientation stays centered; small slopes distinguish rolling from static friction',()=>{
  const coin=new SolidDepthMotion('coin'), marble=new SolidDepthMotion('marble');
  for(const motion of [coin,marble]) {
    for(let i=0;i<30;i++) assert.deepEqual(motion.update({...base,timeS:i/60}),{offsetM:0,velocityMps:0});
  }
  let c,m;
  for(let i=30;i<90;i++) {
    c=coin.update({...base,timeS:i/60,gravityZ:Math.sin(5*Math.PI/180)});
    m=marble.update({...base,timeS:i/60,gravityZ:Math.sin(5*Math.PI/180)});
  }
  assert.equal(c.offsetM,0); assert.ok(m.offsetM>.01);
});

test('signed pitch crosses the available travel promptly, reverses and settles at a wall',()=>{
  for(const kind of ['coin','marble']) for(const sign of [-1,1]) {
    const motion=new SolidDepthMotion(kind); motion.update(base);
    for(let i=1;i<=60;i++) motion.update({...base,timeS:i/60,gravityZ:sign*.5,supportG:Math.sqrt(.75)});
    assert.equal(motion.update({...base,timeS:1,gravityZ:sign*.5}).offsetM,sign*.015);
    let result;
    for(let i=61;i<=120;i++) result=motion.update({...base,timeS:i/60,gravityZ:-sign*.5,supportG:Math.sqrt(.75)});
    assert.equal(result.offsetM,-sign*.015); assert.equal(result.velocityMps,0);
    for(let i=121;i<220;i++) result=motion.update({...base,timeS:i/60});
    assert.equal(result.offsetM,-sign*.015,'level return does not magnetically recenter a resting object');
  }
});

test('snapshot time alone owns movement; duplicate/rewind/gap/missing/reset never catch up',()=>{
  const motion=new SolidDepthMotion('marble'); motion.update(base);
  const moving={...motion.update({...base,timeS:.05,gravityZ:.6})}; assert.ok(moving.offsetM>0);
  assert.deepEqual(motion.update({...base,timeS:.05,gravityZ:-1,halfTravelM:.0001}),moving);
  for(const timeS of [0,5,undefined,7]) assert.deepEqual(motion.update({...base,timeS,gravityZ:1}),{offsetM:0,velocityMps:0});
  motion.update({...base,timeS:7.1,gravityZ:1}); motion.reset();
  assert.deepEqual(motion.update({...base,timeS:7.2,gravityZ:1}),{offsetM:0,velocityMps:0});
});

test('accepted front/back acceleration produces the opposing visual inertia, not render-clock noise',()=>{
  for(const sign of [-1,1]) {
    const motion=new SolidDepthMotion('coin'); motion.update(base);
    const result=motion.update({...base,timeS:.1,accelerationZ:sign});
    assert.ok(result.offsetM*sign<0);
  }
});

test('source rates share the same prompt trajectory and centimetre-scale timing',()=>{
  for(const kind of ['coin','marble']) {
    const positions=[];
    for(const fps of [10,30,60,120]) {
      const motion=new SolidDepthMotion(kind); motion.update({...base,halfTravelM:.05});
      let result;
      for(let i=1;i<=fps*.2;i++) result=motion.update({...base,timeS:i/fps,gravityZ:.35,halfTravelM:.05});
      positions.push(result.offsetM);
    }
    assert.ok(Math.min(...positions)>.025,'small vessels do not take seconds to traverse');
    assert.ok(Math.max(...positions)-Math.min(...positions)<.0015);
  }
});

test('thin/empty/invalid ranges remain finite and contained without hiding the model position',()=>{
  for(const kind of ['coin','marble']) for(const travel of [0,.00001,.001,.02]) {
    const motion=new SolidDepthMotion(kind); motion.update({...base,halfTravelM:travel});
    for(let i=1;i<100;i++) {
      const result=motion.update({...base,timeS:i*.05,halfTravelM:travel,gravityZ:Math.sin(i)*20,accelerationZ:Math.cos(i)*20});
      assert.ok(Number.isFinite(result.offsetM)&&Number.isFinite(result.velocityMps));
      assert.ok(Math.abs(result.offsetM)<=travel);
    }
    assert.deepEqual(motion.update({...base,timeS:5.1,halfTravelM:travel,fill:0}),{offsetM:0,velocityMps:0});
    assert.deepEqual(motion.update({...base,timeS:5.2,halfTravelM:NaN,gravityZ:NaN}),{offsetM:0,velocityMps:0});
  }
});
