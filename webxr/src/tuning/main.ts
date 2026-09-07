import "./style.css";
import { HapticLink, parseTiltGainReadback, tiltGainsMatch, type DeviceSnapshot } from "../link/HapticLink";
import { PreviewEngine } from "../lab/PreviewEngine";
import { createSession, parseSession, parameterValues, recordChoice, axisDefinitions, getSessionSpace, getSessionDemo, getSessionPreset, demoDefinitions, type DemoId, type TuningSession, type SessionMode, type Point, type Choice } from "./TuningSession";
import { createProfile, parseProfile, serializeProfile, profileParametersFor, PROFILE_STORAGE_PREFIX, type TuningProfile } from "./TuningProfile";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const button = (id: string) => $<HTMLButtonElement>(id);
const input = (id: string) => $<HTMLInputElement>(id);
const prefix = "fresnel-preference-v1:";
const link = new HapticLink();
let engine: PreviewEngine | undefined;
let session: TuningSession | undefined;
let busy = false, epoch = 0;
type Slot = "a" | "b" | "baseline" | "preferred";
let applied: Slot | null = null;
let tested = new Set<string>();
let context = "";
let receipts: Receipt[] = [];
let curves: Partial<Record<Slot, Curve>> = {};
let lastFrame: number | undefined, lastTimestamp: number | undefined, lastSession: string | undefined;
let previouslyFresh = false;
let tiltReadback: Record<string, number> | null = null;
let formDemo: DemoId = "water";
interface Curve { trace: number[]; thumb: number[]; index: number[]; peak: number; maxTilt: number; saturated: number; events: number }
interface Receipt { trial: number; slot: string; parameters: Record<string, number>; ackFrames: number[]; at: string; started: boolean; tiltReadback?: Record<string, number> }
interface Archive { format: "haptic-preference-v1" | "haptic-preference-v2" | "haptic-preference-v3"; session: TuningSession; context: string; receipts: Receipt[] }
const mode = () => $<HTMLSelectElement>("mode").value as SessionMode;
const status = (message: string) => { $("status").textContent = message; };
const fail = (error: unknown) => status(error instanceof Error ? error.message : String(error));
const fresh = () => link.state.connection === "connected" && !link.state.stale && link.state.paired !== false;
const selectedDemo = () => $<HTMLSelectElement>("demo").value as DemoId;
const activeDemo = () => session ? getSessionDemo(session) : selectedDemo();
const demoDefinition = (demo = activeDemo()) => demoDefinitions.find(item => item.id === demo)!;
const axes = () => axisDefinitions(session ? getSessionSpace(session) : "combined", activeDemo());
const valuesOf = (point: Point) => parameterValues(point, session);
const formKeys = () => ({ gain:"resonance.master_gain", damping:activeDemo() === "sand" ? "mass.granular_static_friction" : "mass.damping_ratio_x", position:"tilt.max_tilt_deg", cm:"tilt.k_cm", tau:"tilt.k_tau", phi:"tilt.k_phi" });
const demoObjectives: Record<DemoId,string> = {
  water:"水が入った容器を傾けて戻したとき、どちらが実物らしいか",
  marble:"ビー玉1個が転がり壁に当たるとき、どちらが実物らしいか",
  sand:"砂が崩れ、傾けて戻しても重心が偏るとき、どちらが実物らしいか",
};
const profiles = new Map<string,TuningProfile>();
const unsavedProfiles = new Set<string>();
const profileStatus = (message: string) => { $("profile-status").textContent = message; };
const pointOf = (slot: Slot): Point => {
  if (!session) throw new Error("探索を開始してください");
  if (slot === "baseline") return session.baseline;
  if (slot === "preferred") return session.incumbent;
  if (!session.trial) throw new Error("このセッションの比較は終了しています");
  return session.trial[slot];
};
const parameterText = (p: Point) => {
  const values = valuesOf(p);
  return axes().map(axis => `${axis.label} ${values[axis.paths[0]].toFixed(3)}`).join(" / ");
};

