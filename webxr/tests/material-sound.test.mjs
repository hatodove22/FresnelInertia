import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { loadRecordedWater } from '../scripts/recorded-water.mjs';
import { loadRecordedSoda } from '../scripts/recorded-soda.mjs';
const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/audio/MaterialSound.ts', import.meta.url))], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
const { MaterialSound, impactSamples, flowSamples } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const recordedWater = await loadRecordedWater();
const recordedSoda = await loadRecordedSoda();

class Param {
  value = 0; calls = [];
  cancelScheduledValues(t) { this.calls.push(['cancel', t]); }
  setValueAtTime(v, t) { this.value = v; this.calls.push(['set', v, t]); }
  linearRampToValueAtTime(v, t) { this.calls.push(['ramp', v, t]); }
  setTargetAtTime(v, t, c) { this.calls.push(['target', v, t, c]); }
}
class Node {
  gain = new Param(); pan = new Param(); connections = []; stops = []; starts = [];
  connect(n) { this.connections.push(n); return n; }
  disconnect() { this.disconnected = true; }
  start(t) { this.starts.push(t); }
  stop(t) { this.stops.push(t); }
}
class Context {
  state = 'suspended'; currentTime = 0; sampleRate = 24000; destination = new Node(); sources = []; gains = []; buffers = []; resumes = 0;
  createGain() { const n = new Node(); this.gains.push(n); return n; }
  createStereoPanner() { return new Node(); }
  createDynamicsCompressor() { return Object.assign(new Node(), Object.fromEntries(['threshold', 'knee', 'ratio', 'attack', 'release'].map(k => [k, new Param()]))); }
  createBufferSource() { const n = new Node(); this.sources.push(n); return n; }
  createBuffer(ch, n, rate) { const b = { length:n, sampleRate:rate, copyToChannel(pcm) { this.pcm = pcm; } }; this.buffers.push(b); return b; }
  async resume() { this.resumes++; this.state = 'running'; }
  async close() { this.state = 'closed'; }
}
const frame = (timeS = 1, serial = 0, extra = {}) => ({ source: 'lab', preset: 'granular_coin_box', timeS, serial, step: Math.round(timeS * 100), material: 'coin', flow: 0, pan:0, events: [], ...extra });
const impact = { kind:'impact', strength:0.8, pan:-0.6 };
async function fakeBank(ctx) {
  const bank = new Map();
  const add = (key, pcm) => { const buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate); buffer.copyToChannel(pcm, 0); bank.set(key, buffer); };
  for (const material of ['coin','marble','sand','water','soda','hybrid']) {
    const wet = ['water', 'hybrid', 'soda'].includes(material), recordedMaterial = material === 'soda' ? 'water' : material;
    add(`flow:${material}`, wet ? recordedWater.clip(recordedMaterial, 'flow') : flowSamples(material, ctx.sampleRate));
    for (const kind of ['impact','scrape']) for (let n=0;n<4;n++) add(`${material}:${kind}:${n}`,
      wet ? recordedWater.clip(recordedMaterial, kind, n) : impactSamples(material,kind,ctx.sampleRate,n+1));
  }
  for (let n=0;n<4;n++) add(`pop:${n}`,recordedSoda.clip('pop',n));
  add('vent:soda',recordedSoda.clip('vent'));
  return bank;
}
function fixture(loader = fakeBank) { const ctx = new Context(); let allocated = 0; const sound = new MaterialSound(() => { allocated++; return ctx; }, loader); return { sound, ctx, allocated: () => allocated }; }

