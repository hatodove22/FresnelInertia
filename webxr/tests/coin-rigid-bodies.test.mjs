import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/renderer/CoinRigidBodies.ts', import.meta.url))], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
const { createCoinRigidBodies } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const size = { x: .05, y: .05, z: .03 };
const gravity = { x: 0, y: -1, z: 0 };
const start = count => Array.from({ length: count }, (_, i) => ({
  radius: count === 1 ? .009 : .0072,
  position: { x: count === 1 ? 0 : Math.sin(i * 2.3) * .0015,
    y: -.0237 + (count === 1 ? .009 : .0072) * (.08 + i * .185),
    z: count === 1 ? 0 : Math.cos(i * 1.7) * .002 },
  rotation: { x: 0, y: 0, z: 0, w: 1 }
}));
const normal = q => [2*(q.x*q.y-q.w*q.z), 1-2*(q.x*q.x+q.z*q.z), 2*(q.y*q.z+q.w*q.x)];
const shake = t => [2.4*Math.sin(2*Math.PI*4.6*t), 2.8*Math.sin(2*Math.PI*4.7*t+.7), 1.9*Math.sin(2*Math.PI*3.2*t+1.1)];
const copy = value => structuredClone(value);
function bounds(poses, initial, tolerance = .0003) {
  poses.forEach((pose, i) => {
    const n = normal(pose.rotation), p = Object.values(pose.position);
    assert.ok([...p, ...Object.values(pose.rotation)].every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(...Object.values(pose.rotation))-1) < .001);
    p.forEach((v, a) => {
      const support = initial[i].radius * (Math.sqrt(Math.max(0, 1-n[a]*n[a])) + .08*Math.abs(n[a]));
      assert.ok(Math.abs(v)+support <= Object.values(size)[a]*[.48,.474,.48][a]+tolerance,
        `coin ${i} axis ${a} escaped: ${Math.abs(v)+support}`);
    });
  });
}

test('resting finite discs do not start an idle spin; disposal is idempotent', async () => {
  for (const count of [1, 8]) {
    const initial = start(count), model = await createCoinRigidBodies(size, initial);
    let poses;
    for(let i=0;i<=240;i++) poses=model.update({timeS:i/60,gravity,fill:1});
    bounds(poses,initial);
    assert.ok(poses.every(p=>normal(p.rotation)[1]>.99));
    const quiet=copy(poses);
    for(let i=241;i<=360;i++) poses=model.update({timeS:i/60,gravity,fill:1});
    poses.forEach((p,i)=>assert.ok(Math.hypot(...Object.values(p.position).map((v,a)=>v-Object.values(quiet[i].position)[a]))<.00015));
    model.dispose(); model.dispose();
  }
});

test('three-axis shake creates variable contact-driven turns, with all finite bodies contained', async () => {
  for (const count of [1,8]) {
    const initial=start(count), model=await createCoinRigidBodies(size, initial);
    let minNormal=1, maxHeight=-1, different=false;
    for(let i=0;i<=270;i++) {
      const poses=model.update({timeS:i/60,gravity,fill:1,acceleration:shake(i/60)});
      bounds(poses,initial);
      minNormal=Math.min(minNormal,...poses.map(p=>normal(p.rotation)[1]));
      maxHeight=Math.max(maxHeight,...poses.map(p=>p.position.y));
      if(count>1 && Math.max(...poses.map(p=>normal(p.rotation)[1]))-Math.min(...poses.map(p=>normal(p.rotation)[1]))>.3) different=true;
    }
    assert.ok(minNormal<-.8,`strong spatial shake can expose reverse face, normal=${minNormal}`);
    assert.ok(maxHeight>-.015,'vertical inertia actually lifts coins');
    if(count>1) assert.ok(different,'coins do not share one prescribed orientation');
    model.dispose();
  }
});

test('held source time, quiet gap, rewind and missing time have no gesture replay', async () => {
  const initial=start(1), model=await createCoinRigidBodies(size,initial);
  for(let i=0;i<=20;i++) model.update({timeS:i/60,gravity,fill:1,acceleration:[1.2,0,.4]});
  const moved=copy(model.update({timeS:20/60,gravity,fill:1}));
  for(let i=0;i<20;i++) assert.deepEqual(model.update({timeS:20/60,gravity,fill:1,acceleration:[8,-8,8]}),moved);
  assert.deepEqual(model.update({timeS:20,gravity,fill:1,acceleration:[8,-8,8]}),moved);
  assert.deepEqual(model.update({gravity,fill:1}),moved);
  assert.deepEqual(model.update({timeS:21,gravity,fill:1}),moved);
  const reset=model.update({timeS:0,gravity,fill:1});
  reset.forEach((p,i)=>Object.values(p.position).forEach((v,a)=>assert.ok(Math.abs(v-Object.values(initial[i].position)[a])<1e-8)));
  model.dispose();
});

test('invalid geometry is rejected before loading and input objects are not changed', async () => {
  await assert.rejects(()=>createCoinRigidBodies({...size,x:0},start(1)),RangeError);
  const initial=start(1), saved=copy(initial), input={timeS:0,gravity:{...gravity},fill:1,acceleration:[0,0,0]};
  const model=await createCoinRigidBodies(size,initial);
  model.update(input); model.update({...input,timeS:.1});
  assert.deepEqual(initial,saved); assert.deepEqual(input,{timeS:0,gravity,fill:1,acceleration:[0,0,0]});
  model.dispose();
});
