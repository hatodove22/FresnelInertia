/// <reference types="vite/client" />
import './style.css';
import { createDeviceViewer, type DeviceViewer, type DevicePose } from './device';

const arrow = '<span aria-hidden="true">↗</span>';
const sourceBase = 'https://github.com/hatodove22/FresnelInertia/blob/e007885/';
const sources = [
  ['体験と基本構成', 'docs/00_DESIGN_SPECIFICATION.md'],
  ['ハードウェアの構成', 'docs/04_HARDWARE_AND_PIN_SPEC.md'],
  ['4層パイプライン', 'docs/reference/03_PIPELINE_SPEC.md'],
  ['接触面の傾きのモデル', 'docs/reference/14_TILT_PSEUDOFORCE_SPEC_REV2.md'],
  ['確認できていること', 'docs/16_PROGRESS_STATUS.md'],
];
const layers = [
  { en: 'MASS MOTION', ja: '中身は、どこへ動く？', short: '動き', body: '手の動きと傾きから、中身の位置・速度を計算。容器の大きさが、壁までの移動距離を決めます。', example: 'ビー玉が右へ転がる。', color: '#ff673d', formula: '手の動き → 中身の位置・速度' },
  { en: 'EVENT', ja: '壁に、当たった。', short: '接触', body: '動いていた中身が壁に触れた瞬間を取り出します。場所や速さの違いが、衝突の短い刺激に変わります。', example: '右の壁で、コツン。', color: '#ffb16b', formula: '壁への接触 → 短い刺激' },
  { en: 'TEXTURE', ja: '同じ動きにも、素材の違い。', short: '質感', body: '転がる、こすれる、流れる。細かな刺激を重ねて、ビー玉・砂・液体それぞれの感触をつくります。', example: '砂なら、細かなザラザラ。', color: '#b7ceaa', formula: '素材 × 動き → 細かな振動' },
  { en: 'RESONANCE', ja: '低い響きも、高い響きも。', short: '響き', body: '短い刺激の、低い響き・高い響きのバランスを整えます。素材や壁ごとに調整し、振動子に合わせて出力を形づくります。', example: 'コツン、の響きを整える。', color: '#a7baff', formula: '刺激 → 響きのバランス' },
];