test('heart doublet plays only named source beats, reuses its short thud and cancels on pause', async () => {
  const { sound, ctx } = fixture(); await sound.enable();
  const heart = { preset: 'heartbeat_soft_object', material: 'heartbeat', flow: 0 };
  sound.update(frame(1, 0, heart));
  sound.update(frame(1.1, 1, { ...heart, events: [{ kind: 'beat', strength: .95, pan: 0 }] }));
  assert.equal(ctx.sources.length, 1);
  const buffer = ctx.sources[0].buffer;
  assert.equal(buffer.length, Math.round(.17 * ctx.sampleRate));
  sound.update(frame(1.1, 1, { ...heart, events: [{ kind: 'beat', strength: .95, pan: 0 }] }));
  assert.equal(ctx.sources.length, 1, 'duplicate telemetry cannot retrigger');
  sound.update(frame(1.3, 2, { ...heart, events: [{ kind: 'beat', strength: .55, pan: 0 }] }));
  assert.equal(ctx.sources.length, 2); assert.equal(ctx.sources[1].buffer, buffer);
  assert.ok(ctx.sources[1].connections[0].gain.value < ctx.sources[0].connections[0].gain.value);
  assert.ok(ctx.sources.every(source => !source.loop && source.playbackRate === undefined));
  sound.update(null);
  assert.ok(ctx.sources.every(source => source.stops.length === 1));
  sound.update(frame(2.5, 5, { ...heart, events: [{ kind: 'beat', strength: .95, pan: 0 }] }));
  assert.equal(ctx.sources.length, 2, 'resume baselines without replaying missed beats');
});

test('material waveforms are deterministic, bounded, nonempty and acoustically distinct', () => {
  const signatures = new Set();
  for (const material of ['coin','marble','sand','water','soda','hybrid']) {
    for (const kind of ['impact','scrape','pop']) {
      const pcm = impactSamples(material, kind, 24000, 8);
      assert.deepEqual(pcm, impactSamples(material, kind, 24000, 8));
      assert.ok(pcm.every(Number.isFinite));
      assert.ok(pcm.every(v => Math.abs(v) < 0.86));
      assert.ok(pcm.reduce((s,v) => s+v*v,0) / pcm.length > 0.00001);
      assert.equal(Math.abs(pcm[0]), 0); assert.ok(Math.abs(pcm.at(-1)) < 0.002);
      if (kind === 'impact') signatures.add(pcm.slice(0,200).join(','));
    }
    const flow = flowSamples(material, 24000);
    assert.equal(flow.length, 48000); assert.equal(Math.abs(flow[0]), 0); assert.equal(Math.abs(flow.at(-1)), 0);
    assert.ok(flow.every(v => Number.isFinite(v) && Math.abs(v) < 0.81));
  }
  assert.equal(signatures.size, 6, 'all six materials have their own authored impact texture');
});

test('sample bank loads only after explicit enable, stays silent while pending and is reused', async () => {
  let finish, loads=0;
  const { sound, ctx } = fixture(async context => { loads++; await new Promise(resolve => { finish=resolve; }); return fakeBank(context); });
  assert.equal(loads,0);
  const pending = sound.enable(); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(loads,1); assert.equal(sound.running,false);
  sound.update(frame()); sound.update(frame(1.1,1,{events:[impact],flow:1}));
  assert.equal(ctx.sources.length,0);
  finish(); await pending; assert.equal(sound.running,true);
  sound.mute(); await sound.enable(); assert.equal(loads,1);
});

test('bank failure is visible and retryable; mute/dispose cannot be undone by a late load', async () => {
  let fail = true;
  const {sound,ctx} = fixture(async context => { if(fail) throw Error('asset unavailable'); return fakeBank(context); });
  await sound.enable(); assert.equal(sound.enabled,false); assert.match(sound.error,/asset unavailable/);
  assert.equal(ctx.sources.length,0);
  fail=false; await sound.enable(); assert.equal(sound.running,true);
  for(const dispose of [false,true]) {
    let finish;
    const f=fixture(async context=>{ await new Promise(resolve=>{finish=resolve;}); return fakeBank(context); });
    const pending=f.sound.enable(); await new Promise(resolve=>setImmediate(resolve));
    if(dispose) await f.sound.dispose(); else f.sound.mute();
    finish(); await pending;
    assert.equal(f.sound.running,false); assert.equal(f.ctx.sources.length,0);
  }
});

test('contacts use predecoded variations at their original pitch without making new PCM', async () => {
  const {sound,ctx}=fixture(); await sound.enable(); const count=ctx.buffers.length;
  sound.update(frame());
  for(let n=1;n<=4;n++) sound.update(frame(1+n*.05,n,{events:[impact]}));
  assert.equal(ctx.buffers.length,count); assert.equal(new Set(ctx.sources.map(source=>source.buffer)).size,4);
  assert.ok(ctx.sources.every(source=>source.playbackRate===undefined),'player never adds a frequency glide');
});

