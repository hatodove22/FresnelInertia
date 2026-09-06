import './series.css';

const chapterTitle=(title:string)=>title.split('、').map((part,index)=>`<span>${part}${index===0?'、':''}</span>`).join('');

const properties = [
  {id:'shape', action:'GRASP', title:'つまむと、形状。', text:'触れる場所の曲面に合わせて、接触面の向きが変わる。目に見える形と、指先の局所的な傾きが重なります。'},
  {id:'stiffness', action:'SQUEEZE', title:'握り込むと、硬さ。', text:'握る力から仮想物体のへこみを計算。その形の変化を、指先が触れる面の傾きにも反映します。'},
  {id:'center-of-gravity', action:'TILT', title:'傾けると、重心。', text:'握る位置と重心のずれ、重力、傾きから回転の手がかりを計算。傾けたまま止めても続く感覚を提案しています。'},
  {id:'inertia', action:'SHAKE', title:'振ると、慣性。', text:'動き出し、減速、切り返し。横方向と縦方向の加速度に応じて変わる接触面の動きを見比べます。'},
];
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <a class="skip-link" href="#film">動画へ移動</a>
  <header class="series-header"><a href="/" class="series-brand"><span>F↗</span> Fresnel <b>Series</b></a><nav aria-label="ナビゲーション"><a href="/">現在のデバイス</a><a href="#references">研究の歩み ↗</a></nav></header>
  <main>
    <section class="series-intro" aria-labelledby="series-title"><div><p class="series-eyebrow">THE FRESNEL SERIES · AN EXPLAINER FILM</p><h1 id="series-title">ひとつの傾きから、<br><em>4つの感覚へ。</em></h1></div><p class="series-lead">形状、硬さ、重心位置、慣性。<br>指先が触れる小さな面の向きから、<br>触覚の可能性を広げてきた一連の提案。</p></section>
    <section class="series-film" id="film" aria-label="フレネルシリーズの解説動画">
      <div class="series-film-top"><span>WHC2025 DEMO / ACTUAL CAD</span><span>ENGLISH NARRATION + CAPTIONS</span></div>
      <div class="series-player"><video id="series-video" controls playsinline preload="metadata" poster="/media/fresnel-series-poster.png" aria-label="フレネルシリーズ解説動画・英語音声と英語字幕"><source src="/media/fresnel-series-explainer-en.mp4" type="video/mp4"><track kind="subtitles" src="/media/fresnel-series-captions-en.vtt" srclang="en" label="English">動画を再生できない場合は、下のリンクからダウンロードしてください。</video></div>
      <div class="series-film-meta"><span><span id="series-duration"></span>1080p · 英語の合成ナレーション</span><a href="/media/fresnel-series-explainer-en.mp4" download>MP4をダウンロード ↓</a></div>
      <p class="series-play-status" id="series-play-status" role="status"></p>
      <div class="series-chapters" aria-label="見たい章から再生">${properties.map((p,i)=>`<button data-chapter="${p.id}" disabled aria-label="${p.title}の章から再生"><span class="series-chapter-number">0${i+1}</span><span><small>${p.action}</small><strong>${chapterTitle(p.title)}</strong></span><span class="series-chapter-play" aria-hidden="true">▷</span></button>`).join('')}</div>
      <p class="series-scope">WHC2025Demoの3面構成を使って、各提案の原理を説明しています。仮想物体と駆動角度は説明用で、実機の動作計測ではありません。各研究の試作機・実験条件は異なります。</p>
    </section>
    <section class="series-properties" aria-labelledby="properties-title"><div class="series-section-heading"><p class="series-eyebrow">INPUT → CONTACT PLANE → PERCEPTION</p><h2 id="properties-title">動作が変わる。<br>伝える手がかりが変わる。</h2><p>親指、人差し指、中指。<br>3つの接触面を通して、<br>手の動きと見える物体をつなぐ。</p></div><div class="series-property-grid">${properties.map((p,i)=>`<article><span class="series-property-index">0${i+1}<small>${p.action}</small></span><h3>${p.title}</h3><p>${p.text}</p></article>`).join('')}</div></section>
    <section class="series-reading" aria-label="字幕と研究の位置づけ"><details><summary>英語ナレーションを読む <span>＋</span></summary><div id="series-transcript" lang="en"><p>英語テキストを読み込んでいます。</p></div><div class="series-text-links"><a href="/media/fresnel-series-transcript-en.txt" download>Transcript ↓</a><a href="/media/fresnel-series-captions-en.vtt" download>English subtitles ↓</a></div></details><div class="series-evidence-note"><p class="series-eyebrow">WHAT THE RESEARCH SHOWS</p><h3>感覚の提案と、<br>実験で確かめたこと。</h3><p>形状研究では、視覚と触覚の一致感を評価。硬さ研究の著者原稿では一致感は改善しましたが、柔らかさ評価の変化は統計的に明確ではありませんでした。重心・慣性の動画は、提案モデルとデモの原理を説明しています。</p></div></section>
    <section class="series-references" id="references" aria-labelledby="references-title"><p class="series-eyebrow">RESEARCH LINEAGE</p><h2 id="references-title">フレネルの歩み。</h2><p class="series-reference-intro">共通する原理から、形状・変形・動的な手がかりへ。公開一次資料からたどれます。</p><ol>
      <li><span>2024</span><a href="https://conference.vrsj.org/ac2024/program/doc/3G-19.pdf" target="_blank" rel="noopener noreferrer"><strong>フレネルシェイプ</strong><small>各指先接平面の傾きを操作する形状提示装置 · VRSJ</small></a><span aria-hidden="true">↗</span></li>
      <li><span>2025</span><a href="https://doi.org/10.1145/3706599.3719778" target="_blank" rel="noopener noreferrer"><strong>FresnelDeformable</strong><small>Fingertip plane tilt + pseudo-stiffness · CHI Extended Abstracts</small></a><span aria-hidden="true">↗</span></li>
      <li><span>2025</span><a href="https://di0zxmb8pwajl.cloudfront.net/khc/conference/whc/abs2/D1-04.pdf" target="_blank" rel="noopener noreferrer"><strong>Bottle of Water</strong><small>Stiffness, mass, and inertia · World Haptics demonstration</small></a><span aria-hidden="true">↗</span></li>
      <li><span>2025</span><a href="https://www.conference.vrsj.org/ac2025/program/doc/1D2-04.pdf" target="_blank" rel="noopener noreferrer"><strong>剛性・慣性提示へ</strong><small>各指先接平面の動的な傾き操作 · VRSJ</small></a><span aria-hidden="true">↗</span></li>
      <li><span>2026</span><a href="https://ieeeaccess.ieee.org/featured-article/fresnelshape-a-contact-plane-tilt-haptic-display-for-enhancing-visuo-haptic-coherence/" target="_blank" rel="noopener noreferrer"><strong>FresnelShape</strong><small>Enhancing visuo-haptic coherence · IEEE Access</small></a><span aria-hidden="true">↗</span></li>
    </ol></section>
    <a href="/" class="series-next"><div><p class="series-eyebrow">CONTINUE EXPLORING</p><h2>そして、中身が<br>動く触覚へ。</h2><p>2つの接触面と4つの振動子。現在のFresnel Inertiaを見る。</p></div><span aria-hidden="true">↗</span></a>
  </main><footer class="series-footer"><span>FRESNEL / LOCAL CONTACT, RICHER TOUCH.</span><a href="/atlas.html">未来のデモ図鑑 ↗</a></footer>
