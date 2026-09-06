import './style.css';
import { demos, sources, horizons, type Feasibility } from './catalog';
import { ScenarioModel, projectCues, type ScenarioId, type CueEvent } from './scenarioModel';
import { ScenarioView } from './ScenarioView';

const escape = (s:string) => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const scenarioDescriptions = {
  magnet: {name:'磁石の積み荷',subtitle:'転がる。くっつく。振ると、離れる。',instruction:'右に傾けて壁まで転がし、吸着したら「振る」。',state:'吸着状態',concept:'C05'},
  pour: {name:'最後の一粒',subtitle:'たっぷり。さらさら。もう、空っぽ。',instruction:'左右どちらかに大きく傾け続けると、中身が減ります。',state:'残っている量',concept:'C04'},
  seed: {name:'生きている種',subtitle:'目を覚ました小さな気配を、手の中で。',instruction:'「振る」で目を覚まし、静かに保つと落ち着きます。',state:'目覚めの度合い',concept:'C06'},
} as const;
const eventLabels:Record<CueEvent,string> = {rest:'静かな状態',roll:'転がり始めた',attach:'壁に吸着した',release:'壁から離れた',flow:'粒が流れた',empty:'最後の粒が出た',wake:'目を覚ました',tap:'中から、小さな接触'};
document.querySelector('#app')!.innerHTML = `
<a class="skip" href="#lab">操作できるスケッチへ</a>
<header><a class="brand" href="/"><span class="brand-symbol">F↗</span>Fresnel Inertia</a><nav aria-label="ナビゲーション"><a href="#possibilities">デモ図鑑</a><a href="#research">先行研究</a><a href="/">動作原理 ↗</a></nav></header>
<main>
  <section class="intro"><div><p class="eyebrow"><i></i> POSSIBILITY ATLAS / 2026</p><h1>あんなこと、<br><em>感じられたら。</em></h1><p class="lede">手の中の箱から、どこまで体験を広げられるだろう。<br>ふたつの傾く面と、4点の振動。<br>その組み合わせから、次のデモを探す。</p></div><div class="intro-aside"><span class="orbit-mark" aria-hidden="true">✳</span><p>触覚を、<br>素材から<em>出来事へ。</em></p><span>12 CONCEPTS · 3 INTERACTIVE SKETCHES</span></div></section>
  <section id="lab" class="lab" aria-labelledby="lab-title"><div class="lab-heading"><div><p class="eyebrow">01 / FEEL THE POSSIBILITY</p><h2 id="lab-title">まずは、動かして想像する。</h2></div><span class="sketch-label">概念スケッチ / 実機の機能ではありません</span></div>
    <div class="lab-grid"><div class="experiment"><div class="scenario-tabs" role="group" aria-label="体験スケッチ">${(Object.entries(scenarioDescriptions) as [ScenarioId,typeof scenarioDescriptions[ScenarioId]][]).map(([id,s],i)=>`<button data-scenario="${id}" aria-pressed="${i===0}" class="${i===0?'active':''}"><small>0${i+1}</small>${s.name}</button>`).join('')}</div>
      <div class="stage"><div class="stage-top"><span id="sketch-subtitle">${scenarioDescriptions.magnet.subtitle}</span><span class="stage-label">ILLUSTRATIVE MODEL</span></div><canvas id="sketch-canvas" aria-label="手の動きと内部状態のつながりを示す3Dスケッチ。下のボタンとスライダーで操作できます。"></canvas><p class="webgl-fallback" hidden>3Dを表示できません。状態と出力の関係は右の図で操作できます。</p><div class="stage-bottom"><span id="event-label" role="status">静かな状態</span><span id="sketch-time">00.0 s</span></div></div>
      <div class="control-panel"><label for="sketch-tilt">手で傾ける <output id="sketch-degrees">0°</output></label><input id="sketch-tilt" type="range" min="-35" max="35" value="0" step="1"><div class="control-buttons"><button id="shake">↔ 振る</button><button id="play" aria-pressed="true">Ⅱ 一時停止</button><button id="step">1コマ進む</button><button id="reset">↺ はじめから</button></div><p id="sketch-instruction">${scenarioDescriptions.magnet.instruction}</p></div></div>
      <aside class="cue-panel" aria-label="同じ状態から生まれる出力の設計イメージ"><p class="eyebrow">ONE STATE, TWO CUES</p><h3>ひとつの出来事を、<br>ふたつの時間で。</h3><div class="state-display"><span id="state-label">吸着状態</span><strong id="state-value">自由に転がる</strong></div><div class="state-branch" aria-hidden="true"></div><div class="cue-block"><div class="cue-header"><span>ゆっくり / 傾き</span><small>SLOW</small></div><div class="plane-diagram" aria-hidden="true"><div><i id="plane-thumb"></i><span>親指</span></div><div><i id="plane-index"></i><span>人差し指</span></div></div><p id="slow-description">中身の偏りに対応する、方向の手がかり。</p></div><div class="cue-block"><div class="cue-header"><span>瞬間 / 振動</span><small>FAST</small></div><div class="pulse-bars" aria-hidden="true">${['左側','右側','上側','下側'].map((s,i)=>`<div><div class="bar-well"><i id="pulse-${i}"></i></div><span>${s}</span></div>`).join('')}</div><p id="fast-description">吸着・離脱の瞬間に、短い接触の合図。</p></div><p class="cue-note">出力の関係を描いた模式図です。指先の面の角度・4点の配置は説明用で、実機の配線や校正値を表しません。</p><a id="recipe-link" href="#C05">このデモの実現方法を見る ↗</a></aside>
    </div><p class="lab-footnote">このページはデバイスに接続しません。表示は独立した簡略モデルで、物理量・測定波形・触覚効果の実証ではありません。Webでは動作の因果関係を探索できます。</p>
  </section>
  <section class="possibilities" id="possibilities" aria-labelledby="possibilities-title"><div class="section-heading"><div><p class="eyebrow">02 / AN INTERACTION SPACE</p><h2 id="possibilities-title">同じ箱から、<br>違う物語が始まる。</h2></div><p>「何を感じさせたいか」と、<br>「何を足せば試せるか」。<br>その両方から、次の一歩を選ぶ。</p></div>
    <div class="filter-row" role="group" aria-label="必要な追加で絞り込む"><button data-filter="all" aria-pressed="true" class="selected">すべて <span>${demos.length}</span></button>${Object.entries(horizons).map(([id,h])=>`<button data-filter="${id}" aria-pressed="false" style="--accent:${h.color}"><i></i>${h.short} <span>${demos.filter(d=>d.feasibility===id).length}</span></button>`).join('')}</div><p id="filter-description" class="filter-description">研究を手がかりに考案した将来の体験です。実装済み機能や検証結果とは分けて記載しています。</p>
    <div class="concept-grid" id="concept-grid"></div>
    <article id="concept-detail" class="concept-detail" aria-labelledby="concept-title"></article>
  </section>
  <section class="design-rules"><p class="eyebrow">03 / THE DESIGN COMPASS</p><h2>触れ方を、設計する。</h2><div class="rule-grid"><article><span>01 — GESTURE</span><h3>まず、どう確かめる？</h3><p>傾ける。揺する。静かに待つ。手の動きで知りたいことを決めると、必要な手がかりが見えてきます。</p></article><article><span>02 — TIME</span><h3>ずっと？ それとも、一瞬？</h3><p>偏りや慣性にはゆっくりした傾き。接触や流れには短い振動。同じ状態の異なる時間尺度を組み合わせます。</p></article><article><span>03 — MEMORY</span><h3>さっきの動きを、覚える。</h3><p>中身が減る。玉が吸着する。生き物が目覚める。出来事の履歴を持つと、動作が物語になります。</p></article><article><span>04 — BOUNDARY</span><h3>箱の中？ 外の世界？</h3><p>箱の中の運動はIMUから。机や相手との接触には位置の情報が必要。実際に手を止める抵抗には別の機構が必要です。</p></article></div></section>
  <section id="research" class="research"><div class="section-heading"><div><p class="eyebrow">04 / STANDING ON RESEARCH</p><h2>可能性には、<br>足場をつくる。</h2></div><p>先行研究は設計のヒント。<br>別の機構で得られた効果を、<br>このデバイスの性能とは呼びません。</p></div><div class="source-list">${sources.map(s=>`<details id="source-${s.id}"><summary><span class="source-year">${s.year}</span><span>${escape(s.title)}<small>${escape(s.authors)}</small></span><span class="source-plus">＋</span></summary><div class="source-body"><p><strong>設計のヒント</strong>${escape(s.claim)}</p><p><strong>そのままは移せないこと</strong>${escape(s.transferLimit)}</p><a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">原典を読む ↗</a></div></details>`).join('')}</div></section>
  <section class="next-step"><p class="eyebrow">THE NEXT EXPERIMENT</p><h2>ひとつ作って、<br>指先に聞いてみよう。</h2><p>最初は「見えない中身を当てる」小さな比較から。<br>次に、吸着と離脱のある箱へ。<br>自然に感じる条件は、実機で確かめながら育てます。</p><a href="#possibilities">次の実験を選ぶ ↑</a></section>
