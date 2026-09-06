import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source=fs.readFileSync(new URL('../src/atlas/scenarioModel.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {ScenarioModel,projectCues}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const run=(m,seconds,rate=60)=>{for(let i=0;i<Math.round(seconds*rate);i++)m.advance(1/rate);return m.snapshot();};

test('one input trace gives exactly the same state at 30, 60 and 120 Hz',()=>{
  for(const scenario of ['magnet','pour','seed']){
    const results=[30,60,120].map(rate=>{const m=new ScenarioModel(scenario);m.setTilt(30);run(m,2,rate);m.shake();run(m,1,rate);m.setTilt(-20);return run(m,3,rate);});
    assert.deepEqual(results[0],results[1]);assert.deepEqual(results[1],results[2]);
  }
});
test('attachment holds position despite reversal; release is simultaneous with the event',()=>{
  const m=new ScenarioModel('magnet');m.setTilt(35);let f=run(m,3);
  assert.equal(f.attached,1);assert.equal(f.velocity,0);assert.equal(f.event,'attach');
  const count=f.eventCount;m.setTilt(-35);f=run(m,1);
  assert.equal(f.x,.82);assert.equal(f.eventCount,count);
  m.shake();f=m.advance(1/120);
  assert.equal(f.attached,0);assert.equal(f.event,'release');assert.ok(f.x<.82);assert.equal(f.eventCount,count+1);
});
test('pouring conserves nonnegative remaining amount and finishes with silence',()=>{
  const m=new ScenarioModel('pour');m.setTilt(35);let previous=1,empty;
  for(let i=0;i<900;i++){const f=m.advance(1/120);assert.ok(f.remaining<=previous&&f.remaining>=0);previous=f.remaining;if(f.remaining===0&&!empty)empty=f;}
  assert.ok(empty);assert.equal(empty.event,'empty');const f=run(m,3);
  assert.equal(f.remaining,0);assert.equal(f.eventCount,empty.eventCount);
  assert.deepEqual(projectCues(f).slow,[0,0]);assert.ok(f.pulses.every(p=>p<.00001));
  m.shake();assert.equal(m.advance(.1).eventCount,f.eventCount);
});
test('an upright vessel does not empty; easing upright stops the stream',()=>{
  const m=new ScenarioModel('pour');assert.equal(run(m,2).remaining,1);m.setTilt(30);run(m,1);m.setTilt(0);run(m,1);const remaining=m.snapshot().remaining;
  assert.equal(run(m,2).remaining,remaining);
});
test('the seed wakes from motion and settles while held; all cues share that state',()=>{
  const m=new ScenarioModel('seed');m.shake();const awake=m.advance(1/120);
  assert.equal(awake.event,'wake');assert.ok(awake.arousal>.7);const quiet=run(m,25);
  assert.ok(quiet.arousal<awake.arousal);assert.ok(Math.abs(quiet.x)<.15);
  const cue=projectCues(quiet);assert.equal(cue.centroid,quiet.x);assert.deepEqual(cue.fast,quiet.pulses);
});
test('snapshots and separate instances never share mutable event buffers',()=>{
  const a=new ScenarioModel(),b=new ScenarioModel();a.shake();a.advance(.1);const f=a.snapshot();f.pulses.fill(99);
  assert.ok(a.snapshot().pulses.every(p=>p<=1));assert.deepEqual(b.snapshot().pulses,[0,0,0,0]);
  a.reset('pour');assert.equal(a.snapshot().time,0);assert.equal(a.snapshot().eventCount,0);assert.equal(a.snapshot().remaining,1);
});
test('invalid or suspended-frame time cannot create a simulation explosion',()=>{
  const m=new ScenarioModel();const before=m.snapshot();for(const t of [NaN,Infinity,-1,0])m.advance(t);assert.deepEqual(m.snapshot(),before);
  m.setTilt(NaN);m.advance(1000);assert.ok(m.snapshot().time<=.10001);
  for(const n of Object.values(m.snapshot()).filter(v=>typeof v==='number'))assert.ok(Number.isFinite(n));
});
test('each proposed recipe has an explicit capability, limit, experiment and resolvable primary source',()=>{
  const data=JSON.parse(fs.readFileSync(new URL('../src/atlas/atlas-data.json',import.meta.url),'utf8'));
  const ids=new Set(data.sources.map(s=>s.id)),seen=new Set();
  assert.equal(ids.size,data.sources.length);
  for(const s of data.sources){assert.equal(new URL(s.url).protocol,'https:');assert.ok(s.claim&&s.transferLimit&&s.authors&&s.year);}
  for(const d of data.demos){assert.ok(!seen.has(d.id));seen.add(d.id);assert.ok(['presentation','software','tracking','hardware'].includes(d.feasibility));assert.ok(d.state&&d.slow&&d.fast&&d.additions&&d.limit&&d.experiment);assert.ok(d.sources.length>0);for(const id of d.sources)assert.ok(ids.has(id),`${d.id}: ${id}`);}
  for(const id of ['C04','C05','C06'])assert.equal(data.demos.find(d=>d.id===id).feasibility,'software');
});