`;

const video = document.querySelector<HTMLVideoElement>('#series-video')!;
const status = document.querySelector<HTMLElement>('#series-play-status')!;
const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-chapter]')];
let chapters: {id:string; start:number}[] = [];
const updateDuration = () => {
  if (Number.isFinite(video.duration)) document.querySelector('#series-duration')!.textContent = `${Math.floor(video.duration/60)}:${String(Math.floor(video.duration%60)).padStart(2,'0')} · `;
};
const enableChapters = () => buttons.forEach(button=>{button.disabled = video.readyState < 1 || !chapters.some(c=>c.id===button.dataset.chapter);});
video.addEventListener('loadedmetadata',()=>{updateDuration();enableChapters();});
video.addEventListener('error',()=>{status.textContent='動画を読み込めませんでした。MP4のダウンロードリンクをお試しください。';});
buttons.forEach(button=>button.addEventListener('click',async()=>{
  const chapter = chapters.find(c=>c.id===button.dataset.chapter); if (!chapter) return;
  video.currentTime=chapter.start; status.textContent='';
  video.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});
  try {await video.play();} catch {status.textContent='動画の再生ボタンを押すと、この章から再生します。';}
}));
video.addEventListener('timeupdate',()=>{
  const current=[...chapters].reverse().find(c=>video.currentTime >= c.start);
  buttons.forEach(button=>{if (button.dataset.chapter===current?.id) button.setAttribute('aria-current','true'); else button.removeAttribute('aria-current');});
});
fetch('/media/fresnel-series-chapters.json').then(async response=>{
  if (!response.ok) throw new Error('Chapter file unavailable');
  const data = await response.json() as {chapters:{id:string;start:number}[]};
  chapters=data.chapters.filter(c=>typeof c.id==='string' && Number.isFinite(c.start)&&c.start>=0).sort((a,b)=>a.start-b.start); enableChapters();
}).catch(()=>{status.textContent='章リンクを読み込めませんでした。動画のシークバーから移動できます。';});
fetch('/media/fresnel-series-transcript-en.txt').then(async response=>{
  if (!response.ok) throw new Error('Transcript unavailable');
  const text=await response.text(), body=document.querySelector('#series-transcript')!; body.replaceChildren();
  for (const paragraph of text.split(/\r?\n\s*\r?\n/)) {const p=document.createElement('p');p.textContent=paragraph;body.append(p);}
}).catch(()=>{document.querySelector('#series-transcript')!.textContent='Use the transcript download link below.';});