type CadMode = 'common' | 'differential' | 'impact';
const modes: { id: CadMode; title: string; description: string }[] = [
  { id: 'common', title: '同じ向き', description: '2枚の接触面が同じ向きに傾く共通成分。ゆっくり続く方向の手がかりを、機構の動きで見ます。' },
  { id: 'differential', title: '逆の向き', description: '2枚の接触面が逆向きに傾く差動成分。重心移動や慣性に対応する傾きの組み合わせを見ます。' },
  { id: 'impact', title: '短い振動', description: '内部表示をオンにし、4つの振動子の反応を青緑の発光で示します。大きな変位には置き換えず、短い刺激が起きる場所を強調します。' },
];
function mechanismControls(id: 'hero' | 'detail') {
  return `<div class="mechanism-controls" data-controls="${id}">
    <div class="mechanism-modes" role="group" aria-label="${id === 'hero' ? '実CAD' : '拡大ビュー'}の動作モード">${modes.map((mode,i)=>`<button data-cad-mode="${mode.id}" class="${i===0?'selected':''}" aria-pressed="${i===0}" disabled><span>0${i+1}</span>${mode.title}</button>`).join('')}</div>
    <div class="mechanism-angle"><label for="${id}-angle">接触面の角度を試す <output data-command-angle>0°</output></label><input id="${id}-angle" data-cad-angle type="range" min="-10" max="10" step="0.1" value="0" aria-label="${id === 'hero' ? '実CAD' : '拡大ビュー'}の接触面の角度" disabled><span class="angle-bounds" aria-hidden="true">−10°<span>＋10°</span></span></div>
    <div class="mechanism-actions"><button id="${id==='hero'?'motion-toggle':'detail-motion-toggle'}" data-cad-play class="cad-play" aria-pressed="false" disabled>▷ 動きを再生</button><label class="cutaway-control"><input type="checkbox" data-cad-cutaway="${id}" ${id==='detail'?'checked':''} disabled>内部を見る</label><button class="view-reset" data-cad-reset="${id}" disabled>視点を戻す ↺</button></div>
    <p class="mode-description" data-mode-description>${modes[0].description}</p>
  </div>`;
}
function mechanismReadouts(id: 'hero' | 'detail') {
  return `<div class="mechanism-readouts" aria-label="${id === 'hero' ? '実CAD' : '拡大ビュー'}の解説用駆動値">
    <div class="plane-readout"><span><i class="legend-dot plane-color"></i>接触面 A</span><output id="${id}-plane-a" aria-live="off">0.0°</output></div>
    <div class="plane-readout"><span><i class="legend-dot plane-color"></i>接触面 B</span><output id="${id}-plane-b" aria-live="off">0.0°</output></div>
    <div class="pulse-readout"><span><i class="legend-dot reactor-color"></i>4点の振動</span><div class="pulse-indicators" aria-label="振動子の反応を発光で表示">${[1,2,3,4].map(channel=>`<i data-pulse="${id}-${channel}" aria-hidden="true">${channel}</i>`).join('')}</div></div>
  </div>`;
}

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <a class="skip" href="#experience">本文へ移動</a>
  <header class="site-header">
    <a href="#" class="brand" aria-label="Fresnel Inertia ホーム"><span class="brand-mark">F<span>↗</span></span><span>Fresnel<span class="brand-light"> Inertia</span></span></a>
    <nav aria-label="メインナビゲーション"><a href="#device">実機の機構</a><a href="/atlas.html">デモ図鑑</a><a href="#film" class="nav-film"><span aria-hidden="true">▷</span> 解説動画</a></nav>
  </header>
  <main>
    <section class="hero" id="experience" aria-labelledby="hero-title">
      <div class="hero-copy">
        <p class="eyebrow"><span class="status-dot"></span> THE REAL MECHANISM, IN MOTION</p>
        <h1 id="hero-title">中身の気配を、<br><span>指先に。</span></h1>
        <p class="hero-description">傾く2枚の面と、響く4つの振動子。<br>実機のCADを動かしながら、<br>中身の感触をつくる機構を見てみよう。</p>
        <a href="#device" class="text-link">機構を近くで見る ${arrow}</a>
        <div class="hero-footnote"><span>01 / EXPLORE</span><span>形状は実CAD。駆動は説明用です。</span></div>
      </div>
      <div class="hero-playground">
        <div class="scene-topline"><span>DEVICE IN MOTION</span><span class="outline-label" id="hero-cad-label">実CADを読み込み中</span></div>
        <div class="scene-shell" id="scene-shell">
          <canvas id="container-canvas" aria-label="実CADの機構。動作モードと角度を変えて接触面と振動子を確認できます。"></canvas>
          <div class="scene-loading" id="hero-loading" role="status">実CADを読み込んでいます…</div>
          <div class="scene-fallback" id="hero-fallback" hidden>3Dを表示できませんでした。機構の説明と英語の解説動画をご覧ください。</div>
          <div class="scene-bottom"><span>ドラッグ：視点を回す</span><span>矢印キー：視点 / Home：戻す</span></div>
        </div>
        ${mechanismReadouts('hero')}
        ${mechanismControls('hero')}
        <p class="cad-disclosure">橙は傾く接触面、青緑は振動子。角度と発光は解説用の駆動で、実機の測定値ではありません。</p>
      </div>
    </section>

    <section class="manifesto" aria-label="触覚のコンセプト"><div class="section-kicker">THE IDEA</div><p>手の中にあるのは、ひとつのデバイス。<br>感じるのは、<span>その中で動くもの。</span></p><div class="manifesto-aside">容器をつまんで、傾ける。<br>接触面の傾きがゆっくりした重心の移動を、<br>振動が一瞬の衝突や細かな質感を伝えます。</div></section>

    <section id="principle" class="section principle" aria-labelledby="principle-title">
      <div class="section-heading"><div><p class="eyebrow">02 / TWO COMPLEMENTARY CUES</p><h2 id="principle-title">ゆっくりは、傾き。<br>一瞬は、振動。</h2></div><p class="section-intro">時間の異なるふたつの手がかりが重なると、<br>「中身が動いている」という、ひとつの感覚へ。</p></div>
      <div class="cue-grid">
        <article class="cue-card tilt-card"><div class="cue-meta"><span>01 — CONTACT-PLANE TILT</span><span class="cue-count">2<span> SERVOS</span></span></div><div class="tilt-diagram" role="img" aria-label="親指と人差し指の接触面が、それぞれ1軸で傾く模式図"><div class="plane-unit"><span>親指</span><div class="plane-joint"><div class="contact-plane"></div><div class="rotation-axis"></div></div></div><div class="tilt-center"><span>↙</span><i></i><span>↘</span></div><div class="plane-unit"><span>人差し指</span><div class="plane-joint"><div class="contact-plane index-plane"></div><div class="rotation-axis"></div></div></div></div><div class="cue-copy"><span class="frequency-label">SLOW / 持続する手がかり</span><h3>重心が、移る感じ。</h3><p>指先に触れる2枚の面を、それぞれ1軸で傾ける。中身の位置や慣性を、ゆっくりした方向の手がかりに変えます。</p><p class="cue-note">接触面の傾きによる疑似的な力感です。</p></div></article>
        <article class="cue-card vibration-card"><div class="cue-meta"><span>02 — VIBROTACTILE STIMULATION</span><span class="cue-count">4<span> CHANNELS</span></span></div><div class="vibration-diagram" role="img" aria-label="短い衝突波形の後に振動が減衰する模式図"><div class="wave-grid"></div><svg viewBox="0 0 500 160" preserveAspectRatio="none"><path id="impact-wave" fill="none" stroke="currentColor" stroke-width="2.5"/></svg><span class="impact-tag">CONTACT</span><span class="wave-tail">余韻</span></div><div class="cue-copy"><span class="frequency-label">FAST / 短く、細かな手がかり</span><h3>コツン。さらさら。</h3><p>4つの振動子が、壁への衝突や素材の細かな質感を表現。どこに、どんな刺激が起きたかを指先へ伝えます。</p><p class="cue-note">図の波形は原理を示すイメージです。</p></div></article>
      </div>
      <div class="shared-state"><span class="join-symbol">↳</span><p>ふたつの出力のもとは、<strong>同じ「中身の状態」。</strong></p><span>だから、動きと接触のタイミングがつながる。</span></div>
    </section>

    <section class="pipeline-section section" id="pipeline" aria-labelledby="pipeline-title">
      <div class="section-heading"><div><p class="eyebrow">03 / FROM MOTION TO FEELING</p><h2 id="pipeline-title">触覚をつくる、<br><span class="serif-number">4</span>つの層。</h2></div><p class="section-intro">ビー玉でも、砂でも、水でも。<br>素材を変えても、動きから触覚をつくる<br>基本の流れは共通です。</p></div>
      <div class="pipeline-flow"><div class="flow-input"><span>INPUT</span><strong>手の動き</strong><small>IMUで検出</small></div><span class="flow-arrow" aria-hidden="true">→</span><div class="layer-tabs" role="tablist" aria-label="4層の説明">${layers.map((l,i)=>`<button class="layer-tab ${i===0?'active':''}" id="layer-tab-${i}" role="tab" aria-selected="${i===0}" aria-controls="layer-panel" tabindex="${i===0?'0':'-1'}" data-layer="${i}" style="--layer-color:${l.color}"><span class="layer-num">0${i+1}</span><strong>${l.short}</strong><small>${l.en}</small></button>`).join('')}</div><span class="flow-arrow" aria-hidden="true">→</span><div class="flow-output"><span>SPATIAL 4</span><strong>4点へ分配</strong><small>場所を伝える</small></div></div>
      <div class="layer-panel" id="layer-panel" role="tabpanel" aria-labelledby="layer-tab-0" tabindex="0"><div class="layer-illustration"><span id="layer-big-num">01</span><div class="layer-animated-track"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><span id="layer-formula">${layers[0].formula}</span></div><div class="layer-explanation"><span class="eyebrow" id="layer-en">${layers[0].en}</span><h3 id="layer-title">${layers[0].ja}</h3><p id="layer-body">${layers[0].body}</p><span class="layer-example" id="layer-example">${layers[0].example}</span></div></div>
      <p class="pipeline-note">接触面の傾きは、中身の状態から分岐する並列の経路で計算します。4層のあとに、振動を4点へ分配します。</p>
    </section>

    <section class="geometry-section section" aria-labelledby="geometry-title"><div><p class="eyebrow">THE CONTAINER MATTERS</p><h2 id="geometry-title">容器が変わると、<br>「当たるまで」も変わる。</h2><p>同じ素材でも、壁までの距離が違えば、<br>移動時間や接触の起こり方が変わります。</p></div><div class="geometry-demo"><div class="geometry-box narrow"><span>狭い容器</span><i></i><span class="wall-flash"></span></div><div class="geometry-box wide"><span>広い容器</span><i></i><span class="wall-flash"></span></div><p>同じ速さで動くときの模式図</p></div></section>

    <section id="device" class="section device-section" aria-labelledby="device-title"><div class="section-heading"><div><p class="eyebrow">04 / LOOK CLOSER AT THE MECHANISM</p><h2 id="device-title">この面が、傾く。<br>この4点が、響く。</h2></div><p class="section-intro">実機の形状を、機構が見える視点から。<br>内部を透かして、軸まわりの動きを確かめる。<br>モードと角度は、上のビューと連動します。</p></div>
      <div class="device-layout"><div class="device-mechanism"><div class="device-visual" id="device-visual"><div class="device-visual-heading"><span>MECHANISM CLOSE-UP</span><span id="cad-label">実CADを読み込み中</span></div><canvas id="device-canvas" aria-label="接触面の回転軸と振動子を近くで見る実CAD。ドラッグと矢印キーで視点を変えられます。"></canvas><div class="scene-loading" id="detail-loading" role="status">機構ビューを読み込んでいます…</div><div id="device-fallback" class="device-fallback" hidden>3Dを表示できませんでした。構成説明と動画をご覧ください。</div><p id="device-model-note">実CADの機構形状・解説用の駆動と配色。制御基板は旧外形を含みます。</p></div>${mechanismReadouts('detail')}${mechanismControls('detail')}</div>
      <div class="device-parts"><article><span>01</span><div><h3>指先の面を、軸まわりに傾ける</h3><p>2つのサーボが、2枚の接触面をそれぞれ1軸で駆動。同じ向きと逆の向きの成分を組み合わせ、ゆっくり続く方向や慣性の手がかりをつくります。</p><small>橙の面 / 2 × XL330-M077-T</small></div></article><article><span>02</span><div><h3>4点から、短い刺激を伝える</h3><p>壁に当たる瞬間や細かな質感を4つの振動子へ。ここでは反応を発光で示しています。光の強さは説明のための強調で、振動の変位や実測振幅ではありません。</p><small>青緑の振動子 / 4チャンネル出力</small></div></article><article><span>03</span><div><h3>中身の状態は、手の中で計算する</h3><p>AtomS3がIMUの動きを読み、仮想の中身を計算。その同じ状態から、接触面の傾きと振動の両方を生成します。</p><small>AtomS3 / ESP32-S3 / オンデバイス計算</small></div></article><p class="mechanism-scope">ここで選べる動きは、機構を理解するための例です。実機の駆動ログや、特定の感覚の実証を再生しているわけではありません。</p></div></div>
      <div class="connection-strip"><div><span class="connection-icon">▣</span><strong>PC・Web画面</strong><small>素材や容器を指定</small></div><span class="connection-line">USB</span><div><span class="connection-icon">▥</span><strong>StampC5</strong><small>無線ドングル</small></div><span class="connection-line wireless">ESP-NOW</span><div><span class="connection-icon">◇</span><strong>AtomS3・デバイス</strong><small>計算・出力・状態を返す</small></div></div>
      <p class="connection-note">画面は意図を送り、デバイスが受け入れた設定と状態を表示します。この解説サイトは実機に接続しません。</p>
    </section>

    <section class="film-section section" id="film" aria-labelledby="film-title"><div class="section-heading"><div><p class="eyebrow">05 / WATCH THE PRINCIPLE</p><h2 id="film-title">動きでわかる、<br>指先のしくみ。</h2></div><p class="section-intro">手の動きが、触覚になるまで。<br>実CADの動きと英語ナレーションでたどります。</p></div><div class="film-frame"><video id="explainer-video" controls playsinline preload="metadata" poster="/media/poster-en.png" aria-label="Fresnel Inertia 動作原理解説動画・英語ナレーション"><source src="/media/fresnel-inertia-explainer-en.mp4" type="video/mp4"><track kind="subtitles" src="/media/captions-en.vtt" srclang="en" label="English">お使いのブラウザーでは動画を再生できません。下のリンクからダウンロードしてください。</video></div><div class="film-meta"><span><span id="video-duration"></span>English / 合成ナレーション・英語字幕付き</span><a href="/media/fresnel-inertia-explainer-en.mp4" download class="text-link">動画をダウンロード ↓</a></div><details class="transcript"><summary>英語のナレーションを読む <span>＋</span></summary><div id="transcript-body" lang="en"><p>Two tilting contact planes and four vibration channels work together to convey the movement of virtual contents. Their cues come from a shared state computed on the device.</p></div><a class="transcript-download text-link" href="/media/transcript-en.txt" download>英語テキストをダウンロード ↓</a></details></section>

    <section class="section reality-section" aria-labelledby="reality-title"><div><p class="eyebrow">WHERE WE ARE</p><h2 id="reality-title">いま、できていること。<br>これから、磨くこと。</h2></div><div class="status-columns"><div><span class="status-label"><i></i> 実機で確認済み</span><p>4点の振動と2サーボの同時動作。<br>無線ドングル経由のPC画面との連携。<br>操作者による、見える方向と感じる方向の一致。</p></div><div><span class="status-label planned"><i></i> 次のステップ</span><p>動きの滑らかさと、液体などの自然さを調整。<br>PCでの調整画面を拡張。<br>AndroidでのAR体験を検証。</p></div></div><details class="model-note"><summary>この解説のモデルと参照資料 <span>＋</span></summary><p>3Dは理解を助ける可視化です。実装の中身の運動はbody x/yの断面で計算する縮約モデルで、完全な3次元流体計算ではありません。ブラウザーのアニメーションは説明用に簡略化しており、実機の測定値・出力波形ではありません。指先の傾きは疑似的な力感を与えます。握力は現在、実測センサーではなく設定値を用います。</p><p>内容は2026年9月5日の実装・検証記録（e007885）に基づきます。</p><div class="source-links">${sources.map(([name,path])=>`<a href="${sourceBase}${path}" target="_blank" rel="noopener noreferrer">${name} ${arrow}</a>`).join('')}</div></details></section>
    <section class="section atlas-teaser" aria-labelledby="atlas-teaser-title"><div><p class="eyebrow">POSSIBILITY ATLAS / 12 CONCEPTS</p><h2 id="atlas-teaser-title">あんなこと、<br>感じられたら。</h2><p>壁にくっつく玉。最後の一粒。生きている種。<br>先行研究から生まれた、次の触覚体験を探しに。</p><a href="/atlas.html" class="text-link">動かせるデモ図鑑へ ${arrow}</a></div><div class="atlas-teaser-mark" aria-hidden="true">✳</div></section>
  </main>
  <footer><a class="brand" href="#"><span class="brand-mark">F<span>↗</span></span>Fresnel Inertia</a><span>FEEL THE CONTENTS.<br>UNDERSTAND THE MECHANISM.</span><a href="https://github.com/hatodove22/FresnelInertia" target="_blank" rel="noopener noreferrer">Project on GitHub ${arrow}</a></footer>
