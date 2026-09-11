// Run with Node from any cwd. --generate refreshes the language-neutral corpus from the actual Web codec.
// Pass the directory printed by ProfileRegression.Run() to verify its exported files through the Web reader.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../../../../../..');
const require = createRequire(path.join(root, 'webxr/package.json'));
const { build } = require('esbuild');
async function moduleAt(relative) {
  const result = await build({entryPoints:[path.join(root, relative)], bundle:true, platform:'node', format:'esm', write:false, logLevel:'silent'});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const {parseProfile,serializeProfile} = await moduleAt('webxr/src/tuning/TuningProfile.ts');
const {createProfile} = await moduleAt('webxr/src/tuning/ProfileFromSession.ts');
const {createSession,recordChoice} = await moduleAt('webxr/src/tuning/TuningSession.ts');
const clone = value => JSON.parse(JSON.stringify(value));
if (process.argv.includes('--generate')) {
  const cases = [];
  const add = (name, json) => {
    let valid = true; try { parseProfile(json); } catch { valid = false; }
    cases.push({name, valid, json});
  };
  for (const demo of ['water','marble','sand']) for (const mode of ['device','rehearsal']) {
    let state=createSession(mode,[.6,.5,.4,.3,.7],'持った実物らしさ','同じ把持',42,{space:'combined',demo,fixed:{'tilt.k_phi':3.2}});
    state=recordChoice(state,'b');
    const p=createProfile(state); p.sourceSession.id=`web-fixture-${demo}-${mode}`; p.createdAt='2026-09-10T00:00:00.000Z';
    add(`${demo}-${mode}`, serializeProfile(p));
  }
  const base=parseProfile(cases[0].json); base.comparisonCount=0; base.reviewStatus='not-evaluated';
  const mutations = {
    'v2-water':p=>p.sourceSession.version=2,
    'year-zero':p=>p.createdAt='0000-02-29T00:00:00.000Z',
    'bad-format':p=>p.format='other', 'extra-history':p=>p.history=[], 'missing-reference':p=>delete p.reference,
    'v1':p=>p.sourceSession.version=1, 'source-fraction':p=>p.sourceSession.version=2.5,
    'bad-mode':p=>p.sourceSession.mode='physical-verified', 'bad-id':p=>p.sourceSession.id='../escape',
    'bad-review':p=>p.reviewStatus='self-reported-preference','negative-count':p=>p.comparisonCount=-1,
    'high-count':p=>p.comparisonCount=61,'fraction-count':p=>p.comparisonCount=.5,
    'bad-date':p=>p.createdAt='2026-09-10', 'rollover-date':p=>p.createdAt='2026-02-29T00:00:00.000Z',
    'extended-year':p=>p.createdAt='+010000-01-01T00:00:00.000Z',
    'objective-length':p=>p.objective='x'.repeat(301),'unknown-demo':p=>p.demo='soda','wrong-preset':p=>p.preset='granular_coin_box',
    'phi-zero':p=>p.parameters['tilt.k_phi']=0,'tilt-high':p=>p.parameters['tilt.max_tilt_deg']=10.01,
    'numeric-string':p=>p.parameters['tilt.k_cm']='.3','numeric-null':p=>p.parameters['tilt.k_tau']=null,
    'unknown-param':p=>p.parameters['audio.output_peak_limit']=.1,'missing-param':p=>delete p.parameters['tilt.k_cm'],
    'uncoupled':p=>p.parameters['mass.damping_ratio_y']+=.01,'near-coupled':p=>p.parameters['mass.damping_ratio_y']+=5e-10,
    'outside-coupled':p=>p.parameters['mass.damping_ratio_y']+=2e-9,
  };
  for(const [name,mutate] of Object.entries(mutations)){const p=clone(base);mutate(p);add(name,JSON.stringify(p));}
  for(const [name,json] of Object.entries({malformed:'{broken',null:'null',array:'[]',nan:JSON.stringify(base).replace('3.2','NaN'),
    trailing:JSON.stringify(base).replace(/}$/,',}'),comment:'/*comment*/'+JSON.stringify(base),
    single:JSON.stringify(base).replace('"format"',"'format'"),hex:JSON.stringify(base).replace('3.2','0x20'),
    utf8:'砂'.repeat(6000)})) add(name,json);
  const sand=parseProfile(cases.find(x=>x.name==='sand-device').json);
  for(const friction of [.2,.9]) for(const [label,dynamic] of [['scaled',friction*(7/11)],['fraction',friction*7/11]]){
    const p=clone(sand); p.parameters['mass.granular_static_friction']=friction;p.parameters['mass.granular_dynamic_friction']=dynamic;
    add(`sand-${friction}-${label}`,JSON.stringify(p));
  }
  fs.writeFileSync(path.join(directory,'profile-corpus.json'),JSON.stringify({format:'fresnel-profile-parity-v1',cases},null,2)+'\n');
}
const corpus=JSON.parse(fs.readFileSync(path.join(directory,'profile-corpus.json'),'utf8'));
for(const item of corpus.cases){let valid=true;try{parseProfile(item.json);}catch{valid=false;}assert.equal(valid,item.valid,item.name);}
const output=process.argv.slice(2).find(x=>x!=='--generate');
let count=0;
if(output) for(const item of corpus.cases.filter(x=>x.valid)){
  const parsed=parseProfile(fs.readFileSync(path.join(output,item.name+'.json'),'utf8'));
  assert.deepEqual(parsed,parseProfile(item.json),item.name);++count;
}
console.log(JSON.stringify({webCorpusCases:corpus.cases.length,unityRoundtrips:count,status:'passed'}));