function save() {
  if (!session) return;
  try { localStorage.setItem(prefix + session.id, JSON.stringify(archive())); $("storage-warning").hidden = true; }
  catch { $("storage-warning").hidden = false; }
  listSaved();
}
function archive(): Archive {
  if (!session) throw new Error("保存する探索がありません");
  return { format: `haptic-preference-v${session.version}`, session, context, receipts };
}
function readArchive(text: string): Archive {
  if (text.length > 2 * 1024 * 1024) throw new Error("記録ファイルが大きすぎます");
  const data = JSON.parse(text);
  if (!["haptic-preference-v1", "haptic-preference-v2", "haptic-preference-v3"].includes(data?.format) || typeof data.context !== "string" || data.context.length > 8192 ||
    !Array.isArray(data.receipts) || data.receipts.length > 1000) throw new Error("この形式の探索記録は読み込めません");
  const parsed = parseSession(JSON.stringify(data.session), mode());
  if (data.format !== `haptic-preference-v${parsed.version}`) throw new Error("探索記録のバージョンが一致しません");
  // Imported receipts are historical annotations, never authorization to start.
  const logs = data.receipts.map((r: Receipt) => {
    if (!r || !Number.isSafeInteger(r.trial) || r.trial < 0 || !["a", "b", "baseline", "preferred"].includes(r.slot) ||
      typeof r.at !== "string" || !Number.isFinite(Date.parse(r.at)) || typeof r.started !== "boolean" ||
      !Array.isArray(r.ackFrames) || r.ackFrames.length !== (parsed.version === 1 ? 6 : 11) || !r.ackFrames.every(n => Number.isSafeInteger(n) && n >= 0))
      throw new Error("不正な適用記録です");
    const p = r.parameters;
    const definitions = axisDefinitions(getSessionSpace(parsed),getSessionDemo(parsed));
    if (!p || typeof p !== "object" || Array.isArray(p)) throw new Error("適用記録のパラメータが不正です");
    const coordinates = definitions.map(axis => (p[axis.key]-axis.min)/(axis.max-axis.min));
    const expected = parameterValues(coordinates,parsed);
    if (Object.keys(p).length !== Object.keys(expected).length ||
      Object.entries(expected).some(([path,value]) => !Number.isFinite(p[path]) || Math.abs(p[path]-value) > 1e-9))
      throw new Error("適用記録のパラメータが範囲外です");
    let actual: Record<string,number> | undefined;
    if (parsed.version !== 1) {
      for (const [key, max] of [["tilt.max_tilt_deg",10],["tilt.k_cm",1],["tilt.k_tau",1],["tilt.k_phi",8]] as const) {
        if (!Number.isFinite(p[key]) || p[key] < 0 || p[key] > max) throw new Error("傾き係数の記録が範囲外です");
      }
      if (p["tilt.k_phi"] !== parsed.fixed["tilt.k_phi"] || !r.tiltReadback ||
        Object.keys(r.tiltReadback).sort().join() !== "tilt.k_cm,tilt.k_phi,tilt.k_tau,tilt.max_tilt_deg" || !tiltGainsMatch(r.tiltReadback,p))
        throw new Error("傾き係数の適用・読み戻し記録が一致しません");
      actual={...r.tiltReadback};
    }
    return { trial: r.trial, slot: r.slot, parameters: { ...p }, ackFrames: [...r.ackFrames], at: r.at, started: r.started, ...(actual ? {tiltReadback:actual} : {}) };
  });
  return { format: data.format, session: parsed, context: data.context, receipts: logs };
}
function listSaved() {
  const select = $<HTMLSelectElement>("saved");
  select.replaceChildren();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (!key.startsWith(prefix)) continue;
      try {
        const data = readArchive(localStorage.getItem(key)!);
        const label = `${demoDefinition(getSessionDemo(data.session)).label} · ${data.session.createdAt.slice(0, 16).replace("T", " ")} · ${data.session.history.length}比較 · ${data.session.reference || data.session.objective}`;
        const option = new Option(label, key); option.selected = data.session.id === session?.id;
        select.add(option);
      } catch { /* A corrupt or different-mode record remains untouched. */ }
    }
  } catch { /* Storage can be unavailable; export still works. */ }
}
function adopt(data: Archive) {
  session = data.session; context = data.context; receipts = data.receipts;
  $<HTMLSelectElement>("demo").value = getSessionDemo(session);
  syncMaterialForm();
  applied = null; tested.clear(); curves = {};
  input("objective").value = session.objective; input("reference").value = session.reference;
  const values = valuesOf(session.baseline);
  for (const [id,key] of Object.entries(formKeys())) if (values[key] !== undefined) input(id).value = String(values[key]);
  refresh(); save();
  status("保存した比較から再開しました。A/Bはもう一度確認してから回答してください。");
}