`;

document.querySelector('#film')!.insertAdjacentHTML('beforeend', '<a href="/series.html" class="text-link">フレネルシリーズの解説動画へ — 形状・硬さ・重心・慣性 ↗</a>');

const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const reducedMotion = motionPreference.matches;
const viewers = new Map<'hero' | 'detail', DeviceViewer>();
let playing = !reducedMotion;
let selectedMode: CadMode = 'common';
let commandAngle = 0;

function syncAngleControls(value: number, automatic: boolean) {
  commandAngle = Math.round(value * 10) / 10;
  document.querySelectorAll<HTMLInputElement>('[data-cad-angle]').forEach(input=>input.value=String(commandAngle));
  document.querySelectorAll<HTMLOutputElement>('[data-command-angle]').forEach(output=>output.value=automatic?'自動':`${commandAngle.toFixed(1)}°`);
}
function updateReadouts(id: 'hero' | 'detail', state: DevicePose) {
  const angleText = (angle: number) => `${Math.abs(angle)<0.05?'0.0':angle.toFixed(1)}°`;
  document.querySelector<HTMLOutputElement>(`#${id}-plane-a`)!.value = angleText(state.leftDeg);
  document.querySelector<HTMLOutputElement>(`#${id}-plane-b`)!.value = angleText(state.rightDeg);
  state.pulse.forEach((value,i)=>{
    document.querySelector<HTMLElement>(`[data-pulse="${id}-${i+1}"]`)!.style.setProperty('--pulse', String(Math.max(0,Math.min(1,value))));
  });
  if(playing)syncAngleControls(state.leftDeg,true);
}
function setPlaying(value: boolean) {
  playing = value;
  viewers.forEach(viewer=>viewer.setPlaying(value));
  document.documentElement.classList.toggle('motion-paused',!value);
  document.querySelectorAll<HTMLButtonElement>('[data-cad-play]').forEach(button=>{
    button.setAttribute('aria-pressed',String(value));
    button.textContent=value?'Ⅱ 動きを一時停止':'▷ 動きを再生';
    button.setAttribute('aria-label',value?'機構の自動アニメーションを一時停止':'機構の自動アニメーションを再生');
  });
  syncAngleControls(commandAngle,value);
}
function selectMode(mode: CadMode) {
  selectedMode=mode;
  viewers.forEach(viewer=>{
    if(!playing)viewer.setAngle(commandAngle);
    viewer.setMode(mode);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-cad-mode]').forEach(button=>{
    const active=button.dataset.cadMode===mode;
    button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));
  });
  document.querySelectorAll('[data-mode-description]').forEach(element=>element.textContent=modes.find(item=>item.id===mode)!.description);
  if(mode==='impact')document.querySelectorAll<HTMLInputElement>('[data-cad-cutaway]').forEach(input=>{
    input.checked=true;
    viewers.get(input.dataset.cadCutaway as 'hero'|'detail')?.setCutaway(true);
  });
}
function inputAngle(value: number) {
  commandAngle=Math.max(-10,Math.min(10,value));
  setPlaying(false);
  viewers.forEach(viewer=>viewer.setAngle(commandAngle));
  syncAngleControls(commandAngle,false);
}
document.querySelectorAll<HTMLButtonElement>('[data-cad-play]').forEach(button=>button.addEventListener('click',()=>setPlaying(!playing)));
document.querySelectorAll<HTMLButtonElement>('[data-cad-mode]').forEach(button=>button.addEventListener('click',()=>selectMode(button.dataset.cadMode as CadMode)));
document.querySelectorAll<HTMLInputElement>('[data-cad-angle]').forEach(input=>input.addEventListener('input',()=>inputAngle(Number(input.value))));
document.querySelectorAll<HTMLInputElement>('[data-cad-cutaway]').forEach(input=>input.addEventListener('change',()=>viewers.get(input.dataset.cadCutaway as 'hero'|'detail')?.setCutaway(input.checked)));
document.querySelectorAll<HTMLButtonElement>('[data-cad-reset]').forEach(button=>button.addEventListener('click',()=>viewers.get(button.dataset.cadReset as 'hero'|'detail')?.resetCamera()));
motionPreference.addEventListener('change',event=>{if(event.matches)setPlaying(false);});
setPlaying(playing);