test('no AudioContext or output before explicit enable, including default previews and volume edit', async () => {
  const { sound, ctx, allocated } = fixture();
  sound.update(frame(1,3,{events:[impact],flow:1})); sound.setVolume(0.2);
  assert.equal(allocated(),0); assert.equal(sound.enabled,false);
  await sound.enable(); assert.equal(allocated(),1); assert.equal(ctx.resumes,1);
  assert.equal(ctx.gains[0].gain.value,0.2); assert.equal(ctx.sources.length,0);
  sound.update(frame(1,3,{events:[impact]})); assert.equal(ctx.sources.length,0,'entry does not replay historical event');
});

test('fresh events play once; duplicate snapshots do not renew the short continuous envelope', async () => {
  const { sound, ctx } = fixture(); await sound.enable();
  sound.update(frame());
  sound.update(frame(1.1,1,{events:[impact],flow:0.5}));
  assert.equal(ctx.sources.length,2); assert.equal(ctx.sources.filter(s=>s.loop).length,1);
  const continuousGain = ctx.sources[0].connections[0].gain;
  const before = continuousGain.calls.length;
  ctx.currentTime = 0.1; sound.update(frame(1.1,1,{events:[impact],flow:0.5}));
  assert.equal(ctx.sources.length,2); assert.equal(continuousGain.calls.length,before);
  assert.deepEqual(continuousGain.calls.at(-1), ['ramp',0,0.26]);
});

test('pause/mute/source switch cancel old tails and dispose nodes, then baseline without backlog', async () => {
  const { sound, ctx } = fixture(); await sound.enable(); sound.update(frame());
  sound.update(frame(1.1,1,{events:[impact],flow:1})); const old = [...ctx.sources];
  sound.update(null); assert.ok(old.every(s=>s.stops.length===1 && s.stops[0] <= ctx.currentTime+0.02));
  old.forEach(s=>s.onended()); assert.ok(old.every(s=>s.disconnected));
  sound.update(frame(1.1,1,{events:[impact]})); assert.equal(ctx.sources.length,2);
  sound.update(frame(1.2,2,{events:[impact]})); assert.equal(ctx.sources.length,2,'first fresh resume sample baselines');
  sound.update(frame(1.3,3,{events:[impact]})); assert.equal(ctx.sources.length,3);
  sound.update(frame(1.4,99,{preset:'granular_single_coin_box',events:[impact]}));
  assert.equal(ctx.sources.length,3); assert.equal(ctx.sources[2].stops.length,1);
  sound.mute(); sound.update(frame(1.5,100,{events:[impact],flow:1}));
  assert.equal(ctx.sources.length,3); assert.equal(sound.enabled,false);
  await sound.dispose(); assert.equal(ctx.state,'closed');
});

test('busy event streams have bounded polyphony; volume remains a local bounded mix control', async () => {
  const {sound,ctx} = fixture(); await sound.enable(); sound.update(frame());
  for(let i=1;i<100;i++) sound.update(frame(1+i*0.01,i,{events:[impact,impact,impact,impact],flow:1}));
  assert.ok(ctx.sources.length<=9);
  sound.setVolume(100); assert.equal(sound.volume,1);
  sound.setVolume(NaN); assert.equal(sound.volume,0);
  assert.equal(ctx.gains[0].gain.calls.at(-1)[1],0);
});

test('audio unlock rejection is visible and retryable, and mute cancels a late unlock', async () => {
  const {sound,ctx} = fixture(); ctx.resume = async()=>{ throw Error('blocked'); };
  await sound.enable(); assert.equal(sound.enabled,false); assert.match(sound.error,/blocked/);
  let finish; ctx.resume = ()=>new Promise(resolve=>{ finish=()=>{ctx.state='running';resolve();}; });
  const pending = sound.enable(); sound.mute(); finish(); await pending;
  assert.equal(sound.enabled,false);
  ctx.resume = Context.prototype.resume; await sound.enable(); assert.equal(sound.running,true);
});

