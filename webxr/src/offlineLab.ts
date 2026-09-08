import { PreviewEngine, previewPresets, type PreviewFrame, type PreviewPreset } from "./lab/PreviewEngine";
import type { ContainerScene } from "./renderer/ContainerScene";
import type { ContainerPreset, LocalContentState, TiltState } from "./types";

const quiet: LocalContentState = { surfaceOffsetX: 0, surfaceOffsetY: 0, surfaceVelocityX: 0,
  surfaceVelocityY: 0, agitation: 0, particleSpread: 0, impactPulse: 0, wavePrimary: 0, waveSecondary: 0 };
const descriptions: Record<PreviewPreset, string> = {
  granular_single_marble_box: "ひと粒が左右・前後に転がる。前後は映像の補助表現、触覚・音はC++の左右・上下モデル。",
  granular_coin_box: "コインが滑り、床・壁・互いとの接触で転がる。振り方次第で裏返る3D物理描画。触覚・音は従来のC++モデル。",
  granular_single_coin_box: "コイン1枚の滑り・縁立ち・回転を接触から計算。フリップの決まった演出はなし。触覚・音は従来のC++モデル。",
  granular_sand_box: "傾けると崩れ、戻しても偏りが残る。砂の重心と堆積面を一緒に見る。",
  granular_sand_pile_box: "摩擦で堆積面と重心の偏りが残る砂pile。静止摩擦と流動時の摩擦を連動させて比較する。",
  liquid_small_box: "水面全体が寄り、片側の盛り上がりと周囲の引き込みが一続きに動く。戻る波の細部は映像表現、FWの重心・触覚指令はそのまま。",
  liquid_soda_bottle: "振るほど気泡が蓄積。限界でポンと弾け、泡が吹き出して静まる。",
  heartbeat_soft_object: "手の中でドクン、と脈打つ柔らかな物体。主拍と小さな追拍、ゆっくりした収縮を同じC++状態から描画・発音します。医療モデルや心拍計ではありません。"
};
function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing lab control: ${id}`);
  return found as T;
}
const ease = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/** Explicit offline model route. It has no hardware link or output API. */
export class OfflineLab {
  active = false;
  private engine?: PreviewEngine;
  private loading = false;
  private generation = 0;
  private frame?: PreviewFrame;
  private preset: PreviewPreset = "granular_sand_box";
  private paused = false;
  private modelError = "";
  private appliedRoll = 0;
  private appliedPitch = 0;
  private mode: "manual" | "sweep" | "shake" = "manual";
  private modeTime = 0;
  private elapsed = 0;
  private readonly peaks = [0, 0, 0, 0];
  private readonly panel = element<HTMLElement>("offline-lab");
  private readonly status = element<HTMLElement>("lab-status");
  private readonly roll = element<HTMLInputElement>("lab-roll");
  private readonly pitch = element<HTMLInputElement>("lab-pitch");
  private readonly pile = element<HTMLInputElement>("lab-pile");
  private readonly slow = element<HTMLInputElement>("lab-slow");

  /** Presentation-only consumers may observe the model, never advance it. */
  get soundFrame(): PreviewFrame | null {
    return this.active && !this.paused && !this.modelError ? this.frame ?? null : null;
  }

  constructor(private readonly scene: ContainerScene, private readonly hooks: {
    canEnter(): boolean; onPreset(preset: ContainerPreset): void; onClose(): void;
    onSilence?(): void;
  }) {
    element("lab-open").onclick = () => void this.open();
    element("lab-close").onclick = () => this.close();
    document.querySelectorAll<HTMLButtonElement>("[data-lab-preset]").forEach(button => {
      button.onclick = () => this.select(button.dataset.labPreset as PreviewPreset);
    });
    this.roll.oninput = this.pitch.oninput = () => {
      if (this.modelError) {
        this.roll.value = String(this.appliedRoll * 180 / Math.PI);
        this.pitch.value = String(this.appliedPitch * 180 / Math.PI);
        return;
      }
      this.mode = "manual";
      if (!this.modelError) this.paused = false;
      this.showAngles(); this.refreshPause();
    };
    element("lab-reset").onclick = () => this.reset();
    element("lab-sweep").onclick = () => { this.reset(); this.mode = "sweep"; };
    element("lab-shake").onclick = () => { if (this.modelError) return; this.paused = false; this.mode = "shake"; this.modeTime = 0; this.refreshPause(); };
    element("lab-pause").onclick = () => { if (this.modelError) return; this.paused = !this.paused; this.refreshPause(); };
    this.pile.onchange = () => {
      if (!this.engine) return;
      this.frame = this.engine.setParam("features.enable_granular_pile_demo", this.pile.checked ? 1 : 0);
      this.reset();
    };
  }

  async open(initialPreset?: string) {
    if (this.loading || this.active || !this.hooks.canEnter()) return;
    if (initialPreset && previewPresets.includes(initialPreset as PreviewPreset)) this.preset = initialPreset as PreviewPreset;
    const generation = ++this.generation;
    this.loading = true;
    element<HTMLButtonElement>("lab-open").disabled = true;
    try {
      this.engine ??= await PreviewEngine.create(this.preset);
      if (generation !== this.generation || !this.hooks.canEnter()) return;
      this.active = true;
      this.panel.hidden = false;
      document.body.classList.add("offline-lab-active");
      this.select(this.preset);
      element("mode-badge").textContent = "C++ Lab";
      element("lab-close").focus?.();
    } catch (error) {
      element("lab-open").textContent = `ラボを開けません: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.loading = false;
      element<HTMLButtonElement>("lab-open").disabled = false;
    }
  }

  close() {
    ++this.generation;
    if (!this.active) return;
    this.hooks.onSilence?.();
    this.active = false;
    this.panel.hidden = true;
    document.body.classList.remove("offline-lab-active");
    this.scene.setDeviceState(null);
    this.hooks.onClose();
    element("mode-badge").textContent = "Preview";
    element("lab-open").focus?.();
  }

  private select(preset: PreviewPreset) {
    if (!this.engine) return;
    this.hooks.onSilence?.();
    this.preset = preset;
    this.frame = this.engine.loadPreset(preset);
    this.pile.checked = this.frame.parameters.granularPile;
    const metadata: ContainerPreset = { preset, family: this.frame.family, container: { ...this.frame.container } };
    this.scene.setDeviceState(null);
    this.scene.setPreset(metadata, true);
    this.hooks.onPreset(metadata);
    document.querySelectorAll<HTMLButtonElement>("[data-lab-preset]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.labPreset === preset));
    });
    element("lab-description").textContent = descriptions[preset];
    element("lab-sand-option").hidden = preset !== "granular_sand_box";
    element("lab-pressure").hidden = preset !== "liquid_soda_bottle";
    this.reset();
  }

  private reset() {
    if (!this.engine) return;
    this.hooks.onSilence?.();
    this.frame = this.engine.reset();
    this.scene.setDeviceAcceleration(null);
    this.modelError = "";
    this.roll.disabled = false; this.pitch.disabled = false;
    this.mode = "manual"; this.modeTime = 0; this.elapsed = 0; this.paused = false;
    this.roll.value = "0"; this.pitch.value = "0"; this.peaks.fill(0);
    this.appliedRoll = 0; this.appliedPitch = 0;
    this.showAngles(); this.refreshPause();
  }

  private refreshPause() {
    if (this.paused) this.hooks.onSilence?.();
    const button = element("lab-pause");
    button.textContent = this.paused ? "再開" : "一時停止";
    button.setAttribute("aria-pressed", String(this.paused));
  }
  private showAngles() {
    element("lab-roll-value").textContent = `${Number(this.roll.value).toFixed(0)}°`;
    element("lab-pitch-value").textContent = `${Number(this.pitch.value).toFixed(0)}°`;
  }

  update(dt: number): { tilt: TiltState; content: LocalContentState } | null {
    if (!this.active || !this.engine || !this.frame) return null;
    if (!this.hooks.canEnter()) { this.close(); return null; }
    // Slow the complete model/input timeline, never just the visual effect.
    // This option exists only in the output-free Lab.
    dt *= this.slow.checked ? 0.25 : 1;
    let acceleration: readonly number[] | undefined;
    if (!this.paused) {
      this.modeTime += dt; this.elapsed += dt;
      if (this.mode === "sweep") {
        const t = this.modeTime;
        const degrees = t < 2 ? 50 * ease(t / 1.2) : t < 3.2 ? 50 * (1 - ease((t - 2) / 1.2)) :
          t < 5 ? 0 : t < 7 ? -50 * ease((t - 5) / 1.2) : t < 8.2 ? -50 * (1 - ease((t - 7) / 1.2)) : 0;
        this.roll.value = String(degrees);
        if (t > 10) this.mode = "manual";
      }
      const r = Number(this.roll.value) * Math.PI / 180, p = Number(this.pitch.value) * Math.PI / 180;
      const shaking = this.mode === "shake" && this.modeTime < 4.5;
      // A broad hand sway makes water's roll-over and settling readable. Keep
      // the existing fast shake for grains and the soda charge/pop comparison.
      const shakeOmega = this.preset === "liquid_small_box" ? Math.PI * 2.7 : Math.PI * 10;
      const coins = /coin/.test(this.preset), t = this.modeTime;
      // A spatial hand shake lifts a flat coin before a rim/wall encounter.
      // These are actual synthetic IMU inputs to BOTH models, not a flip event.
      const ax = shaking ? coins ? 1.44 * Math.sin(2 * Math.PI * 4.6 * t) : 1.65 * Math.sin(t * shakeOmega) : 0;
      const ay = shaking ? coins ? 1.68 * Math.sin(2 * Math.PI * 4.7 * t + .7) : .35 * Math.cos(t * shakeOmega) : 0;
      const az = shaking && coins ? 1.14 * Math.sin(2 * Math.PI * 3.2 * t + 1.1) : 0;
      try {
        this.frame = this.engine.step({ dtS: dt,
          accelG: [Math.sin(r) * Math.cos(p) + ax, Math.cos(r) * Math.cos(p) + ay, -Math.sin(p) + az],
          gyroDps: [0, 0, 0] });
        this.appliedRoll = r; this.appliedPitch = p;
      } catch (error) {
        this.paused = true; this.refreshPause();
        this.modelError = `モデル停止: ${error instanceof Error ? error.message : String(error)} — リセットで再開`;
        this.roll.disabled = true; this.pitch.disabled = true;
        this.status.textContent = this.modelError;
        return { tilt: { x: this.appliedPitch, y: this.appliedRoll }, content: quiet };
      }
      if (this.mode === "shake" && !shaking) this.mode = "manual";
      acceleration = [ax, ay, az];
      this.showAngles();
    }
    const frame = this.frame;
    const pressure = frame.mass.pressure;
    const r = this.appliedRoll, p = this.appliedPitch;
    this.scene.setDeviceState({ massX: frame.mass.posNorm[0], massY: frame.mass.posNorm[1],
      velocityX: frame.mass.velNormS[0], velocityY: frame.mass.velNormS[1], energy: frame.mass.energy,
      fill: frame.mass.fill, pileSlope: frame.mass.granularPileActive ? frame.mass.pileSlope : undefined,
      granularFlow: frame.mass.granularPileActive ? frame.mass.granularFlow : undefined,
      phaseS: frame.timeS, pressure: pressure.enabled ? pressure : undefined,
      heartbeat: frame.mass.heartbeat?.enabled ? frame.mass.heartbeat : undefined });
    this.scene.setDeviceOrientation({ pitchRad: p, rollRad: r });
    // Use the same bounded display cue as a connected device. Writing the
    // group's position directly would be overwritten by desktop placement.
    // Pause must not integrate positional recovery on the rendering clock.
    if (acceleration) this.scene.setDeviceAcceleration(acceleration, dt);
    element("mode-badge").textContent = "C++ Lab";
    this.status.textContent = this.modelError || (this.paused ? "一時停止 — 映像とモデルを同時に保持" :
      pressure.enabled && pressure.phase === "burst" ? "POP! — 同じイベントから衝撃と噴出を生成" :
      pressure.enabled && pressure.phase === "spent" ? "噴出完了 — リセットで再び密封" :
      frame.mass.heartbeat?.enabled ? `${Math.round(frame.mass.heartbeat.bpm)} BPM · 同じ拍動から振動・接平面の動き・収縮を生成` :
      this.mode === "sweep" ? "左右に傾け、水平へ戻す。同じ入力で比較中。" :
      this.mode === "shake" ? "揺動入力を再生中" : "左右・前後のスライダーで自由に探索");
    for (let i = 0; i < 4; ++i) {
      // Display-only short peak hold makes millisecond envelopes legible;
      // it never feeds back into the model or the content renderer.
      this.peaks[i] = Math.max(frame.channels[i], this.paused ? this.peaks[i] : this.peaks[i] * Math.exp(-dt * 8));
      document.querySelector<HTMLMeterElement>(`[data-lab-channel="${i}"]`)!.value = this.peaks[i];
    }
    element("lab-thumb").textContent = `${frame.tilt.thumbDeg.toFixed(1)}°`;
    element("lab-index").textContent = `${frame.tilt.indexDeg.toFixed(1)}°`;
    element("lab-model-state").textContent = frame.mass.heartbeat?.enabled
      ? `拍動 ${frame.mass.heartbeat.beatSequence} 周期 · 収縮 ${(frame.mass.heartbeat.contraction * 100).toFixed(0)}% · ${frame.timeS.toFixed(1)} s`
      : `重心 x ${(frame.mass.posNorm[0] * frame.container.span_x_m * 500).toFixed(1)} mm · 接触 ${frame.eventsTotal} 回 · ${frame.timeS.toFixed(1)} s`;
    element<HTMLMeterElement>("lab-charge").value = pressure.charge;
    element("lab-pressure-label").textContent = pressure.phase === "sealed" ? "密封" : pressure.phase === "burst" ? "噴出中" : "落ち着いた";
    return { tilt: { x: p, y: r }, content: quiet };
  }
}
