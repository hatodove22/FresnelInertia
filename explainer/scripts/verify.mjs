import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.EXPLAINER_URL || 'http://127.0.0.1:4175';
const output = '../output/explainer-qa';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [], badAssets = [], widths = [];
const observe = page => {
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.url().startsWith(base) && response.status() >= 400) badAssets.push(`${response.status()} ${response.url()}`);
  });
};
const pose = (page, id = 'container-canvas') => page.locator(`#${id}`).evaluate(canvas => JSON.parse(canvas.dataset.pose));
const waitForCad = page => page.waitForFunction(() => ['container-canvas', 'device-canvas'].every(id => document.getElementById(id).dataset.ready === 'true'));
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  observe(page);
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await waitForCad(page);
  assert.match(await page.title(), /Fresnel Inertia/);
  assert.equal(await page.locator('#cad-label').textContent(), 'Fusion / 実CAD');
  assert.equal(await page.locator('#motion-toggle').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-controls="hero"] [data-command-angle]').textContent(), '自動');
  await page.locator('#motion-toggle').click();
  assert.equal(await page.locator('#detail-motion-toggle').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('#hero-angle').inputValue(), await page.locator('#detail-angle').inputValue());
  assert.ok(Math.abs(Number(await page.locator('#hero-angle').inputValue()) - (await pose(page)).leftDeg) <= .051, 'Pausing keeps the slider at the current angle');
  assert.deepEqual(await pose(page), await pose(page, 'device-canvas'), 'Offscreen detail freezes at the same shared-clock pose');
  const paused = await page.locator('#container-canvas').screenshot();
  await page.waitForTimeout(250);
  assert.ok(paused.equals(await page.locator('#container-canvas').screenshot()), 'Pause freezes the CAD pose and frame');

  await page.locator('#hero-angle').focus();
  await page.keyboard.press('End');
  assert.equal(await page.locator('#hero-angle').inputValue(), '10');
  assert.equal(await page.locator('#detail-angle').inputValue(), '10');
  assert.equal(await page.locator('#hero-plane-a').textContent(), '10.0°');
  assert.equal(await page.locator('#hero-plane-b').textContent(), '10.0°');
  assert.deepEqual(await pose(page), await pose(page, 'device-canvas'));
  const common = await page.locator('#container-canvas').screenshot();
  await page.locator('[data-controls="hero"] [data-cad-mode="differential"]').click();
  assert.equal(await page.locator('[data-controls="detail"] [data-cad-mode="differential"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#hero-plane-b').textContent(), '-10.0°');
  assert.ok(!common.equals(await page.locator('#container-canvas').screenshot()), 'Changing mode repaints while paused');
  assert.deepEqual(await pose(page), await pose(page, 'device-canvas'));
  const opaque = await page.locator('#container-canvas').screenshot();
  await page.locator('[data-cad-cutaway="hero"]').check();
  assert.ok(!opaque.equals(await page.locator('#container-canvas').screenshot()), 'Cutaway changes the actual CAD rendering');
  await page.locator('[data-cad-cutaway="hero"]').uncheck();
  assert.equal(await page.locator('[data-cad-cutaway="detail"]').isChecked(), true);
  const camera = await page.locator('#container-canvas').screenshot();
  await page.locator('#container-canvas').focus();
  await page.keyboard.press('ArrowLeft');
  assert.ok(!camera.equals(await page.locator('#container-canvas').screenshot()), 'Keyboard changes the camera');
  await page.keyboard.press('Home');
  assert.ok(camera.equals(await page.locator('#container-canvas').screenshot()), 'Home restores the camera');

  await page.locator('[data-controls="hero"] [data-cad-mode="impact"]').click();
  assert.equal(await page.locator('[data-cad-cutaway="hero"]').isChecked(), true);
  assert.equal(await page.locator('[data-cad-cutaway="detail"]').isChecked(), true);
  assert.equal((await pose(page)).leftDeg, 10, 'Manual angle keeps its meaning in impact mode');
  await page.locator('#motion-toggle').click();
  assert.equal(await page.locator('#detail-motion-toggle').getAttribute('aria-pressed'), 'true');
  const moving = await pose(page);
  await page.waitForTimeout(350);
  const moved = await pose(page);
  assert.notDeepEqual(moving, moved, 'Resuming advances the illustrative sequence');
  for (const sample of [moving, moved]) {
    assert.ok(Math.abs(sample.leftDeg) <= 10 && Math.abs(sample.rightDeg) <= 10);
    assert.ok(sample.pulse.every(value => value >= 0 && value <= 1));
    assert.ok(sample.pulse.some(value => value > 0));
  }
  await page.locator('#motion-toggle').click();
  await page.locator('#container-canvas').screenshot({ path: `${output}/cad-impact.png` });
  await page.locator('#hero-angle').focus();
  await page.keyboard.press('Home');
  assert.equal(await page.locator('#detail-angle').inputValue(), '-10');
  assert.equal(await page.locator('#motion-toggle').getAttribute('aria-pressed'), 'false');
  await page.locator('[data-controls="hero"] [data-cad-mode="differential"]').click();

  await page.locator('#layer-tab-0').focus();
  await page.keyboard.press('End');
  assert.equal(await page.locator('#layer-tab-3').getAttribute('aria-selected'), 'true');
  assert.match(await page.locator('#layer-title').textContent(), /低い響き/);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#layer-tab-2').getAttribute('aria-selected'), 'true');
  await page.locator('#layer-tab-0').click();
  await page.locator('#pipeline').screenshot({ path: `${output}/pipeline.png` });
  await page.locator('#device').screenshot({ path: `${output}/desktop-device-final.png` });

  await page.locator('#film').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('video').readyState >= 1);
  const videoInfo = await page.locator('video').evaluate(async video => {
    const info = { duration: video.duration, width: video.videoWidth, height: video.videoHeight,
      source: video.currentSrc, language: video.textTracks[0]?.language, initialTrackMode: video.textTracks[0]?.mode };
    video.muted = true;
    await video.play();
    return info;
  });
  assert.ok(videoInfo.duration > 30 && videoInfo.duration < 300);
  assert.equal(videoInfo.width, 1920);
  assert.equal(videoInfo.height, 1080);
  assert.match(videoInfo.source, /fresnel-inertia-explainer-en\.mp4$/);
  assert.equal(videoInfo.language, 'en');
  assert.notEqual(videoInfo.initialTrackMode, 'showing');
  await page.locator('video').evaluate(video=>{video.textTracks[0].mode='hidden';});
  await page.waitForFunction(()=>document.querySelector('video').textTracks[0].cues?.length>0);
  const subtitleText=await page.locator('video').evaluate(video=>Array.from(video.textTracks[0].cues).map(cue=>cue.text).join(' '));
  assert.match(subtitleText, /contact|haptic|Fresnel/i);
  await page.locator('video').evaluate(video=>{video.textTracks[0].mode='disabled';});
  await page.waitForFunction(() => document.querySelector('video').currentTime > .2);
  await page.locator('video').evaluate(video => { video.pause(); video.currentTime = video.duration * .4; });
  await page.waitForFunction(() => { const video = document.querySelector('video'); return !video.seeking && video.readyState >= 2; });
  await page.locator('#film').screenshot({ path: `${output}/film-final.png` });
  await page.locator('.transcript summary').click();
  assert.match(await page.locator('#transcript-body').textContent(), /Fresnel|contact|haptic/i);
  assert.equal(await page.locator('#transcript-body').getAttribute('lang'), 'en');
  await page.locator('.model-note summary').click();
  assert.equal(await page.locator('.source-links a').count(), 5);
  assert.equal(await page.locator('.atlas-teaser a').getAttribute('href'), '/atlas.html');

  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `No horizontal overflow at ${width}`);
    widths.push(width);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `${output}/mobile-final.png` });
  await page.locator('.hero-playground').screenshot({ path: `${output}/mobile-controls.png` });
  await page.locator('#device').screenshot({ path: `${output}/mobile-device-final.png` });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `${output}/desktop-final.png` });
  const reduced = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  observe(reduced);
  await reduced.goto(base, { waitUntil: 'networkidle' });
  await waitForCad(reduced);
  assert.equal(await reduced.locator('#motion-toggle').getAttribute('aria-pressed'), 'false');
  assert.equal(await reduced.locator('#detail-motion-toggle').getAttribute('aria-pressed'), 'false');
  const resting = await pose(reduced);
  await reduced.waitForTimeout(200);
  assert.deepEqual(await pose(reduced), resting);
  assert.equal(resting.leftDeg, 0);
  await reduced.locator('#hero-angle').focus();
  await reduced.keyboard.press('End');
  assert.equal((await pose(reduced)).leftDeg, 10, 'Reduced motion preserves direct input');
  assert.deepEqual(errors, []);
  assert.deepEqual(badAssets, []);
  const result = { status: 'PASS', browser: 'Chrome / Playwright', widths,
    checks: ['two actual CAD views', 'pause freezes image', 'bounded keyboard angle', 'synchronized controls and static pose',
      'common/differential repaint', 'independent cutaway', 'keyboard camera reset', 'four illustrative pulses',
      'keyboard layer navigation', 'English video playback and seek', 'optional English captions', 'English transcript',
      'source and atlas links', 'responsive overflow', 'reduced motion with direct manipulation'],
    video: videoInfo, pageErrors: errors, missingAssets: badAssets };
  await writeFile(`${output}/verification.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