test('soda opening takes priority over dense ordinary events and an already-full voice pool', async () => {
  const {sound,ctx} = fixture(); await sound.enable();
  const soda = (t,n,events=[]) => frame(t,n,{preset:'liquid_soda_bottle',material:'soda',flow:1,popSerial:n<5?0:1,events});
  sound.update(soda(1,0));
  // Fill the ordinary pool first to verify opening priority independently of
  // the stricter recorded-liquid overlap cap.
  for(let i=1;i<5;i++) sound.update({...soda(1+i*0.01,i,[impact,impact,impact,impact]),material:'coin'});
  assert.equal(ctx.sources.length,9);
  sound.update({...soda(1.05,5,[{kind:'pop',strength:1,pan:0},impact,impact,impact,impact]),vent:1});
  assert.equal(ctx.sources.length,10,'one ordinary ringing voice is replaced, not an unbounded addition');
  assert.equal(ctx.sources.at(-1).buffer.length/ctx.sampleRate,0.48);
  assert.equal(ctx.sources.filter(s=>s.stops.length).length,1);
  sound.update(soda(1.06,6,[{kind:'pop',strength:1,pan:0}]));
  assert.equal(ctx.sources.length,10,'same burst still never opens twice');
});

test('soda fizz follows accepted vent level only and stops on spent, pause and mute without reopening', async () => {
  const {sound,ctx}=fixture(); await sound.enable();
  const soda=(t,n,vent,events=[])=>frame(t,n,{preset:'liquid_soda_bottle',material:'soda',flow:0.8,vent,popSerial:vent>0?1:0,events});
  sound.update(soda(1,0,0));
  sound.update(soda(1.1,1,0,[impact]));
  assert.equal(ctx.sources.filter(s=>s.loop).length,1,'sealed shaking has a water bed, not fizz');
  sound.update(soda(1.2,2,0.9,[{kind:'pop',strength:1,pan:0}]));
  const fizz=ctx.sources.find(s=>s.loop&&s.buffer.length/ctx.sampleRate===3.6);
  assert.ok(fizz); assert.equal(fizz.stops.length,0);
  const calls=fizz.connections[0].gain.calls.length;
  sound.update(soda(1.2,2,0.9));
  assert.equal(fizz.connections[0].gain.calls.length,calls,'same-time metadata cannot prolong fizz');
  sound.update(soda(1.3,3,0.1));
  assert.ok(fizz.connections[0].gain.calls.some(c=>c[0]==='ramp'&&c[1]===0.1**0.7*0.48));
  sound.update(soda(1.4,4,0));
  assert.equal(fizz.stops.length,1,'spent/zero vent cuts the fizz tail');
  const count=ctx.sources.length;
  sound.update(soda(1.5,4,0)); assert.equal(ctx.sources.length,count);
  sound.silence(); sound.update(soda(1.5,4,0)); assert.equal(ctx.sources.length,count);
  sound.update(soda(1.6,5,0.5)); // Current fizz can baseline; historical pop cannot replay.
  const resumed=ctx.sources.findLast(s=>s.loop&&s.buffer.length/ctx.sampleRate===3.6);
  assert.ok(resumed!==fizz);
  sound.mute(); assert.equal(resumed.stops.length,1);
  sound.update(soda(1.7,6,0.5,[{kind:'pop',strength:1,pan:0}]));
  assert.equal(ctx.sources.filter(s=>!s.loop&&s.buffer.length/ctx.sampleRate===0.48).length,1);
  await sound.dispose();
});

