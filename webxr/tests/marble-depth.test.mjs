import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const built=await build({entryPoints:[fileURLToPath(new URL('../src/renderer/ContainerScene.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {ContainerScene}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const preset={preset:'granular_single_marble_box',family:'Granular',container:{span_x_m:.08,span_y_m:.12,span_z_m:.05,fill:.1,particle_count:.03,particle_hardness:.9}};
const quiet={surfaceOffsetX:0,surfaceOffsetY:0,surfaceVelocityX:0,surfaceVelocityY:0,agitation:0,particleSpread:0,impactPulse:0,wavePrimary:0,waveSecondary:0};
const state={massX:.3,massY:-1,velocityX:0,velocityY:0,energy:0,fill:.1,phaseS:0};
const mesh=s=>s.group.getObjectByName('content-particles');
const matrix=s=>Array.from(mesh(s).instanceMatrix.array);
const position=s=>matrix(s).slice(12,15);
function tick(scene,time,pitch=0,motion=state) {
  scene.setDeviceState({...motion,phaseS:time});
  scene.setDeviceOrientation({pitchRad:pitch,rollRad:0});
  scene.update({x:0,y:0},quiet,time,1/60);
}

test('marble adds signed pitch travel and visible rolling without replacing reported x/y or appearance',()=>{
  for(const sign of [-1,1]) {
    const scene=new ContainerScene(); scene.setPreset(preset,true); tick(scene,0);
    const start=position(scene), color=mesh(scene).material.color.getHex(), roughness=mesh(scene).material.roughness;
    for(let i=1;i<=60;i++) tick(scene,i/60,sign*Math.PI/6);
    const result=position(scene);
    assert.equal(result[0],start[0]); assert.equal(result[1],start[1]);
    assert.ok(result[2]*sign>.015); assert.ok(Math.abs(result[2])+.00425<=.02500001);
    assert.equal(mesh(scene).material.color.getHex(),color); assert.equal(mesh(scene).material.roughness,roughness);
    const oldZ=result[2]; tick(scene,1.1,sign*Math.PI/6,{...state,massX:-.8,massY:.2});
    assert.ok(position(scene)[0]<0&&position(scene)[1]>0); assert.equal(position(scene)[2],oldZ);
    scene.dispose();
  }
});

test('source pause/stale holds the actual marble matrix; rewind/replacement has no retained depth',()=>{
  const scene=new ContainerScene(); scene.setPreset(preset,true); tick(scene,0);
  for(let i=1;i<15;i++) tick(scene,i/60,.4);
  const before=matrix(scene); assert.ok(position(scene)[2]>0);
  for(let i=0;i<5;i++) scene.update({x:1,y:1},quiet,999+i,20);
  assert.deepEqual(matrix(scene),before);
  tick(scene,14/60,-.6); assert.deepEqual(matrix(scene),before,'duplicate accepted sample cannot drive local depth');
  tick(scene,0,.4); assert.equal(position(scene)[2],0);
  tick(scene,.1,.4); assert.ok(position(scene)[2]>0);
  tick(scene,10,.4); assert.equal(position(scene)[2],0);
  scene.setPreset(preset,true); tick(scene,10.1,.4); assert.equal(position(scene)[2],0);
  scene.setDeviceState(null); scene.setDeviceState(state); tick(scene,10.2,.4); assert.equal(position(scene)[2],0);
  scene.dispose();
});

test('neutral and missing-time marble presentation retain the old centered depth exactly',()=>{
  const scene=new ContainerScene(); scene.setPreset(preset,true); tick(scene,0);
  const baseline=matrix(scene);
  for(let i=1;i<=60;i++) tick(scene,i/60);
  assert.deepEqual(matrix(scene),baseline);
  scene.setDeviceState(state); scene.setDeviceOrientation({pitchRad:.5,rollRad:0});
  scene.update({x:0,y:0},quiet,100,3); assert.equal(position(scene)[2],0);
  scene.setDeviceState({...state,phaseS:undefined}); scene.update({x:0,y:0},quiet,200,3);
  assert.equal(position(scene)[2],0);
  scene.dispose();
});