function syncMaterialForm() {
  formDemo=activeDemo();
  // Imported/selected points are continuous, not rounded to slider step grids.
  for (const id of Object.keys(formKeys())) input(id).step="any";
  input("phi").min=String(Number.MIN_VALUE);
  const materialAxis = axisDefinitions("combined",activeDemo())[1];
  input("damping").min = String(materialAxis.min); input("damping").max = String(materialAxis.max);
  $("damping-label").textContent = materialAxis.label;
  $("demo-note").textContent = activeDemo() === "sand"
    ? "砂の崩れにくさ（静摩擦0.20–0.90／動摩擦は7/11倍）も同時に探索。高いほど偏った重心が残ります。砂の摩擦調整には新AtomS3 FWが必要です。"
    : activeDemo() === "marble" ? "ビー玉1個の移動・壁の衝突を比較。減衰0.05–1.50をx/y連動で探索します。"
    : "水の流動・揺れ戻り・慣性を比較。減衰0.05–1.50をx/y連動で探索します。";
}
function shippedBaseline(demo: DemoId): Record<string,number> {
  if (!engine) throw new Error("C++モデルの準備中です");
  engine.loadPreset(demoDefinition(demo).preset);
  const p = engine.snapshot().parameters;
  return {"resonance.master_gain":p.masterGain,
    ...(demo === "sand" ? {"mass.granular_static_friction":p.staticFriction,"mass.granular_dynamic_friction":p.dynamicFriction}
      : {"mass.damping_ratio_x":p.dampingX,"mass.damping_ratio_y":p.dampingX}),
    "tilt.max_tilt_deg":p.tiltPositionGain,"tilt.k_cm":p.tiltKcm,"tilt.k_tau":p.tiltKtau,"tilt.k_phi":p.tiltGain};
}
function setBaselineForm(parameters: Record<string,number>) {
  syncMaterialForm();
  for (const [id,path] of Object.entries(formKeys())) {
    input(id).value = String(Math.max(Number(input(id).min),Math.min(Number(input(id).max),parameters[path])));
  }
}
function clearComparison() {
  session = undefined; applied = null; tested.clear(); curves = {}; context = ""; receipts = [];
}
function selectedProfile(): TuningProfile {
  const profile = profiles.get($<HTMLSelectElement>("profiles").value);
  if (!profile) throw new Error("保存した設定を選んでください");
  return profile;
}
function profileSummary(profile: TuningProfile) {
  const evidence = profile.reviewStatus === "rehearsal-only" ? "練習のみ・触感未評価"
    : profile.reviewStatus === "not-evaluated" ? "実機モード・比較未実施" : "本人の実機選好（独立した検証ではありません）";
  return `${demoDefinition(profile.demo).label} · ${evidence} · ${profile.comparisonCount}回答`;
}
function showProfile() {
  const profile = profiles.get($<HTMLSelectElement>("profiles").value);
  $("profile-detail").textContent = profile ? `${profileSummary(profile)}。${profile.objective}${profile.reference ? ` / ${profile.reference}` : ""}` : "保存した設定はまだありません。";
  refresh();
}
function listProfiles(preferredKey = $<HTMLSelectElement>("profiles").value) {
  // Keep an in-memory copy when browser storage is unavailable so export still works.
  try {
    for (let i=0;i<localStorage.length;i++) {
      const key=localStorage.key(i)!;
      if (!key.startsWith(PROFILE_STORAGE_PREFIX)) continue;
      if (unsavedProfiles.has(key)) continue;
      try { profiles.set(key,parseProfile(localStorage.getItem(key)!)); } catch { /* Do not overwrite invalid saved data. */ }
    }
  } catch { /* In-memory profiles remain usable. */ }
  const select=$<HTMLSelectElement>("profiles");
  select.replaceChildren(...Array.from(profiles,([key,profile])=>new Option(profileSummary(profile),key)));
  if (profiles.has(preferredKey)) select.value=preferredKey;
  showProfile();
}
function storeProfile(profile: TuningProfile) {
  const key=PROFILE_STORAGE_PREFIX+profile.sourceSession.id;
  profiles.set(key,profile);
  try { localStorage.setItem(key,serializeProfile(profile)); unsavedProfiles.delete(key); profileStatus("設定を保存しました。通常デモでも停止中に呼び出せます。"); }
  catch { unsavedProfiles.add(key); profileStatus("端末への保存に失敗しました。この画面から設定JSONを書き出してください。"); }
  listProfiles(key);
}
function downloadJSON(contents: string, filename: string) {
  const url=URL.createObjectURL(new Blob([contents],{type:"application/json"}));
  const a=document.createElement("a"); a.href=url; a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function renderMap() {
  const dimensions = axes();
  for (const id of ["map-x", "map-y"]) {
    const select = $<HTMLSelectElement>(id);
    const signature = dimensions.map(axis => axis.label).join("|");
    if (select.dataset.axes !== signature) {
      select.replaceChildren(...dimensions.map((axis,i)=>new Option(axis.label,String(i))));
      select.dataset.axes = signature;
      select.value = id === "map-x" ? "0" : String(Math.min(2, dimensions.length-1));
    }
  }
  const x=Number($<HTMLSelectElement>("map-x").value), y=Number($<HTMLSelectElement>("map-y").value);
  const ax=dimensions[x], ay=dimensions[y];
  const dots = session?.history.flatMap(h => [h.trial.a, h.trial.b]) ?? [];
  let svg = '<rect x="45" y="15" width="325" height="205" rx="7" fill="#122127" stroke="#3e555a"/>';
  for (let i = 1; i < 4; i++) svg += `<path d="M${45+i*81.25} 15v205 M45 ${15+i*51.25}h325" stroke="#293f45"/>`;
  for (const p of dots) svg += `<circle cx="${45+p[x]*325}" cy="${220-p[y]*205}" r="4" fill="#739b96" opacity=".6"/>`;
  if (session) svg += `<circle cx="${45+session.incumbent[x]*325}" cy="${220-session.incumbent[y]*205}" r="8" fill="none" stroke="#c9e8a9" stroke-width="2"/>`;
  svg += `<text x="45" y="242">${ax.min.toFixed(2)}</text><text x="339" y="242">${ax.max.toFixed(2)}</text><text x="7" y="222">${ay.min.toFixed(2)}</text><text x="7" y="23">${ay.max.toFixed(2)}</text>`;
  $("search-map").innerHTML = svg; // All interpolated values are validated numbers.
}
function renderCurves() {
  let svg = `<rect width="600" height="180" fill="#112025" rx="8"/><path d="M15 140H585 M15 70H585" stroke="#32494d"/><text x="20" y="165">同じ${session && session.version !== 1 ? "左右＋上下" : "左右"}入力 · 4秒</text><text x="450" y="25">計算振動包絡（非実測）</text>`;
  const summaries: string[] = [];
  let tiltSvg='<rect width="600" height="180" fill="#112025" rx="8"/><path d="M15 90H585 M15 35H585 M15 145H585" stroke="#32494d"/><text x="20" y="24">+10°</text><text x="20" y="166">−10°</text><text x="265" y="24">計算角度：親指 実線 / 人差し指 破線</text>';
  for (const [slot, curve] of Object.entries(curves)) {
    const colour = slot === "a" ? "#cce8ae" : slot === "b" ? "#82c5db" : "#bea8ca";
    const points = curve.trace.map((v, i) => `${15+i/(curve.trace.length-1)*570},${140-Math.min(1,v)*108}`).join(" ");
    svg += `<polyline points="${points}" fill="none" stroke="${colour}" stroke-width="2"/>`;
    for (const [i,trace] of [curve.thumb,curve.index].entries()) {
      const path=trace.map((v,j)=>`${15+j/(trace.length-1)*570},${90-v*5.5}`).join(" ");
      tiltSvg+=`<polyline points="${path}" fill="none" stroke="${colour}" stroke-width="1.6" ${i ? 'stroke-dasharray="5 3"' : ""}/>`;
    }
    summaries.push(`${slot.toUpperCase()}：振動包絡ピーク ${curve.peak.toFixed(3)} / 傾き指令最大 ${curve.maxTilt.toFixed(1)}° / 上限付近 ${Math.round(curve.saturated/curve.trace.length*100)}% / ${curve.events}イベント`);
  }
  $("response").innerHTML = svg;
  $("tilt-response").innerHTML = tiltSvg;
  $("model-summary").textContent = summaries.length ? `${summaries.join(" ｜ ")}。計算値は触感・実測・音の評価ではありません。` : "波形は計算値です。実際の振動・サーボ・音ではありません。";
}
function refresh() {
  const device = mode() === "device", ready = !!session?.trial && !busy && !!engine;
  $("device-controls").hidden = !device;
  $("mode-note").textContent = device ? "実機評価を学習します。スピーカー音量ではなく、同じ実物らしさを判断。" : "操作練習です。計算値を見ても触感は評価できません。この記録は実機の学習に混ぜません。";
  for (const id of Object.keys(formKeys())) $(`${id}-value`).textContent = Number(input(id).value).toFixed(2);
  $("trial-count").textContent = session?.trial ? `比較 ${session.trial.id}` : session ? "この探索は一区切り" : "条件を設定";
  $("learn-count").textContent = `${session?.observations.length ?? 0}件の選好`;
  $("session-caption").textContent = session ? `${demoDefinition().label} · ${session.mode === "device" ? "実機" : "練習"} · ${session.version === 1 ? "旧2軸・傾き変更なし" : `5軸同時・共通倍率 ${session.fixed["tilt.k_phi"].toFixed(2)}固定`} · ${session.objective}` : "条件を決めて探索を開始してください。";
  for (const slot of ["a", "b"] as const) {
    button(`apply-${slot}`).textContent = device ? `${slot.toUpperCase()}を適用（停止状態）` : `${slot.toUpperCase()}をC++で確認`;
    button(`apply-${slot}`).disabled = !ready || (device && !fresh());
    button(`start-${slot}`).hidden = !device;
    button(`start-${slot}`).disabled = !ready || !fresh() || applied !== slot || !input("handling").checked;
    $(`card-${slot}`).dataset.tested = String(tested.has(slot));
    $(`state-${slot}`).textContent = tested.has(slot) ? device ? "開始ACK確認 · 触って比較してください" : "C++計算を確認 · 練習のみ" : applied === slot ? session?.version !== 1 ? "傾き値の読み戻し・停止確認" : "適用ACK確認 · 値のreadbackなし" : "まだ比較していません";
  }
  document.querySelectorAll<HTMLButtonElement>("[data-choice]").forEach(b => {
    b.disabled = !ready || (b.dataset.choice !== "skip" && !(tested.has("a") && tested.has("b")));
  });
  for (const id of ["new-session", "resume", "baseline", "preferred", "connect", "disconnect"]) button(id).disabled = busy || !engine;
  button("baseline").disabled ||= !session || (device && !fresh());
  button("preferred").disabled = button("baseline").disabled;
  button("start-baseline").hidden = !device;
  button("start-baseline").disabled = !session || busy || !fresh() || applied !== "baseline" || !input("handling").checked;
  button("start-preferred").hidden = !device;
  button("start-preferred").disabled = !session || busy || !fresh() || applied !== "preferred" || !input("handling").checked;
  if (fresh() && link.state.telemetry?.run_mode === "live") {
    for (const slot of ["a","b","baseline","preferred"]) button(`start-${slot}`).disabled = true;
  }
  button("connect").disabled ||= link.state.connection !== "disconnected";
  button("disconnect").disabled ||= link.state.connection === "disconnected";
  button("export").disabled = !session;
  $<HTMLSelectElement>("mode").disabled = busy || link.state.connection !== "disconnected";
  input("import").disabled = busy;
  $<HTMLSelectElement>("demo").disabled = busy || !engine;
  button("save-profile").disabled = busy || !session || session.version === 1;
  button("reuse-profile").disabled = busy || !engine || !profiles.has($<HTMLSelectElement>("profiles").value);
  button("export-profile").disabled = !profiles.has($<HTMLSelectElement>("profiles").value);
  input("import-profile").disabled = busy;
  $("current-best").textContent = session ? `今選んでいる候補：${parameterText(session.incumbent)}。最適値の確定ではありません。` : "比較結果がたまると、好みの候補と探索の足跡がここに残ります。";
  $("candidate-values").replaceChildren(...(["a", "b"] as const).map(slot => {
    const div = document.createElement("div");
    div.textContent = session?.trial ? `${slot.toUpperCase()}：${parameterText(session.trial[slot])}` : "";
    return div;
  }));
  $("history").replaceChildren(...(session?.history.slice(-10).reverse() ?? []).map(h => {
    const li = document.createElement("li");
    li.textContent = `${h.trial.id}: ${({a:"A",b:"B",tie:"同じくらい",skip:"判断できない"})[h.choice]}${h.note ? ` — ${h.note}` : ""}`;
    return li;
  }));
  renderMap(); renderCurves();
  $("tilt-readback").textContent = fresh() && tiltReadback ? `最後に読み戻した傾き：位置 ${tiltReadback["tilt.max_tilt_deg"]} / 上下 ${tiltReadback["tilt.k_cm"]} / 左右差 ${tiltReadback["tilt.k_tau"]} / 共通倍率 ${tiltReadback["tilt.k_phi"]}` : "傾き係数の読み戻しは未確認。新AtomS3 FWが必要です。";
}

async function operation(action: (token: number) => Promise<void>) {
  if (busy) return;
  busy = true; const token = ++epoch; refresh();
  try { await action(token); }
  catch (error) { if (token === epoch) { applied = null; fail(error); } }
  finally { busy = false; refresh(); }
}
function check(token: number) { if (token !== epoch) throw new Error("停止により操作を取り消しました"); }
async function stop() {
  ++epoch; applied = null;
  if (link.state.connection === "connected") {
    try { await link.stop(); status("停止ACKを確認。次の候補は開始していません。"); }
    catch (error) { fail(error); }
  } else status("候補の開始権限を解除しました。未接続の実機の出力状態は確認できません。");
  refresh();
}
function canonicalContext(snapshot: DeviceSnapshot | null): string {
  const c = snapshot?.resolved?.container;
  if (!c || snapshot?.preset !== demoDefinition().preset || snapshot.resolved?.family !== (activeDemo() === "water" ? "Liquid" : "Granular")) return "";
  // Idle publishes a neutral/default MassState: pile_active is a running-state
  // flag, not configuration readback. Preset identity + friction ACKs bind sand.
  const values = [c.span_x_m,c.span_y_m,c.span_z_m,snapshot.mass?.fill,c.headspace,c.viscosity,c.particle_count,c.particle_hardness];
  if (!values.every(v => typeof v === "number" && Number.isFinite(v))) return "";
  return JSON.stringify({preset:snapshot.preset, values, model:snapshot.resolved?.model ?? null});
}
async function waitForAppliedContext(frame: number, token: number): Promise<string> {
  const deadline = performance.now() + 3500;
  while (performance.now() < deadline) {
    check(token);
    const state = link.state, snap = state.telemetry;
    const observed = canonicalContext(snap);
    if (fresh() && snap && snap.frame_counter >= frame && session && session.version !== 1 && snap.resolved?.model?.coherent_container_demo !== true)
      throw new Error("5軸探索は統合デモの制御則が必要です。対応するAtomS3 FWを使用してください。");
    if (fresh() && snap && snap.frame_counter >= frame && observed && snap.run_mode === "idle" &&
      snap.audio?.runtime_enabled === false && snap.safety?.tilt_disarmed === true) return observed;
    await new Promise(resolve => setTimeout(resolve, 35));
  }
  throw new Error("停止中の新しい素材設定を確認できません。状態取得後にもう一度適用してください。");
}
function simulate(point: Point): Curve {
  if (!engine) throw new Error("C++モデルの準備中です");
  engine.loadPreset(session ? getSessionPreset(session) : demoDefinition().preset);
  for (const [path, value] of Object.entries(valuesOf(point))) engine.setParam(path, value);
  const curve: Curve = {trace:[],thumb:[],index:[],peak:0,maxTilt:0,saturated:0,events:0};
  for (let i = 0; i < 400; i++) {
    const time = i*.01, angle = .65*Math.sin(time*Math.PI);
    const vertical = session && session.version !== 1 && time > 2 ? .28*Math.sin((time-2)*Math.PI*4)*Math.sin((time-2)*Math.PI/2) : 0;
    const frame = engine.step({dtS:.01,accelG:[Math.sin(angle),Math.cos(angle)+vertical,0]});
    const amplitude = Math.max(...frame.channels);
    curve.trace.push(amplitude); curve.peak = Math.max(curve.peak,amplitude);
    curve.maxTilt = Math.max(curve.maxTilt,Math.abs(frame.tilt.thumbDeg),Math.abs(frame.tilt.indexDeg));
    curve.thumb.push(frame.tilt.thumbDeg); curve.index.push(frame.tilt.indexDeg);
    if (Math.max(Math.abs(frame.tilt.thumbDeg),Math.abs(frame.tilt.indexDeg)) >= 9.9) curve.saturated++;
    curve.events = frame.eventsTotal;
  }
  return curve;
}
async function apply(slot: Slot) {
  await operation(token => applyCandidate(slot,token));
}
async function applyCandidate(slot: Slot, token: number) {
    const point = pointOf(slot); applied = null;
    if (mode() === "device") {
      status(`${slot.toUpperCase()}を停止中に適用しています…`);
      const acks = await link.applyTuning(getSessionPreset(session!), valuesOf(point)); check(token);
      const observed = await waitForAppliedContext(acks.at(-1)!.frame,token); check(token);
      if (context && observed !== context) throw new Error("容器・材質の読戻しがこの探索の基準と異なります。新しいセッションで比較してください。");
      context = observed;
      tiltReadback = parseTiltGainReadback(acks.at(-1)!.detail);
      receipts.push({trial:session!.trial?.id ?? 0,slot,parameters:valuesOf(point),ackFrames:acks.map(a=>a.frame),at:new Date().toISOString(),started:false,
        ...(session?.version !== 1 && tiltReadback ? {tiltReadback:{...tiltReadback}} : {})});
      if (receipts.length > 1000) receipts.shift();
      applied = slot;
      status(`${slot.toUpperCase()}の${acks.length}件の実行ACKと停止状態を確認。${session?.version !== 1 ? "傾き4係数の読み戻しも一致。振動・素材係数はACK確認。" : "ゲイン数値のreadbackはありません。"}開始は別操作です。`);
      if (slot === "baseline") status("初期基準を適用して停止中です。下の開始ボタンで再確認できます。A/Bの回答用には使いません。");
    } else {
      curves[slot] = simulate(point); check(token);
      if (slot === "a" || slot === "b") tested.add(slot);
      status(`${slot.toUpperCase()}のC++計算を確認しました。練習の回答は実機の学習に使用しません。`);
      $("model-details").setAttribute("open", "");
    }
    save();
}
async function start(slot: Slot) {
  await operation(token => startCandidate(slot,token));
}
async function startCandidate(slot: Slot, token: number) {
    if (mode() !== "device" || applied !== slot || !input("handling").checked || !fresh()) throw new Error("候補の適用と把持の準備を確認してください");
    if (link.state.telemetry?.run_mode === "live") { status("すでに提示中です。Q/Wで停止・再適用してから再提示できます。"); return; }
    const observed = canonicalContext(link.state.telemetry);
    if (!context || observed !== context) throw new Error("比較条件が変わりました。候補を再適用してください。");
    if (session && session.version !== 1) {
      const ack = await link.getState(); check(token);
      const actual = parseTiltGainReadback(ack.detail);
      if (!tiltGainsMatch(actual,valuesOf(pointOf(slot)))) throw new Error("傾き係数が変わりました。候補を再適用してください。");
      tiltReadback = actual;
      const current = await waitForAppliedContext(ack.frame,token); check(token);
      if (current !== context) throw new Error("比較条件が変わりました。候補を再適用してください。");
    }
    await link.start({audio:true,tilt:true}); check(token);
    if (slot === "a" || slot === "b") tested.add(slot);
    const receipt = receipts.at(-1); if (receipt?.slot === slot) receipt.started = true;
    save(); status(`${slot.toUpperCase()}の開始ACKを確認。左右に傾けて戻し、実物らしさを比較してください。`);
}

async function present(slot: "a" | "b") {
  await operation(async token => {
    if (!session?.trial || !engine) throw new Error("まず探索を開始してください");
    if (mode() === "device" && (!input("handling").checked || !fresh()))
      throw new Error("接続と把持の準備チェック後、Q/Wで候補を提示できます。");
    await applyCandidate(slot, token); check(token);
    if (mode() === "device") await startCandidate(slot, token);
  });
}
async function vote(choice: Choice) {
  await operation(async token => {
    if (!session || (choice !== "skip" && !(tested.has("a") && tested.has("b")))) throw new Error("A/Bを両方確認してください");
    if (mode() === "device" && link.state.connection === "connected") { await link.stop(); check(token); }
    session = recordChoice(session,choice,input("note").value);
    tested.clear(); applied = null; curves = {}; input("note").value = "";
    save(); status(choice === "skip" ? "判断保留として記録。学習には加えていません。" : "比較を保存し、次の候補を提案しました。出力は停止したままです。");
  });
}

for (const id of Object.keys(formKeys())) input(id).oninput = refresh;
for (const id of ["map-x", "map-y"]) $(id).onchange = renderMap;
input("handling").onchange = refresh;
button("stop").onclick = () => void stop();
for (const slot of ["a", "b"] as const) {
  button(`apply-${slot}`).onclick = () => void apply(slot);
  button(`start-${slot}`).onclick = () => void start(slot);
}
button("baseline").onclick = () => void apply("baseline");
button("start-baseline").onclick = () => void start("baseline");
button("preferred").onclick = () => void apply("preferred");
button("start-preferred").onclick = () => void start("preferred");
document.querySelectorAll<HTMLButtonElement>("[data-choice]").forEach(b => b.onclick = () => void vote(b.dataset.choice as Choice));
button("new-session").onclick = () => void operation(async token => {
  if (link.state.connection === "connected") { await link.stop(); check(token); }
  save();
  const definitions = axisDefinitions("combined",selectedDemo());
  const physical = Object.fromEntries(Object.entries(formKeys()).map(([id,path]) => [path,Number(input(id).value)]));
  const baseline: Point = definitions.map(axis => (physical[axis.key]-axis.min)/(axis.max-axis.min));
  session = createSession(mode(),baseline,input("objective").value,input("reference").value,crypto.getRandomValues(new Uint32Array(1))[0],
    {space:"combined",demo:selectedDemo(),fixed:{"tilt.k_phi":Number(input("phi").value)}});
  tested.clear(); applied = null; curves = {}; context = ""; receipts = []; save();
  status("新しい比較を用意しました。候補を適用しても自動では開始しません。");
});
$<HTMLSelectElement>("mode").onchange = () => {
  save(); ++epoch; clearComparison();
  input("handling").checked = false; listSaved(); refresh(); status("このモードで新しく探索するか、保存した記録を再開してください。");
};
$<HTMLSelectElement>("demo").onchange = () => {
  const target=selectedDemo(), previous=formDemo;
  let changed=false;
  void operation(async token => {
    if (link.state.connection === "connected") { await link.stop(); check(token); }
    save(); clearComparison();
    setBaselineForm(shippedBaseline(target)); input("objective").value=demoObjectives[target];
    changed=true;
    listSaved();
    status("素材を切り替えました。初期値は同梱C++プリセットです。新しい探索を始めるか、保存した設定を開始点にしてください。");
  }).then(()=>{
    // A failed/cancelled Stop must not relabel the retained session as another material.
    if (!changed) $<HTMLSelectElement>("demo").value=session ? getSessionDemo(session) : previous;
    syncMaterialForm(); refresh();
  });
};
button("save-profile").onclick = () => {
  try { if (!session) throw new Error("探索を開始してください"); storeProfile(createProfile(session)); } catch(error) { fail(error); }
};
$("profiles").onchange = showProfile;
button("export-profile").onclick = () => {
  try { const p=selectedProfile(); downloadJSON(serializeProfile(p),`haptic-profile-${p.demo}-${p.sourceSession.id}.json`); } catch(error) { fail(error); }
};
input("import-profile").onchange = () => void operation(async token => {
  const file=input("import-profile").files?.[0]; if (!file) return;
  if (file.size > 64*1024) throw new Error("設定ファイルが大きすぎます");
  const profile=parseProfile(await file.text()); check(token);
  storeProfile(profile); input("import-profile").value="";
});
button("reuse-profile").onclick = () => void operation(async token => {
  const profile=selectedProfile(), target=selectedDemo();
  const values=profileParametersFor(profile,target,shippedBaseline(target));
  if (link.state.connection === "connected") { await link.stop(); check(token); }
  save(); clearComparison(); setBaselineForm(values); input("objective").value=demoObjectives[target];
  input("reference").value=`開始点: ${profile.demo}/${profile.sourceSession.id} (${profile.sourceSession.mode}); 別条件は未評価`.slice(0,300);
  const message=profile.demo === target ? "保存した全係数を開始点にしました。"
    : "共通の振動・傾き係数だけを開始点にしました。素材の減衰／摩擦は移していません。";
  profileStatus(`${message} 比較票は引き継ぎません。「この条件で探索を始める」で新しい比較へ。`);
  status("開始点を準備しました。実機への適用・自動開始はしていません。");
});
window.addEventListener("storage",event=>{ if (event.key?.startsWith(PROFILE_STORAGE_PREFIX)) listProfiles(); });
button("connect").onclick = () => void operation(async token => {
  if (mode() !== "device") return;
  await link.connect($<HTMLSelectElement>("transport").value as "auto"|"usb"|"serial"); check(token);
  const ack = await link.getState(); check(token); tiltReadback=parseTiltGainReadback(ack.detail);
  status(tiltReadback ? "接続し、傾き係数を読み戻しました。候補を適用してから比較します。" : "接続しました。5軸探索には新しいAtomS3 FWが必要です。旧2軸の保存セッションはそのまま使えます。");
});
button("disconnect").onclick = () => void operation(async () => { applied = null; tested.clear(); try { await link.stop(); } finally { await link.disconnect(); } status("切断しました。"); });
button("export").onclick = () => {
  try {
    const url = URL.createObjectURL(new Blob([JSON.stringify(archive(),null,2)],{type:"application/json"}));
    const a = document.createElement("a"); a.href=url; a.download=`haptic-tuning-${session!.mode}-${session!.id}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  } catch (error) { fail(error); }
};
input("import").onchange = () => void operation(async token => {
  const file = input("import").files?.[0]; if (!file) return;
  if (file.size > 2*1024*1024) throw new Error("記録ファイルが大きすぎます");
  const data = readArchive(await file.text()); check(token);
  if (link.state.connection === "connected") { await link.stop(); check(token); }
  save(); adopt(data); input("import").value="";
});
button("resume").onclick = () => void operation(async token => {
  const text = localStorage.getItem($<HTMLSelectElement>("saved").value);
  if (!text) throw new Error("再開する記録を選んでください");
  const data = readArchive(text);
  if (link.state.connection === "connected") { await link.stop(); check(token); }
  save(); adopt(data);
});
$("demo-link").onclick = event => { if (link.state.connection !== "disconnected") { event.preventDefault(); status("停止して切断してからデモへ戻ってください。"); } };
document.addEventListener("keydown", event => {
  if (event.defaultPrevented || event.repeat || event.isComposing) return;
  if (event.key === "Escape") { event.preventDefault(); void stop(); return; }
  const target=event.target instanceof Element ? event.target : null;
  const textInput = target instanceof HTMLInputElement && !["checkbox","radio","range","button","submit"].includes(target.type);
  if (event.ctrlKey || event.metaKey || event.altKey || textInput || target?.closest("textarea,select,[contenteditable]:not([contenteditable=false])")) return;
  const key=event.key.toLowerCase();
  if (key === " ") { event.preventDefault(); void stop(); return; }
  if (key === "q" || key === "w") { event.preventDefault(); void present(key === "q" ? "a" : "b"); return; }
  const choice = ({a:"a",d:"b",s:"tie",x:"skip"} as const)[key as "a"|"d"|"s"|"x"];
  if (choice) { event.preventDefault(); void vote(choice); }
});
document.addEventListener("visibilitychange", () => { if (document.hidden && link.state.connection === "connected") void stop(); });
window.addEventListener("pagehide", () => { ++epoch; if (link.state.connection === "connected") void link.stop().catch(()=>{}); });
link.subscribe(state => {
  const currentFresh = state.connection === "connected" && !state.stale && state.paired !== false;
  const snapshot = state.telemetry, ackSession = state.lastAck?.session;
  const rewind = currentFresh && snapshot && ((lastFrame !== undefined && snapshot.frame_counter < lastFrame) ||
    (lastTimestamp !== undefined && snapshot.timestamp_ms < lastTimestamp));
  const replaced = ackSession && lastSession && ackSession !== lastSession;
  const wasFresh = previouslyFresh, lost = wasFresh && !currentFresh;
  // Update observer identity before any Stop call, which can synchronously
  // emit another link notification while this listener is still running.
  if (currentFresh && snapshot) { lastFrame=snapshot.frame_counter; lastTimestamp=snapshot.timestamp_ms; }
  if (ackSession) lastSession=ackSession;
  if (state.connection === "disconnected") { lastFrame=undefined; lastTimestamp=undefined; lastSession=undefined; }
  previouslyFresh=currentFresh;
  if (mode() === "device" && (rewind || replaced || lost || state.connection === "disconnected")) {
    const hadAuthority = applied !== null || tested.size > 0 || (busy && wasFresh);
    applied = null; tested.clear(); input("handling").checked = false;
    tiltReadback = null;
    if (hadAuthority) {
      ++epoch;
      status("実機の再起動・通信変化を検出しました。候補を再適用してから比較してください。");
      // Cancel a partially running command transaction; do not let a late ACK
      // authorize Start for settings that may have reset on the device.
      if (busy && state.connection === "connected") void link.stop().catch(fail);
    }
  }
  $("link-status").textContent = state.error || `${state.connection === "connected" ? "USB接続" : "未接続"}${state.stale ? " · テレメトリ待ち" : ""}${state.pendingCommand ? ` · ${state.pendingCommand}` : ""}`;
  const stopped = currentFresh && snapshot?.run_mode === "idle" && snapshot.audio?.runtime_enabled === false && snapshot.safety?.tilt_disarmed === true;
  $("output-state").textContent = state.connection !== "connected" ? "実機未接続 · 出力状態は未確認" :
    !currentFresh ? "実機状態が古い · 出力状態は未確認" : snapshot?.run_mode === "live" ? "実機 LIVE · 停止はいつでも" :
      stopped ? "実機の停止状態を確認" : "実機の出力状態は未確認";
  refresh();
});
refresh(); listSaved(); listProfiles();
void PreviewEngine.create("liquid_small_box").then(value => {
  engine=value;
  setBaselineForm(shippedBaseline(selectedDemo()));
  status("準備できました。初期値は同梱C++の水プリセットです。実機から読み取った値ではありません。"); refresh();
}).catch(fail);