</main><footer><a class="brand" href="/">Fresnel Inertia ↗</a><span>12 POSSIBILITIES. ONE SHARED STATE.</span><a href="https://github.com/hatodove22/FresnelInertia" target="_blank" rel="noopener noreferrer">Project on GitHub ↗</a></footer>`;

let selected = demos.find(d=>d.id===location.hash.slice(1))?.id ?? 'C05';
let filter:Feasibility|'all'='all';
function renderConcepts(){
  document.querySelector('#concept-grid')!.innerHTML=demos.filter(d=>filter==='all'||d.feasibility===filter).map(d=>{
    const h=horizons[d.feasibility];return `<button class="concept-card ${selected===d.id?'active':''}" data-concept="${d.id}" aria-pressed="${selected===d.id}" style="--accent:${h.color}"><span class="card-meta"><span>${d.id}</span><span>${h.short}</span></span><span class="card-gesture">${escape(d.gesture)}</span><strong>${escape(d.title)}</strong><span class="card-tagline">${escape(d.tagline)}</span><span class="card-more">体験の設計を見る <b>↗</b></span></button>`;
  }).join('');
  document.querySelectorAll<HTMLButtonElement>('[data-concept]').forEach(b=>b.addEventListener('click',()=>selectConcept(b.dataset.concept!,true)));
}
function selectConcept(id:string,scroll=false){
  const demo=demos.find(d=>d.id===id);if(!demo)return;selected=id;
  if(filter!=='all'&&demo.feasibility!==filter)setFilter('all');
  history.replaceState(null,'',`#${id}`);renderConcepts();renderDetail();
  if(scroll)document.querySelector('#concept-detail')!.scrollIntoView({behavior:reduced?'instant':'smooth',block:'start'});
}
function renderDetail(){
  const d=demos.find(d=>d.id===selected)!,h=horizons[d.feasibility];
  const sample=Object.entries(scenarioDescriptions).find(([,s])=>s.concept===d.id)?.[0];
  const research=d.sources.map(id=>sources.find(s=>s.id===id)).filter((s):s is typeof sources[number]=>!!s);
  document.querySelector('#concept-detail')!.innerHTML=`<div class="detail-heading" style="--accent:${h.color}"><div><span>${d.id} / ${h.label}</span><h3 id="concept-title">${escape(d.title)}</h3><p>${escape(d.percept)}</p></div><div class="detail-actions">${sample?`<button data-try="${sample}">動くスケッチで見る ↗</button>`:''}<button id="download-concept">設計メモを保存 ↓</button></div></div><div class="detail-grid"><div class="recipe"><div><span>手の動き</span><p>${escape(d.gesture)}</p></div><div class="recipe-state"><span>共有する内部状態</span><p>${escape(d.state)}</p></div><div><span>ゆっくりした傾き</span><p>${escape(d.slow)}</p></div><div><span>短い振動</span><p>${escape(d.fast)}</p></div><div><span>目に見える変化</span><p>${escape(d.visual)}</p></div></div><div class="implementation"><h4>試すために足すもの</h4><p>${escape(d.additions)}</p><h4>越えてはいけない解釈</h4><p>${escape(d.limit)}</p><div class="first-experiment"><span>最初に、こう比べる</span><p>${escape(d.experiment)}</p></div></div></div><div class="detail-sources"><span>発想の足場</span>${research.map(s=>`<a href="#source-${s.id}" data-source="${s.id}">${escape(s.title)} ↗</a>`).join('')}</div>`;
  document.querySelector('[data-try]')?.addEventListener('click',()=>{setScenario(sample as ScenarioId);document.querySelector('#lab')!.scrollIntoView({behavior:reduced?'instant':'smooth'});});
  document.querySelectorAll<HTMLAnchorElement>('[data-source]').forEach(a=>a.addEventListener('click',()=>{document.querySelector<HTMLDetailsElement>(`#source-${a.dataset.source}`)!.open=true;}));
  document.querySelector('#download-concept')!.addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify({schema:'fresnel-inertia-concept/v1',status:'proposed-not-hardware-validated',concept:d,research},null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`fresnel-inertia-${d.id}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
}
function setFilter(value:Feasibility|'all'){
  filter=value;document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(b=>{const active=b.dataset.filter===value;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
  document.querySelector('#filter-description')!.textContent=value==='all'?'研究を手がかりに考案した将来の体験です。実装済み機能や検証結果とは分けて記載しています。':horizons[value].description;
  if(value!=='all'&&demos.find(d=>d.id===selected)!.feasibility!==value)selected=demos.find(d=>d.feasibility===value)!.id;
  history.replaceState(null,'',`#${selected}`);
  renderConcepts();renderDetail();
}
document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(b=>b.addEventListener('click',()=>setFilter(b.dataset.filter as Feasibility|'all')));

const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const model=new ScenarioModel();
let view:ScenarioView|undefined;
try{view=new ScenarioView(document.querySelector('#sketch-canvas')!);}catch(error){console.warn('Sketch WebGL unavailable',error);document.querySelector<HTMLElement>('.webgl-fallback')!.hidden=false;}
let playing=!reduced,visible=true,lastStamp:number|undefined,raf=0,disposed=false;
const playButton=document.querySelector<HTMLButtonElement>('#play')!,tilt=document.querySelector<HTMLInputElement>('#sketch-tilt')!;
const planeThumb=document.querySelector<HTMLElement>('#plane-thumb')!,planeIndex=document.querySelector<HTMLElement>('#plane-index')!;
const bars=[0,1,2,3].map(i=>document.querySelector<HTMLElement>(`#pulse-${i}`)!);
function paint(){
  const f=model.snapshot(),cues=projectCues(f);view?.render(f);
  planeThumb.style.transform=`rotate(${cues.slow[0]*28}deg)`;planeIndex.style.transform=`rotate(${cues.slow[1]*28}deg)`;
  bars.forEach((bar,i)=>bar.style.transform=`scaleY(${.035+cues.fast[i]*.965})`);
  document.querySelector('#state-value')!.textContent=f.scenario==='pour'?`${Math.round(f.remaining*100)}%`:f.scenario==='seed'?`${Math.round(f.arousal*100)}%`:f.attached?'壁に吸着':'自由に転がる';
  const label=document.querySelector('#event-label')!;if(label.textContent!==eventLabels[f.event])label.textContent=eventLabels[f.event];
  document.querySelector('#sketch-time')!.textContent=`${f.time.toFixed(1).padStart(4,'0')} s`;
}
function setPlaying(value:boolean){playing=value;lastStamp=undefined;playButton.setAttribute('aria-pressed',String(value));playButton.textContent=value?'Ⅱ 一時停止':'▷ 動きを再開';}
function setScenario(id:ScenarioId){
  model.reset(id);tilt.value='0';document.querySelector('#sketch-degrees')!.textContent='0°';
  const s=scenarioDescriptions[id];document.querySelector('#sketch-subtitle')!.textContent=s.subtitle;document.querySelector('#sketch-instruction')!.textContent=s.instruction;document.querySelector('#state-label')!.textContent=s.state;
  document.querySelector<HTMLAnchorElement>('#recipe-link')!.href=`#${s.concept}`;
  document.querySelector('#slow-description')!.textContent=id==='pour'?'量と偏りが小さくなるにつれ、ゆっくりした手がかりも弱く。':id==='seed'?'目覚めの度合いに応じた、中から動く方向の手がかり。':'中身の偏りに対応する、方向の手がかり。';
  document.querySelector('#fast-description')!.textContent=id==='pour'?'減っていく粒の接触。空になる瞬間の合図。':id==='seed'?'目を覚ます瞬間と、中から触れる小さな合図。':'吸着・離脱の瞬間に、短い接触の合図。';
  document.querySelectorAll<HTMLButtonElement>('[data-scenario]').forEach(b=>{const active=b.dataset.scenario===id;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});paint();
}
document.querySelectorAll<HTMLButtonElement>('[data-scenario]').forEach(b=>b.addEventListener('click',()=>setScenario(b.dataset.scenario as ScenarioId)));
tilt.addEventListener('input',()=>{model.setTilt(Number(tilt.value));document.querySelector('#sketch-degrees')!.textContent=`${tilt.value}°`;if(!playing){model.advance(1/30);paint();}});
playButton.addEventListener('click',()=>setPlaying(!playing));
document.querySelector('#shake')!.addEventListener('click',()=>{model.shake();if(!playing){model.advance(1/30);paint();}});
document.querySelector('#step')!.addEventListener('click',()=>{setPlaying(false);model.advance(1/30);paint();});
document.querySelector('#reset')!.addEventListener('click',()=>setScenario(model.snapshot().scenario));
document.querySelector('#recipe-link')!.addEventListener('click',e=>{e.preventDefault();selectConcept(scenarioDescriptions[model.snapshot().scenario].concept,true);});
window.addEventListener('hashchange',()=>{const id=location.hash.slice(1);if(demos.some(d=>d.id===id))selectConcept(id,true);});
const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;lastStamp=undefined;},{rootMargin:'80px'});observer.observe(document.querySelector('#lab')!);
function tick(stamp:number){
  if(disposed)return;
  if(playing&&visible&&!document.hidden){if(lastStamp!==undefined)model.advance((stamp-lastStamp)/1000);paint();lastStamp=stamp;}else lastStamp=undefined;
  raf=requestAnimationFrame(tick);
}
window.addEventListener('pagehide',e=>{if(e.persisted)return;disposed=true;cancelAnimationFrame(raf);observer.disconnect();view?.dispose();});
setPlaying(playing);paint();renderConcepts();renderDetail();raf=requestAnimationFrame(tick);