async function loadMechanism(id: 'hero' | 'detail') {
  const canvas = document.querySelector<HTMLCanvasElement>(id==='hero'?'#container-canvas':'#device-canvas')!;
  try {
    const viewer=await createDeviceViewer(canvas,{variant:id==='hero'?'hero':'detail',reducedMotion,onUpdate:state=>updateReadouts(id,state)});
    viewers.set(id,viewer);
    viewer.setPlaying(false);viewer.setMode(selectedMode);viewer.setAngle(commandAngle);
    viewer.setCutaway(document.querySelector<HTMLInputElement>(`[data-cad-cutaway="${id}"]`)!.checked);viewer.setPlaying(playing);
    canvas.dataset.ready='true';
    document.querySelector(id==='hero'?'#hero-cad-label':'#cad-label')!.textContent=id==='hero'?'実CAD / 解説用駆動':'Fusion / 実CAD';
    document.querySelectorAll<HTMLButtonElement|HTMLInputElement>(`[data-controls="${id}"] button,[data-controls="${id}"] input`).forEach(control=>control.disabled=false);
  } catch(error) {
    console.warn('CAD view unavailable',error);
    document.querySelector<HTMLElement>(id==='hero'?'#hero-fallback':'#device-fallback')!.hidden=false;
    document.querySelector(id==='hero'?'#hero-cad-label':'#cad-label')!.textContent='3D表示を利用できません';
  } finally {
    document.querySelector<HTMLElement>(`#${id}-loading`)!.hidden=true;
  }
}
void loadMechanism('hero');
void loadMechanism('detail');
if(import.meta.hot)import.meta.hot.dispose(()=>viewers.forEach(viewer=>viewer.dispose()));