test('water and ice/water voice one broad strongest splash per fresh contact window, without a replay queue', async () => {
  for (const material of ['water', 'hybrid']) {
    const { sound, ctx } = fixture(); await sound.enable();
    const wet = (t, n, events = [], flow = 0) => frame(t, n, { preset: material, material, events, flow });
    sound.update(wet(1, 0));
    const strong = {kind:'impact',strength:0.81,pan:0.6};
    sound.update(wet(1.1, 1, [{...impact,strength:0.1}, strong, {...impact,strength:0.4}], 1));
    assert.equal(ctx.sources.length, 2, 'one low wash loop and one splash, not three splashes');
    const splash = ctx.sources.find(s => !s.loop);
    assert.ok(splash.buffer.length / ctx.sampleRate > 0.5, 'broad liquid body, not the old short hiss');
    assert.equal(splash.connections[0].gain.value, Math.sqrt(0.81) * 0.52);
    assert.equal(splash.connections[0].connections[0].pan.value, 0.6);
    const wash = ctx.sources.find(s => s.loop);
    assert.equal(wash.buffer.length / ctx.sampleRate, 5.8);
    assert.ok(wash.connections[0].gain.calls.some(call => call[0] === 'ramp' && call[1] === (material === 'water' ? 0.38 : 0.34)));
    sound.update(wet(1.15, 2, [strong]));
    sound.update(wet(1.3, 2));
    assert.equal(ctx.sources.length, 2, 'discarded contacts never arrive later as a delayed splash');
    sound.update(wet(1.5, 3, [strong]));
    assert.equal(ctx.sources.length, 3, 'another real contact can voice the returning water');
    sound.update(wet(1.5, 3, [strong]));
    assert.equal(ctx.sources.length, 3, 'repeated source frame cannot repeat a splash');
    sound.silence();
    assert.ok(ctx.sources.every(s => s.stops.length === 1), 'pause cancels the new longer liquid tails too');
    sound.update(wet(1.5, 3, [strong]));
    sound.update(wet(1.51, 4, [strong])); // First advancing frame is a quiet baseline.
    assert.equal(ctx.sources.length, 3);
    sound.update(wet(1.52, 5, [strong]));
    assert.equal(ctx.sources.length, 4, 'restart clears the old contact window');
    await sound.dispose();
  }
});

test('liquid flow without contacts cannot start autonomous splash accents', async () => {
  const { sound, ctx } = fixture(); await sound.enable();
  for (let n=0;n<20;n++) sound.update(frame(1+n*.1, 0, {preset:'water',material:'water',flow:n<8?0.8:0}));
  assert.equal(ctx.sources.length, 1);
  assert.equal(ctx.sources[0].loop, true);
  assert.deepEqual(ctx.sources[0].connections[0].gain.calls.at(-1), ['ramp',0,0.26]);
  await sound.dispose();
});

test('energetic liquid flow events voice the broad slosh while gentle wet motion keeps its shorter sample', async () => {
  for (const material of ['water', 'hybrid']) {
    const {sound,ctx} = fixture(); await sound.enable();
    const wet = (t,n,flow) => frame(t,n,{preset:material,material,flow,
      events:[{kind:'scrape',strength:0.2,pan:-0.3}]});
    sound.update(wet(1,0,0));
    sound.update(wet(1.1,1,0.05));
    assert.equal(ctx.sources.at(-1).buffer.length,recordedWater.clip(material,'scrape',1).length);
    sound.update(wet(1.5,2,0.7));
    assert.ok(ctx.sources.at(-1).buffer.length/ctx.sampleRate>=0.9);
    assert.equal(ctx.sources.at(-1).connections[0].gain.value,Math.sqrt(0.2)*0.52);
    const count=ctx.sources.length;
    sound.update(wet(1.6,2,0.9));
    assert.equal(ctx.sources.length,count,'high flow without a fresh event cannot generate a slosh');
    await sound.dispose();
  }
});

test('recorded water accents leave 350 ms source time, cap overlap at two and never replay dropped batches', async () => {
  const { sound, ctx } = fixture(); await sound.enable();
  const wet = (timeS, serial, events = [impact]) => frame(timeS, serial, {preset:'water', material:'water', flow:1, events});
  sound.update(wet(1, 0));
  sound.update(wet(1.1, 1));
  sound.update(wet(1.3, 2));
  assert.equal(ctx.sources.length, 2, 'old 120 ms cadence must not retrigger a recorded splash');
  sound.update(wet(1.5, 3));
  sound.update(wet(1.9, 4));
  assert.equal(ctx.sources.length, 3, 'only a wash plus two live recorded accents');
  ctx.sources.find(source => !source.loop).onended();
  sound.update(wet(2.0, 4, []));
  assert.equal(ctx.sources.length, 3, 'a free voice does not release dropped events');
  sound.update(wet(2.1, 5));
  assert.equal(ctx.sources.length, 4, 'a new source contact can use the freed voice');
  await sound.dispose();
});
