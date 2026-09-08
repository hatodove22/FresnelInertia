import { HapticLink, HapticLinkError, type DeviceSnapshot } from "./link/HapticLink";
import type { DevicePanelState, DevicePanelCallbacks } from "./renderer/SpatialControlPanel";
import type { ContainerPreset, LocalContentState, TiltState } from "./types";
import { contentFromSnapshot, orientationFromSnapshot, resolvedPresetFromSnapshot, visualSampleInterval, type DeviceVisualSink } from "./visualState";
import { parseProfile, serializeProfile, PROFILE_STORAGE_PREFIX, type TuningProfile } from "./tuning/TuningProfile";
import { demoDefinitions } from "./tuning/RepresentativeDemos";

const devicePresets = [
  ["granular_single_marble_box", "ひと粒のビー玉"],
  ["granular_sand_box", "細かい砂"],
  ["granular_sand_pile_box", "堆積する砂（新FW）"],
  ["liquid_small_box", "水の容器"],
  ["liquid_soda_bottle", "炭酸ボトル（新FW）"],
  ["hybrid_ice_water", "氷と水"],
  ["granular_bead_box", "ビーズ"],
  ["granular_coin_box", "コイン"],
  ["granular_single_coin_box", "コイン1枚（新FW）"],
  ["liquid_dense_jar", "粘性のある液体"],
  ["liquid_half_tube", "細長い容器の液体"],
  ["heartbeat_soft_object", "心臓 · 拍動（Atom・Stamp 新FW）"]
];
const quietContent: LocalContentState = {
  surfaceOffsetX: 0, surfaceOffsetY: 0, surfaceVelocityX: 0, surfaceVelocityY: 0,
  agitation: 0, particleSpread: 0, impactPulse: 0, wavePrimary: 0, waveSecondary: 0
};

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing device control: ${id}`);
  return found as T;
}

/** Device state owns the connected scene; preview remains an explicit separate mode. */
export class DeviceDemo {
  readonly link = new HapticLink();
  active = false;
  private signature = "";
  private latest: DeviceSnapshot | null = null;
  private applied: ContainerPreset | null = null;
  private error = "";
  private operations = 0;
  private get busy() { return this.operations > 0; }
  private get servoRetrying() {
    const { connection, paired, stale, telemetry } = this.link.state;
    // Only the device's fresh, exact recovery state grants this interpretation.
    // Retained telemetry or an ordinary latched fault must not imply recovery.
    return connection === "connected" && paired !== false && !stale &&
      telemetry?.run_mode === "live" && telemetry.tilt_servo?.state === 1 &&
      telemetry.tilt_servo.fault === 2 && telemetry.safety?.tilt_disarmed === false;
  }
  private selectedPresetPending = "";
  private profileApplyIncomplete = false;
  private profileMessage = "";
  private readonly profiles = new Map<string, TuningProfile>();
  // Optional: older embedded/test clients have only the original controls.
  private readonly profileSelect = document.getElementById("device-profile-select") as HTMLSelectElement | null;
  private readonly profileApply = document.getElementById("device-profile-apply") as HTMLButtonElement | null;
  private readonly profileImport = document.getElementById("device-profile-import") as HTMLInputElement | null;
  private readonly profileExport = document.getElementById("device-profile-export") as HTMLButtonElement | null;
  private readonly profileDetail = document.getElementById("device-profile-detail");
  private get hasProfileControls() { return typeof this.profileSelect?.replaceChildren === "function"; }
  private tilt: TiltState = { x: 0, y: 0 };
  private gravity: number[] | null = null;
  private visualTimestampMs: number | null = null;
  private processedSnapshot: DeviceSnapshot | null = null;
  private hasDeviceState = false;
  private readonly status = element<HTMLElement>("device-status");
  private readonly detail = element<HTMLElement>("device-detail");
  private readonly connectButton = element<HTMLButtonElement>("device-connect");
  private readonly previewButton = element<HTMLButtonElement>("device-preview");
  private readonly startButton = element<HTMLButtonElement>("device-start");
  private readonly stopButton = element<HTMLButtonElement>("device-stop");
  private readonly clearButton = element<HTMLButtonElement>("device-clear");
  private readonly presetSelect = element<HTMLSelectElement>("device-preset");
  private readonly audioChoice = element<HTMLInputElement>("device-audio");
  private readonly tiltChoice = element<HTMLInputElement>("device-tilt");
  private readonly fillInput = element<HTMLInputElement>("device-fill");
  private readonly fillButton = element<HTMLButtonElement>("device-apply-fill");

  constructor(private readonly container: DeviceVisualSink, private readonly hooks: {
    onPreset(preset: ContainerPreset): void;
    onPreview(): void;
    onPanel?(state: DevicePanelState | null, callbacks: DevicePanelCallbacks): void;
  }) {
    for (const [name, label] of devicePresets) {
      this.presetSelect.add(new Option(label, name));
    }
    this.connectButton.onclick = () => void this.perform(async () => {
      if (this.link.state.connection !== "connected") {
        const transport = element<HTMLSelectElement>("device-transport").value as "auto" | "serial" | "usb";
        await this.link.connect(transport);
        this.active = true;
        this.gravity = null;
        this.visualTimestampMs = null;
        this.container.setDeviceAcceleration?.(null);
        this.processedSnapshot = null;
      }
      await this.link.getState();
      // Explicit recovery adopts reported state, not the old requested preset.
      this.selectedPresetPending = "";
    });
    this.previewButton.onclick = () => void this.perform(async () => {
      if (this.link.state.connection === "connected") {
        await this.link.stop();
        await this.link.disconnect();
      }
      this.active = false;
      this.latest = null;
      this.applied = null;
      this.signature = "";
      this.hasDeviceState = false;
      this.visualTimestampMs = null;
      this.container.setDeviceState(null);
      this.hooks.onPreview();
    });
    this.startButton.onclick = () => void this.perform(() => this.start());
    this.stopButton.onclick = () => void this.perform(() => this.link.stop(), true);
    this.clearButton.onclick = () => void this.perform(async () => {
      await this.link.stop();
      await this.link.clearTiltFault();
      await this.link.getState();
    });
    this.presetSelect.onchange = () => void this.selectPreset(this.presetSelect.value);
    this.audioChoice.onchange = this.tiltChoice.onchange = () => this.refresh();
    this.fillButton.onclick = () => void this.perform(async () => {
      const fill = Number(this.fillInput.value) / 100;
      if (!Number.isFinite(fill) || fill < 0 || fill > 1) throw new Error("内容量は0〜100%です");
      await this.link.stop();
      await this.link.setParam("container.fill", fill);
      await this.link.setParam("container.headspace", 1 - fill);
      await this.link.getState();
    });
    this.link.subscribe(() => this.refresh());
    this.initializeProfiles();
    this.refresh();
  }

  async start() {
    if (this.profileApplyIncomplete) throw new Error("選択結果の適用が未完了です。再適用するか、材質を選び直してください");
    if (this.servoRetrying) throw new Error("サーボ通信を再試行中です。復帰を待つか、停止してください");
    if (!this.applied || this.link.state.stale) throw new Error("実機の適用状態を取得してから開始してください");
    await this.link.start({ audio: this.audioChoice.checked, tilt: this.tiltChoice.checked });
  }

  async stop() { await this.perform(() => this.link.stop(), true); }

  async selectPreset(name: string) {
    await this.perform(async () => {
      this.selectedPresetPending = name;
      try { await this.link.loadPreset(name); this.profileApplyIncomplete = false; this.profileMessage = ""; }
      catch (error) {
        this.selectedPresetPending = "";
        if (name === "granular_single_coin_box" && error instanceof HapticLinkError &&
          error.code === "rejected" && error.message.includes("preset_load_failed")) {
          throw new HapticLinkError(error.code, `${error.message} — コイン1枚には対応するAtomS3 FWが必要です`);
        }
        if (name === "heartbeat_soft_object" && error instanceof HapticLinkError && error.code === "rejected") {
          throw new HapticLinkError(error.code, `${error.message} — 心臓には対応するAtomS3・StampC5 FWが必要です。実機なしラボでも試せます`);
        }
        throw error;
      }
    });
  }

  private profileLabel(profile: TuningProfile): string {
    const review = profile.reviewStatus === "rehearsal-only" ? "練習のみ・触覚評価なし" :
      profile.reviewStatus === "not-evaluated" ? "未評価（比較0件）" : "実機モードの自己申告選好・検証保証なし";
    const material = demoDefinitions.find(definition => definition.id === profile.demo)!.label;
    return `${material} · ${review} · 比較${profile.comparisonCount}件`;
  }

  private initializeProfiles() {
    if (!this.hasProfileControls) return;
    this.profileSelect!.onchange = () => { this.profileMessage = ""; this.refresh(); };
    if (this.profileApply) this.profileApply.onclick = () => void this.applySelectedProfile();
    if (this.profileImport) this.profileImport.onchange = () => void this.perform(async () => {
      const file = this.profileImport?.files?.[0];
      if (!file) return;
      if (file.size > 16384) throw new Error("選択結果JSONは16 KiB以下にしてください");
      const profile = parseProfile(await file.text()), key = PROFILE_STORAGE_PREFIX + profile.sourceSession.id;
      localStorage.setItem(key, serializeProfile(profile));
      this.refreshProfileList(key);
      this.profileMessage = "選択結果を保存しました。実機にはまだ適用していません。";
      this.profileImport!.value = "";
    });
    if (this.profileExport) this.profileExport.onclick = () => void this.perform(async () => {
      const profile = this.profiles.get(this.profileSelect!.value);
      if (!profile) throw new Error("書き出す選択結果を選んでください");
      const url = URL.createObjectURL(new Blob([serializeProfile(profile)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `haptic-profile-${profile.demo}-${profile.sourceSession.id}.json`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    if (typeof window !== "undefined") {
      window.addEventListener("storage", event => {
        if (event.key === null || event.key.startsWith(PROFILE_STORAGE_PREFIX)) this.refreshProfileList();
      });
      window.addEventListener("focus", () => this.refreshProfileList());
    }
    this.refreshProfileList();
  }

  private refreshProfileList(selected = this.profileSelect?.value ?? "") {
    if (!this.hasProfileControls) return;
    this.profiles.clear(); this.profileMessage = "";
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        if (!key.startsWith(PROFILE_STORAGE_PREFIX)) continue;
        try {
          const profile = parseProfile(localStorage.getItem(key)!);
          if (key === PROFILE_STORAGE_PREFIX + profile.sourceSession.id) this.profiles.set(key, profile);
        } catch { /* Invalid evidence remains stored but is never selectable. */ }
      }
    } catch { this.profileMessage = "端末内の選択結果を読み込めません。保存権限を確認してください。"; }
    this.profileSelect!.replaceChildren(new Option("選択結果を選ぶ（自動適用しません）", ""));
    for (const [key, profile] of [...this.profiles].sort((a, b) => b[1].createdAt.localeCompare(a[1].createdAt))) {
      this.profileSelect!.add(new Option(`${this.profileLabel(profile)} · ${profile.reference || profile.objective}`, key));
    }
    this.profileSelect!.value = this.profiles.has(selected) ? selected : "";
    this.refresh();
  }

  private async applySelectedProfile() {
    await this.perform(async () => {
      const key = this.profileSelect?.value;
      if (!key || !this.profiles.has(key)) throw new Error("適用する選択結果を選んでください");
      const profile = parseProfile(localStorage.getItem(key)!);
      if (!this.applied || this.applied.preset !== profile.preset || this.link.state.connection !== "connected" ||
          this.link.state.stale || this.selectedPresetPending) throw new Error("選択結果と同じ実機の材質を先に選んでください");
      this.profileApplyIncomplete = true;
      this.profileMessage = "選択結果を停止中に適用しています…";
      this.selectedPresetPending = profile.preset;
      try {
        await this.link.applyTuning(profile.preset, profile.parameters);
        this.profileApplyIncomplete = false;
        this.profileMessage = "7値の実行ACKと傾き4値の読み戻しを確認。停止中です。開始は別ボタンです。";
      } catch (error) {
        this.profileMessage = "選択結果の適用は未完了です。再適用するか、材質を選び直してください。";
        this.selectedPresetPending = "";
        throw error;
      }
    });
  }

  private async perform(action: () => Promise<unknown>, priority = false) {
    if (this.busy && !priority) return;
    this.operations++;
    this.error = "";
    this.refresh();
    try { await action(); }
    catch (error) {
      if (!(error instanceof HapticLinkError && error.code === "cancelled")) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    }
    finally { this.operations--; this.refresh(); }
  }

  private refresh() {
    const state = this.link.state;
    const connected = state.connection === "connected";
    if (connected) this.active = true;
    if (this.active && state.telemetry) this.latest = state.telemetry;
    const snapshot = this.latest;
    const preset = resolvedPresetFromSnapshot(snapshot);
    if (connected && !state.stale && !preset) {
      this.applied = null;
      this.signature = "";
    }
    if (preset && snapshot) {
      const signature = JSON.stringify(preset);
      if (signature !== this.signature) {
        this.signature = signature;
        this.applied = preset;
        this.container.setPreset(preset, true);
        this.hooks.onPreset(preset);
        this.fillInput.value = String(Math.round(preset.container.fill * 100));
      }
      if (!this.selectedPresetPending || snapshot.preset === this.selectedPresetPending) {
        if (![...this.presetSelect.options].some(option => option.value === snapshot.preset)) {
          this.presetSelect.add(new Option(snapshot.preset, snapshot.preset));
        }
        this.presetSelect.value = snapshot.preset;
        this.selectedPresetPending = "";
      }
    }
    const available = connected && state.paired !== false && !state.stale && !this.busy && !state.pendingCommand;
    const servoRetrying = this.servoRetrying;
    this.connectButton.disabled = state.connection === "connecting" || this.busy || !!state.pendingCommand;
    this.connectButton.textContent = connected ? "状態を再取得" : "StampC5に接続";
    this.previewButton.disabled = !this.active || this.busy;
    this.startButton.disabled = !available || !this.applied || !!this.selectedPresetPending || servoRetrying || this.profileApplyIncomplete;
    this.stopButton.disabled = !connected; // Stop remains available during Start/preset work.
    this.clearButton.disabled = !available;
    this.presetSelect.disabled = !available;
    this.fillButton.disabled = !available || !this.applied;
    if (this.hasProfileControls) {
      const profile = this.profiles.get(this.profileSelect!.value), matches = !!profile && profile.preset === this.applied?.preset;
      this.profileSelect!.disabled = this.busy;
      if (this.profileApply) this.profileApply.disabled = !available || !matches || !!this.selectedPresetPending;
      if (this.profileImport) this.profileImport.disabled = this.busy;
      if (this.profileExport) this.profileExport.disabled = this.busy || !profile;
      if (this.profileDetail) this.profileDetail.textContent = (profile ? `${this.profileLabel(profile)}。` : "") + (this.profileMessage ||
        (profile ? matches ? "選択だけでは実機へ適用しません。" : "同じ実機材質を選択してから適用してください。" :
          "探索で保存した選択結果を利用できます。履歴・投票は引き継がず、適用しても自動では開始しません。"));
    }
    const fault = Number(snapshot?.tilt_servo?.fault ?? 0);
    const message = this.error || state.error;
    const faultGuidance = "「停止してサーボ復帰」で再確認し、復帰後に「実機で開始」。復帰だけでは出力を再開しません。";
    const retryStatus = `サーボ通信を再試行中 · 振動 ${snapshot?.audio?.runtime_enabled === true ? "ON" : snapshot?.audio?.runtime_enabled === false ? "OFF" : "未確認"} · 傾きフィードバック未確認（通信復帰待ち）`;
    this.status.dataset.level = message || fault || (this.active && state.stale) ? "warning" : connected ? "live" : "preview";
    this.status.textContent = message ? `確認が必要: ${message}${servoRetrying ? ` — ${retryStatus}` : connected && !state.stale && fault ? ` — サーボ fault ${fault}。${faultGuidance}` : ""}` : !this.active ? "プレビュー — 実機出力なし" :
      !connected ? "接続が切れました — 最後の表示で停止 / 実機出力は未確認" :
      state.paired === false ? "USB接続済み — AtomS3とのペアリング待ち" : state.stale ? "実機データ待ち — 表示を保持" :
      servoRetrying ? retryStatus :
      this.selectedPresetPending ? "材質を適用中…" : !this.applied ? "接続済み — 寸法・材質を含むFWが必要です" :
      fault ? `サーボ fault ${fault} — ${faultGuidance}` :
      `${snapshot?.run_mode === "live" ? "LIVE" : "IDLE"} · 振動 ${snapshot?.audio?.runtime_enabled ? "ON" : "OFF"} · 傾き ${snapshot?.safety?.tilt_disarmed === false ? "ON" : "OFF"}`;
    this.detail.textContent = this.applied ?
      `${this.applied.family} · ${[this.applied.container.span_x_m, this.applied.container.span_y_m, this.applied.container.span_z_m].map(v => (v * 1000).toFixed(0)).join(" × ")} mm · ${Math.round(this.applied.container.fill * 100)}% · ${state.transport ?? "切断"}` :
      "StampC5に接続 → 材質を選択 → 容器を持って開始。再接続では出力を開始しません。";
    document.body.classList.toggle("device-connected", this.active);
    element<HTMLElement>("mode-badge").textContent = this.active ? "実機" : "Preview";
    this.hooks.onPanel?.(this.active ? {
      presetNames: devicePresets.map(([name]) => name),
      appliedPreset: this.applied?.preset ?? "未確認",
      status: this.status.textContent ?? "",
      detail: this.detail.textContent ?? "",
      available, canStart: !this.startButton.disabled, canStop: !this.stopButton.disabled,
      audioDesired: this.audioChoice.checked, tiltDesired: this.tiltChoice.checked
    } : null, {
      onPresetSelected: name => void this.selectPreset(name),
      onStart: () => void this.perform(() => this.start()),
      onStop: () => void this.stop(),
      onOutputsChanged: outputs => {
        this.audioChoice.checked = outputs.audio;
        this.tiltChoice.checked = outputs.tilt;
        this.refresh();
      }
    });
    for (const id of ["preset-select", "stimulus-select", "shake-boost-slider", "damping-preview-slider", "reset-button", "touch-mode-button", "tilt-mode-button"]) {
      element<HTMLInputElement>(id).disabled = this.active;
    }
  }

  /** Hold the last device scene when stale; do not silently fall back to simulation. */
  update(dt: number): { tilt: TiltState; content: LocalContentState } | null {
    if (!this.active) return null;
    const snapshot = this.latest;
    if (snapshot && this.applied && !this.link.state.stale && snapshot !== this.processedSnapshot) {
      this.processedSnapshot = snapshot;
      const content = contentFromSnapshot(snapshot, this.applied.container.fill);
      if (content) {
        this.container.setDeviceState(content);
        this.hasDeviceState = true;
      }
      const pose = orientationFromSnapshot(snapshot, this.gravity);
      if (pose) {
        this.gravity = pose.gravity;
        this.tilt = { x: pose.orientation.pitchRad, y: pose.orientation.rollRad };
        this.container.setDeviceOrientation(pose.orientation);
        this.container.setDeviceAcceleration?.(pose.acceleration,
          visualSampleInterval(this.visualTimestampMs, snapshot.timestamp_ms));
        this.visualTimestampMs = snapshot.timestamp_ms;
      }
    }
    // Configuration can arrive before the first mass sample. Claim the device
    // source even then, so the renderer cannot advance its local preview.
    if (!this.applied || !this.hasDeviceState) {
      this.container.setDeviceState({ massX: 0, massY: 0, velocityX: 0, velocityY: 0, energy: 0, fill: 0 });
      this.hasDeviceState = true;
    }
    void dt;
    return { tilt: this.tilt, content: quietContent };
  }
}