function selectLayer(i:number, focus=false) {
  const l=layers[i];document.querySelectorAll<HTMLButtonElement>('[data-layer]').forEach((b,j)=>{b.classList.toggle('active',i===j);b.setAttribute('aria-selected',String(i===j));b.tabIndex=i===j?0:-1;if(focus&&i===j)b.focus();});
  document.querySelector('#layer-big-num')!.textContent=`0${i+1}`;document.querySelector('#layer-en')!.textContent=l.en;document.querySelector('#layer-title')!.textContent=l.ja;document.querySelector('#layer-body')!.textContent=l.body;document.querySelector('#layer-example')!.textContent=l.example;document.querySelector('#layer-formula')!.textContent=l.formula;
  const panel=document.querySelector<HTMLElement>('#layer-panel')!;panel.setAttribute('aria-labelledby',`layer-tab-${i}`);panel.style.setProperty('--layer-color',l.color);panel.dataset.layer=String(i);
}
document.querySelectorAll<HTMLButtonElement>('[data-layer]').forEach((b,i)=>{b.addEventListener('click',()=>selectLayer(i));b.addEventListener('keydown',e=>{let n=i;if(e.key==='ArrowRight')n=(i+1)%4;else if(e.key==='ArrowLeft')n=(i+3)%4;else if(e.key==='Home')n=0;else if(e.key==='End')n=3;else return;e.preventDefault();selectLayer(n,true);});});
const wave = Array.from({length:501},(_,x)=>{const q=Math.max(0,x-115);const y=x<115?80:80+Math.sin(q*.42)*Math.exp(-q/72)*65;return `${x===0?'M':'L'}${x},${y.toFixed(2)}`;}).join(' ');
document.querySelector('#impact-wave')!.setAttribute('d',wave);

// Standalone presentation only: no USB, Serial, radio or physical actuator APIs.
const film=document.querySelector<HTMLVideoElement>('#explainer-video')!;
film.addEventListener('loadedmetadata',()=>{
  if(Number.isFinite(film.duration))document.querySelector('#video-duration')!.textContent=`${Math.floor(film.duration/60)}:${String(Math.floor(film.duration%60)).padStart(2,'0')} / `;
});
fetch('/media/transcript-en.txt').then(response=>response.ok?response.text():null).then(text=>{
  if(!text)return;
  document.querySelector('#transcript-body')!.replaceChildren(...text.split(/\n\s*\n/).map(paragraph=>{
    const element=document.createElement('p');element.textContent=paragraph;return element;
  }));
}).catch(()=>{});
