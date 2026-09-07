// Exercise the shipped tuning page through its real DOM, downloaded archive and
// localStorage. Rehearsal runs the C++ model; no fake app hooks or device output.
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.FRESNEL_PLAYWRIGHT_MODULE || 'playwright');
const url = new URL('tune.html', process.env.FRESNEL_DEMO_URL || 'http://127.0.0.1:8082/');
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--mute-audio', ...(process.env.FRESNEL_SOFTWARE_WEBGL === '1'
    ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [])] });
const page = await browser.newPage({ viewport: { width: 1100, height: 850 }, acceptDownloads: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const output = new URL('../../tmp/browser/', import.meta.url);
await mkdir(output, { recursive: true });
const prefix = 'fresnel-preference-v1:';

await page.addInitScript(() => {
  const forbidden = [];
  const block = name => () => { forbidden.push(name); throw new Error(`Unexpected tuning-test IO: ${name}`); };
  Object.defineProperty(navigator, 'serial', { configurable: true, value: {
    requestPort: block('serial.requestPort'), getPorts: block('serial.getPorts') } });
  Object.defineProperty(navigator, 'usb', { configurable: true, value: {
    requestDevice: block('usb.requestDevice'), getDevices: block('usb.getDevices') } });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: block('camera'), getDisplayMedia: block('screen') } });
  window.AudioContext = block('audio');
  if (window.webkitAudioContext) window.webkitAudioContext = block('audio');
  HTMLMediaElement.prototype.play = block('media.play');
  window.__tuningForbiddenIO = forbidden;
});

const ready = () => page.waitForFunction(() => !document.querySelector('#new-session')?.disabled, null, { timeout: 30000 });
const activeArchive = () => page.evaluate(() => JSON.parse(localStorage.getItem(document.querySelector('#saved').value)));
const archiveFor = id => page.evaluate(key => JSON.parse(localStorage.getItem(key)), prefix + id);
const voteButton = choice => page.locator(`[data-choice="${choice}"]`);
async function votesLocked() {
  for (const choice of ['a', 'b', 'tie']) assert.equal(await voteButton(choice).isDisabled(), true,
    `${choice} requires both candidates to be checked in this session visit`);
}
async function tested(slot) {
  await page.locator(`#apply-${slot}`).click();
  await page.waitForFunction(name => document.querySelector(`#card-${name}`)?.dataset.tested === 'true', slot);
  await ready();
  assert.match(await page.locator(`#state-${slot}`).textContent(), /C\+\+.*練習/);
}
async function bothCandidates() {
  await tested('a');
  await votesLocked();
  await tested('b');
  for (const choice of ['a', 'b', 'tie']) assert.equal(await voteButton(choice).isDisabled(), false);
  assert.equal(await page.locator('#response polyline').count(), 2, 'both actual C++ envelopes are displayed');
  for (const line of await page.locator('#response polyline').all()) {
    const points = (await line.getAttribute('points')).split(' ');
    assert.equal(points.length, 400, 'each simulation uses the same 400-step input');
    assert.ok(points.every(point => point.split(',').every(number => Number.isFinite(Number(number)))));
  }
}
async function importJSON(text, name) {
  await page.locator('#import').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
  await ready();
}
async function openSaved() {
  await page.locator('#saved').evaluate(select => {
    const details = select.closest('details');
    if (!details.open) details.querySelector('summary').click();
  });
}
async function noIO() {
  assert.deepEqual(await page.evaluate(() => window.__tuningForbiddenIO), []);
  assert.match(await page.locator('#output-state').textContent(), /実機未接続.*未確認/);
}

try {
  await page.goto(url.href, { waitUntil: 'networkidle' });
  await ready();
  assert.equal(await page.locator('vite-error-overlay').count(), 0);
  assert.equal(await page.locator('#mode').inputValue(), 'rehearsal');
  assert.equal(await page.locator('#reference').inputValue(), '', 'a reference memo is optional');
  assert.equal(await page.locator('#device-controls').isHidden(), true);
  await noIO();

  await page.locator('#new-session').click();
  await ready();
  const initial = await activeArchive();
  assert.equal(initial.format, 'haptic-preference-v3');
  assert.equal(initial.session.demo, 'water');
  assert.equal(initial.session.space, 'combined');
  assert.equal(initial.session.baseline.length, 5);
  assert.deepEqual(Object.keys(initial.session.fixed), ['tilt.k_phi']);
  assert.equal(await page.locator('#map-x option').count(), 5);
  assert.match(await page.locator('.keyboard-guide').textContent(), /Q.*Aを提示.*W.*Bを提示/);
  assert.equal(initial.session.reference, '');
  assert.equal(initial.session.mode, 'rehearsal');
  assert.equal(initial.session.trial.id, 1);
  assert.deepEqual(initial.receipts, [], 'no physical application receipts are invented in rehearsal');
  await votesLocked();
  assert.equal(await voteButton('skip').isDisabled(), false, 'unknown judgments can be skipped without fabricated preference');
  await bothCandidates();
  assert.equal(await page.locator('#tilt-response polyline').count(), 4, 'two fingers for each candidate');
  await page.locator('#map-x').selectOption('3');
  await page.locator('#map-y').selectOption('4');
  assert.deepEqual(await activeArchive(), initial, 'map projection is not a change to the joint search');
  await page.locator('#note').fill('練習で同じくらい。触感評価ではない。');
  await voteButton('tie').click();
  await ready();
  let record = await activeArchive();
  assert.equal(record.session.history.length, 1);
  assert.equal(record.session.history[0].choice, 'tie');
  assert.equal(record.session.observations.length, 1);
  assert.equal(record.session.observations[0].preference, 'tie');
  assert.equal(record.session.trial.id, 2);
  await votesLocked();
  assert.equal(await page.locator('#response polyline').count(), 0, 'the next pair does not autoplay');
  await voteButton('skip').click();
  await ready();
  record = await activeArchive();
  assert.equal(record.session.history.length, 2);
  assert.equal(record.session.history[1].choice, 'skip');
  assert.equal(record.session.observations.length, 1, 'skip does not become a tie or a numeric score');
  assert.equal(record.session.trial.id, 3);
  await bothCandidates();
  const beforeExport = await activeArchive();
  const pending = page.waitForEvent('download');
  await page.locator('#export').click();
  const download = await pending;
  assert.match(download.suggestedFilename(), /^haptic-tuning-rehearsal-.*\.json$/);
  const exported = await readFile(await download.path(), 'utf8');
  assert.deepEqual(JSON.parse(exported), beforeExport, 'download contains the same persisted active A/B pair and history');
  await download.saveAs(fileURLToPath(new URL('tuning-rehearsal-export.json', output)));
  await page.screenshot({ path: fileURLToPath(new URL('tuning-rehearsal-desktop.png', output)), fullPage: true });
  await noIO();

  // Reload has no implied play/confirmation. Resume uses the actual saved list.
  await page.reload({ waitUntil: 'networkidle' });
  await ready();
  await votesLocked();
  await openSaved();
  await page.locator('#saved').selectOption(prefix + beforeExport.session.id);
  await page.locator('#resume').click();
  await ready();
  assert.deepEqual(await activeArchive(), beforeExport, 'resume retains the exact in-progress pair');
  await votesLocked();
  assert.equal(await page.locator('#card-a').getAttribute('data-tested'), 'false');
  assert.equal(await page.locator('#card-b').getAttribute('data-tested'), 'false');
  await bothCandidates();
  await importJSON(exported, 'same-session.json');
  assert.deepEqual(await activeArchive(), beforeExport);
  await votesLocked();
  assert.equal(await page.locator('#response polyline').count(), 0, 'import resets tasted flags and displayed simulation');

  await importJSON('{"format":"haptic-preference-v1","session":', 'broken-session.json');
  assert.match(await page.locator('#status').textContent(), /JSON|Unexpected|Expected|未完|形式/i);
  assert.deepEqual(await archiveFor(beforeExport.session.id), beforeExport, 'corrupt import cannot overwrite saved history');
  assert.equal(await page.locator('#history li').count(), 2, 'corrupt import also retains the visible active session');
  const corrupt = JSON.parse(exported); corrupt.session.observations = [];
  await importJSON(JSON.stringify(corrupt), 'mixed-counts.json');
  assert.match(await page.locator('#status').textContent(), /history|vote count/i);
  assert.deepEqual(await archiveFor(beforeExport.session.id), beforeExport);
  await importJSON(exported, 'recovered-session.json');
  assert.deepEqual(await activeArchive(), beforeExport, 'a valid import still succeeds after corruption');

  // Entering device mode is not authorization to find/connect/start a dongle.
  await page.locator('#mode').selectOption('device');
  await ready();
  assert.equal(await page.locator('#device-controls').isVisible(), true);
  assert.equal(await page.locator('#saved option').count(), 0, 'rehearsal histories are filtered out of the device workspace');
  await noIO();
  await page.locator('#new-session').click();
  await ready();
  const device = await activeArchive();
  assert.equal(device.session.mode, 'device');
  assert.notEqual(device.session.id, beforeExport.session.id);
  for (const slot of ['a', 'b']) {
    assert.equal(await page.locator(`#apply-${slot}`).isDisabled(), true);
    assert.equal(await page.locator(`#start-${slot}`).isDisabled(), true);
  }
  await importJSON(exported, 'wrong-mode.json');
  assert.match(await page.locator('#status').textContent(), /mode/i);
  assert.deepEqual(await archiveFor(device.session.id), device);
  assert.deepEqual(await archiveFor(beforeExport.session.id), beforeExport);
  await noIO();

  await page.locator('#mode').selectOption('rehearsal');
  await ready();
  await openSaved();
  assert.equal(await page.locator('#saved option').count(), 1, 'mode-specific records stay distinct');
  await page.locator('#saved').selectOption(prefix + beforeExport.session.id);
  await page.locator('#resume').click();
  await ready();
  assert.deepEqual(await activeArchive(), beforeExport);
  await votesLocked();
  // Reference/preferred replay is a review, not another judgment or substitute
  // for checking both members of the active comparison.
  for (const slot of ['baseline', 'preferred']) {
    await page.locator(`#${slot}`).click();
    await ready();
    assert.deepEqual(await activeArchive(), beforeExport, `${slot} review does not vote or replace the active pair`);
    await votesLocked();
    assert.equal(await page.locator('#card-a').getAttribute('data-tested'), 'false');
    assert.equal(await page.locator('#card-b').getAttribute('data-tested'), 'false');
  }
  assert.equal(await page.locator('#response polyline').count(), 2, 'baseline and preferred review each run the real C++ model');
  await page.setViewportSize({ width: 412, height: 915 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
    'phone-width tuning has no horizontal overflow');
  await page.screenshot({ path: fileURLToPath(new URL('tuning-rehearsal-mobile.png', output)), fullPage: true });
  await page.locator('#stop').click();
  await noIO();

  // Simulate a real browser quota/privacy failure at the storage boundary. The
  // app must keep the unsaved in-memory vote and persistent warning, then allow
  // its normal download button to rescue the current archive.
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key.startsWith('fresnel-preference-v1:'))
        throw new DOMException('Simulated quota exhausted', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.locator('#note').fill('保存失敗中の練習記録もJSONで残す');
  await voteButton('skip').click();
  await ready();
  assert.equal(await page.locator('#storage-warning').isVisible(), true);
  assert.equal(await page.locator('#history li').count(), 3, 'failed persistence still keeps the current in-memory history');
  assert.deepEqual(await archiveFor(beforeExport.session.id), beforeExport, 'a failed write leaves the previous saved archive intact');
  await page.locator('#baseline').click();
  await ready();
  assert.equal(await page.locator('#storage-warning').isVisible(), true, 'later normal status messages cannot hide the save warning');
  const rescuePending = page.waitForEvent('download');
  await page.locator('#export').click();
  const rescue = await rescuePending;
  const rescued = JSON.parse(await readFile(await rescue.path(), 'utf8'));
  assert.equal(rescued.session.id, beforeExport.session.id);
  assert.equal(rescued.session.history.length, 3);
  assert.equal(rescued.session.history[2].choice, 'skip');
  assert.equal(rescued.session.history[2].note, '保存失敗中の練習記録もJSONで残す');
  assert.equal(rescued.session.trial.id, 4);
  assert.deepEqual(rescued.session.baseline, beforeExport.session.baseline);
  assert.deepEqual(rescued.session.observations, beforeExport.session.observations);
  assert.equal(await page.locator('#storage-warning').isVisible(), true, 'export does not falsely report local persistence recovery');
  await rescue.saveAs(fileURLToPath(new URL('tuning-unsaved-rescue.json', output)));
  await page.screenshot({ path: fileURLToPath(new URL('tuning-storage-warning-mobile.png', output)), fullPage: true });
  await noIO();

  // A reusable selection is NOT a migrated likelihood/history. Check all three
  // actual material models and continuous-value transfer through real controls.
  await page.reload({waitUntil:'networkidle'}); await ready();
  await openSaved(); await page.locator('#saved').selectOption(prefix+beforeExport.session.id);
  await page.locator('#resume').click(); await ready();
  await page.locator('#save-profile').click();
  assert.match(await page.locator('#profile-detail').textContent(),/練習のみ.*触感未評価/);
  const profilePending=page.waitForEvent('download'); await page.locator('#export-profile').click();
  const profileDownload=await profilePending;
  const profileJSON=await readFile(await profileDownload.path(),'utf8');
  const waterProfile=JSON.parse(profileJSON);
  assert.equal(waterProfile.format,'haptic-tuning-profile-v1');
  assert.equal(waterProfile.comparisonCount,1);
  assert.equal(waterProfile.demo,'water');
  assert.equal(waterProfile.reviewStatus,'rehearsal-only');
  assert.equal('observations' in waterProfile,false);
  const originalProfileKey=await page.locator('#profiles').inputValue();
  for (const demo of ['water','marble','sand']) {
    if (demo !== 'water') { await page.locator('#demo').selectOption(demo); await ready(); }
    await page.locator('#profiles').selectOption(originalProfileKey);
    const materialBaseline=Number(await page.locator('#damping').inputValue());
    await page.locator('#reuse-profile').click(); await ready();
    assert.match(await page.locator('#profile-status').textContent(),/比較票は引き継ぎません/);
    assert.ok(Math.abs(Number(await page.locator('#gain').inputValue())-waterProfile.parameters['resonance.master_gain'])<1e-12,'continuous result is not quantized to slider steps');
    for (const [id,path] of [['position','tilt.max_tilt_deg'],['cm','tilt.k_cm'],['tau','tilt.k_tau'],['phi','tilt.k_phi']])
      assert.ok(Math.abs(Number(await page.locator(`#${id}`).inputValue())-waterProfile.parameters[path])<1e-12);
    if (demo !== 'water') assert.equal(Number(await page.locator('#damping').inputValue()),materialBaseline,'other material response stays at shipped baseline');
    await page.locator('#new-session').click(); await ready();
    const clean=await activeArchive();
    assert.equal(clean.session.demo,demo); assert.equal(clean.session.version,3);
    assert.equal(clean.session.history.length,0); assert.equal(clean.session.observations.length,0);
    await page.locator('#note').blur();
    await page.keyboard.press('q'); await page.waitForFunction(()=>document.querySelector('#card-a').dataset.tested==='true'); await ready();
    await page.keyboard.press('w'); await page.waitForFunction(()=>document.querySelector('#card-b').dataset.tested==='true'); await ready();
    assert.equal(await page.locator('#response polyline').count(),2);
    await page.keyboard.press('a'); await ready();
    assert.equal((await activeArchive()).session.history.length,1);
    await page.locator('#save-profile').click();
    const key=await page.locator('#profiles').inputValue();
    const profile=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
    assert.equal(profile.demo,demo); assert.equal(Object.keys(profile.parameters).length,7);
    if (demo==='sand') {
      assert.ok(!Object.hasOwn(profile.parameters,'mass.damping_ratio_x'));
      assert.ok(Math.abs(profile.parameters['mass.granular_dynamic_friction']-profile.parameters['mass.granular_static_friction']*7/11)<1e-12);
      assert.match(await page.locator('#damping-label').textContent(),/砂/);
    }
    const archived=await activeArchive();
    await importJSON(JSON.stringify(archived),`${demo}-resume.json`);
    assert.deepEqual(await activeArchive(),archived);
    await votesLocked();
  }
  await page.locator('#import-profile').setInputFiles({name:'saved-water-profile.json',mimeType:'application/json',buffer:Buffer.from(profileJSON)});
  await ready();
  assert.equal(await page.locator('#profiles').inputValue(),originalProfileKey);
  const validList=await page.locator('#profiles').textContent();
  const invalidProfile=JSON.parse(profileJSON); invalidProfile.parameters['tilt.k_cm']=10;
  await page.locator('#import-profile').setInputFiles({name:'invalid-profile.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalidProfile))});
  await ready();
  assert.equal(await page.locator('#profiles').textContent(),validList,'invalid imports cannot replace the selection library');
  const sandSession=(await activeArchive()).session, sandKey='haptic-tuning-profile-v1:'+sandSession.id;
  const savedSand=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),sandKey);
  await bothCandidates();
  const challenger=JSON.stringify(sandSession.trial.a)===JSON.stringify(sandSession.incumbent)?'b':'a';
  await voteButton(challenger).click(); await ready();
  await page.evaluate(key=>{
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(name,value) {
      if(this===localStorage&&name===key) throw new DOMException('Simulated profile quota','QuotaExceededError');
      return original.call(this,name,value);
    };
  },sandKey);
  await page.locator('#save-profile').click();
  assert.match(await page.locator('#profile-status').textContent(),/保存に失敗/);
  assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),sandKey),savedSand);
  const profileRescuePending=page.waitForEvent('download'); await page.locator('#export-profile').click();
  const profileRescue=JSON.parse(await readFile(await (await profileRescuePending).path(),'utf8'));
  assert.equal(profileRescue.comparisonCount,2,'failed overwrite exports newest in-memory selected result, not old disk value');
  assert.notDeepEqual(profileRescue.parameters,savedSand.parameters);
  await page.setViewportSize({width:412,height:915});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:fileURLToPath(new URL('tuning-three-materials-mobile.png',output)),fullPage:true});
  await noIO();
  assert.deepEqual(errors, []);
  console.log('PASS: actual tuning C++ A/B/tie/skip for water/marble/sand, keyboard, exact same-material + shared-gain-only cross-material profiles, no mixed votes, save/export/import/resume, corruption/quota recovery, mode isolation and mobile; no hardware/audio IO.');
} finally { await browser.close(); }
