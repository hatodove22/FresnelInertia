import * as THREE from "three";
import { ContainerScene } from "./renderer/ContainerScene";
import { frameDesktopContainer } from "./renderer/desktopView";
import { EnvironmentScene } from "./renderer/EnvironmentScene";
import { SpatialControlPanel } from "./renderer/SpatialControlPanel";
import { PhoneInput } from "./input/PhoneInput";
import { DemoKeyboard } from "./input/DemoKeyboard";
import { MaterialSound } from "./audio/MaterialSound";
import { fromDeviceSound, fromLabSound, fromPreviewSound } from "./audio/SoundState";
import { presets, findPreset, previewPresetLabel } from "./presets";
import { VisualSimulator } from "./simulator";
import { ExperimentRecorder } from "./experimentRecorder";
import { scriptedTilt, stimulusScripts, type StimulusScriptName } from "./stimulusScripts";
import type { DemoUiElements, SpatialPanelState, TiltState } from "./types";
import { WebXrBridge } from "./xr/WebXrBridge";
import { DeviceDemo } from "./deviceDemo";
import { OfflineLab } from "./offlineLab";
import { makeMaterialBackdrop, makeMaterialEnvironment } from "./renderer/MaterialStudio";
import "./style.css";
import { initPwa } from "./pwa/register";

initPwa(document.querySelector<HTMLElement>(".hud-scroll")!);

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
if (!canvas) {
  throw new Error("Scene canvas not found");
}

const ui: DemoUiElements = {
  presetSelect: document.querySelector<HTMLSelectElement>("#preset-select")!,
  shakeBoostSlider: document.querySelector<HTMLInputElement>("#shake-boost-slider")!,
  shakeBoostValue: document.querySelector<HTMLOutputElement>("#shake-boost-value")!,
  dampingPreviewSlider: document.querySelector<HTMLInputElement>("#damping-preview-slider")!,
  dampingPreviewValue: document.querySelector<HTMLOutputElement>("#damping-preview-value")!,
  stimulusSelect: document.querySelector<HTMLSelectElement>("#stimulus-select")!,
  conditionInput: document.querySelector<HTMLInputElement>("#condition-input")!,
  repeatInput: document.querySelector<HTMLInputElement>("#repeat-input")!,
  trialStartStopButton: document.querySelector<HTMLButtonElement>("#trial-start-stop-button")!,
  trialMarkButton: document.querySelector<HTMLButtonElement>("#trial-mark-button")!,
  trialNextButton: document.querySelector<HTMLButtonElement>("#trial-next-button")!,
  trialElapsed: document.querySelector<HTMLElement>("#trial-elapsed")!,
  exportFormatSelect: document.querySelector<HTMLSelectElement>("#export-format-select")!,
  exportButton: document.querySelector<HTMLButtonElement>("#export-button")!,
  xrButton: document.querySelector<HTMLButtonElement>("#xr-button")!,
  questButton: document.querySelector<HTMLButtonElement>("#quest-button")!,
  touchModeButton: document.querySelector<HTMLButtonElement>("#touch-mode-button")!,
  tiltModeButton: document.querySelector<HTMLButtonElement>("#tilt-mode-button")!,
  inputStatus: document.querySelector<HTMLElement>("#input-status")!,
  resetButton: document.querySelector<HTMLButtonElement>("#reset-button")!,
  modeBadge: document.querySelector<HTMLElement>("#mode-badge")!,
  familyReadout: document.querySelector<HTMLElement>("#family-readout")!,
  fillReadout: document.querySelector<HTMLElement>("#fill-readout")!,
  tiltReadout: document.querySelector<HTMLElement>("#tilt-readout")!
};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;

const scene = new THREE.Scene();
const materialEnvironment = makeMaterialEnvironment(renderer);
scene.environment = materialEnvironment.texture;
scene.environmentIntensity = 0.7;
const materialBackdrop = makeMaterialBackdrop();
scene.add(materialBackdrop);
const worldRoot = new THREE.Group();
worldRoot.name = "demo-world-root";
scene.add(worldRoot);
const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.01, 20);
camera.position.set(0, 1.18, 0.78);

const lightRig = new THREE.Group();
lightRig.add(new THREE.HemisphereLight("#edf8ff", "#243b41", 1.4));
const key = new THREE.DirectionalLight("#fff7ea", 2.4);
key.position.set(1.2, 2.25, 0.8);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 0.2;
key.shadow.camera.far = 5;
key.target.position.set(0, 0.86, -0.72);
lightRig.add(key.target);
key.shadow.camera.left = -0.35;
key.shadow.camera.right = 0.35;
key.shadow.camera.top = 0.35;
key.shadow.camera.bottom = -0.35;
key.shadow.normalBias = 0.00015;
lightRig.add(key);
const rim = new THREE.DirectionalLight("#7fcbd5", 1.1);
rim.position.set(-1.4, 1.4, -1.6);
lightRig.add(rim);
scene.add(lightRig);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(1.55, 128),
  new THREE.ShadowMaterial({ opacity: 0.28 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0.8241;
floor.position.z = -0.72;
floor.receiveShadow = true;
worldRoot.add(floor);

const environment = new EnvironmentScene();
worldRoot.add(environment.group);

const container = new ContainerScene();
worldRoot.add(container.group);

const simulator = new VisualSimulator();
const materialSound = new MaterialSound();
const soundToggle = document.querySelector<HTMLButtonElement>("#sound-toggle")!;
const soundVolume = document.querySelector<HTMLInputElement>("#sound-volume")!;
const soundValue = document.querySelector<HTMLOutputElement>("#sound-volume-value")!;
const soundStatus = document.querySelector<HTMLElement>("#sound-status")!;
function refreshSoundControls() {
  soundToggle.setAttribute("aria-pressed", String(!!materialSound.running));
  soundToggle.textContent = materialSound.running ? "効果音 ON" : "効果音をON";
  soundStatus.textContent = materialSound.error || (materialSound.enabled && !materialSound.running
    ? "音声が中断されています。ONで再開できます。" : "スピーカー出力 · 4ch振動とは別の設定");
  if (materialSound.error || (materialSound.enabled && !materialSound.running)) {
    soundStatus.closest("details")?.setAttribute("open", "");
  }
}
materialSound.onChange = refreshSoundControls;
soundToggle.onclick = async () => {
  if (materialSound.running) { materialSound.mute(); return; }
  soundToggle.disabled = true;
  soundStatus.textContent = "音声を準備しています…";
  try { await materialSound.enable(); }
  finally { soundToggle.disabled = false; refreshSoundControls(); }
};
soundVolume.oninput = () => {
  materialSound.setVolume(Number(soundVolume.value) / 100);
  soundValue.value = `${Math.round(materialSound.volume * 100)}%`;
};
document.addEventListener("visibilitychange", () => { if (document.hidden) materialSound.silence(); });
window.addEventListener("pagehide", () => materialSound.silence());
const phoneInput = new PhoneInput(canvas);
const recorder = new ExperimentRecorder();
let panelState: SpatialPanelState = { shakeBoost: 0.35, dampingPreview: 0.5 };
let activeInputMethod: "touch" | "tilt" | "hand" = "touch";
let activeStimulus: StimulusScriptName = "manual";
let stimulusStartedAt = performance.now();
let currentTilt: TiltState = { x: 0, y: 0 };
const spatialPanel = new SpatialControlPanel({
  presetNames: presets.map((preset) => preset.preset),
  selectedPreset: "liquid_small_box",
  stimulusOptions: stimulusScripts,
  selectedStimulus: activeStimulus,
  onPresetSelected: (name) => {
    ui.presetSelect.value = name;
    applyPreset(name);
  },
  onStimulusSelected: (name) => {
    setActiveStimulus(parseStimulus(name));
  },
  onStateChanged: (state) => {
    setPanelState(state);
  },
  onTrialStartStop: () => {
    toggleTrialRunning();
  },
  onTrialMark: () => {
    markTrial();
  },
  onTrialNext: () => {
    advanceTrialRepeat();
  },
  onReset: () => {
    resetContainerToRest();
  }
});
worldRoot.add(spatialPanel.group);
const xrBridge = new WebXrBridge(renderer, scene, worldRoot, container.group, ui.modeBadge, spatialPanel, container.gripProxy, camera);
xrBridge.setPreferredHand("right");
const desktopViewTarget = new THREE.Vector3();
const desktopViewSize = new THREE.Vector3();
let activePreset = findPreset("liquid_small_box");
let lastTime = performance.now();
const deviceDemo = new DeviceDemo(container, {
  onPreset: (preset) => {
    activePreset = preset;
    spatialPanel.setSelectedPreset(preset.preset);
    updateReadout(currentTilt);
  },
  onPreview: () => applyPreviewPreset("liquid_small_box"),
  onPanel: (state, callbacks) => spatialPanel.setDeviceMode(state, callbacks)
});
const offlineLab = new OfflineLab(container, {
  canEnter: () => !deviceDemo.active && !renderer.xr.isPresenting,
  onSilence: () => materialSound.silence(),
  onPreset: preset => { activePreset = preset; },
  onClose: () => { container.group.position.x = 0; applyPreviewPreset("liquid_small_box"); }
});
// Stop/disconnect/invalid source cuts sound at state notification, even when a
// costly WebGL frame is delayed. This observer never issues device commands.
deviceDemo.link.subscribe(state => {
  if (deviceDemo.active && !fromDeviceSound(state)) materialSound.silence();
});

for (const preset of presets) {
  const option = document.createElement("option");
  option.value = preset.preset;
  option.textContent = previewPresetLabel(preset.preset);
  ui.presetSelect.appendChild(option);
}

for (const script of stimulusScripts) {
  const option = document.createElement("option");
  option.value = script.value;
  option.textContent = script.label;
  ui.stimulusSelect.appendChild(option);
}

ui.presetSelect.value = activePreset.preset;
ui.presetSelect.addEventListener("change", () => {
  applyPreset(ui.presetSelect.value);
});

ui.stimulusSelect.value = activeStimulus;
ui.stimulusSelect.addEventListener("change", () => {
  setActiveStimulus(parseStimulus(ui.stimulusSelect.value));
});

ui.shakeBoostSlider.addEventListener("input", () => {
  setPanelState({ ...panelState, shakeBoost: Number(ui.shakeBoostSlider.value) });
});

ui.dampingPreviewSlider.addEventListener("input", () => {
  setPanelState({ ...panelState, dampingPreview: Number(ui.dampingPreviewSlider.value) });
});

ui.touchModeButton.addEventListener("click", () => {
  phoneInput.setTouchMode();
  setActiveMethod("touch");
  ui.inputStatus.textContent = "容器をドラッグして傾けられます。";
  ui.modeBadge.textContent = "Preview";
});

ui.tiltModeButton.addEventListener("click", async () => {
  await enableTiltMode();
});

ui.resetButton.addEventListener("click", () => {
  resetContainerToRest();
});

ui.trialStartStopButton.addEventListener("click", () => {
  toggleTrialRunning();
});

ui.trialMarkButton.addEventListener("click", () => {
  markTrial();
});

ui.trialNextButton.addEventListener("click", () => {
  advanceTrialRepeat();
});

ui.exportButton.addEventListener("click", () => {
  exportTrialRecords(ui.exportFormatSelect.value === "csv" ? "csv" : "json");
});

ui.questButton.addEventListener("click", () => {
  const url = new URL("https://www.oculus.com/open_url/");
  url.searchParams.set("url", window.location.href);
  window.location.href = url.toString();
});

xrBridge.installButton(ui.xrButton);
container.setPreset(activePreset);
setPanelState(panelState);
updateReadout(phoneInput.tilt);
new DemoKeyboard(document, () => deviceDemo.active ? "device" :
  renderer.xr.isPresenting ? "xr" : offlineLab.active ? "lab" : "preview");
const launch = new URLSearchParams(window.location.search);
if (launch.get("lab") === "1") void offlineLab.open(launch.get("preset") ?? undefined);

const presentationStatus = document.querySelector<HTMLElement>("#presentation-status")!;
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop((time) => {
  const dt = Math.min(0.05, Math.max(0.001, (time - lastTime) / 1000));
  lastTime = time;
  xrBridge.update();
  container.setDesktopPresentation(!renderer.xr.isPresenting);

  const labFrame = offlineLab.update(dt);
  const deviceFrame = labFrame ?? deviceDemo.update(dt);
  const liveTilt = renderer.xr.isPresenting ? xrBridge.tilt : phoneInput.tilt;
  const tilt = deviceFrame?.tilt ??
    (activeStimulus === "manual" ? liveTilt : scriptedTilt(activeStimulus, (performance.now() - stimulusStartedAt) / 1000));
  currentTilt = { ...tilt };
  const content = deviceFrame?.content ?? simulator.update(activePreset, tilt, dt, panelState);
  container.update(tilt, content, time * 0.001, dt);
  const presentationMessage = container.presentationStatus;
  if (presentationStatus.textContent !== presentationMessage) {
    presentationStatus.textContent = presentationMessage;
    presentationStatus.hidden = !presentationMessage;
  }
  const soundFrame = document.hidden ? null : offlineLab.active
    ? offlineLab.soundFrame ? fromLabSound(offlineLab.soundFrame) : null
    : deviceDemo.active ? fromDeviceSound(deviceDemo.link.state)
    : fromPreviewSound(activePreset, content, time * 0.001);
  materialSound.update(soundFrame);
  // A close view uses the camera, never an invented scale on the physical box.
  // XR continues to use its own tracked camera and hand-positioned container.
  if (!renderer.xr.isPresenting) {
    const target = worldRoot.localToWorld(container.getDesktopTarget(desktopViewTarget));
    const extent = Math.max(activePreset.container.span_x_m, activePreset.container.span_y_m, activePreset.container.span_z_m);
    // Reserve the soda jet's known visual envelope even while sealed, so the
    // burst does not force an artificial camera zoom or clip on a phone.
    const burstHeadroom = activePreset.preset === "liquid_soda_bottle"
      ? Math.min(activePreset.container.span_x_m, activePreset.container.span_y_m, activePreset.container.span_z_m) * 1.1 : 0;
    target.y += burstHeadroom * 0.44;
    const mobile = window.innerWidth <= 520;
    const baseDistance = offlineLab.active ? Math.max(0.15, extent * 2.2) : Math.max(0.18, extent * 2.8);
    // Fit the rotated body in the free canvas, not underneath the controls.
    const freeWidth = mobile ? window.innerWidth - 32 : Math.max(160, window.innerWidth - 470);
    const fitDistance = extent * 1.6 * window.innerHeight / (freeWidth * 2 * Math.tan(26 * Math.PI / 180));
    const verticalDistance = (extent * 1.2 + burstHeadroom) * 1.05 / ((mobile ? 0.45 : 0.84) * 2 * Math.tan(26 * Math.PI / 180));
    const distance = offlineLab.active ? Math.max(baseDistance, fitDistance, verticalDistance) : baseDistance;
    const displaySize = container.getSize(desktopViewSize).multiplyScalar(1.2);
    displaySize.y += burstHeadroom;
    frameDesktopContainer(camera, target, displaySize,
      { width: window.innerWidth, height: window.innerHeight }, distance);
  }
  spatialPanel.group.visible = renderer.xr.isPresenting;
  environment.group.visible = !offlineLab.active;
  floor.visible = !offlineLab.active;
  materialBackdrop.visible = offlineLab.active && !renderer.xr.isPresenting;
  if (materialBackdrop.visible) {
    // Keep the background behind the whole container, while making its optical
    // pattern large enough to read through water at every resolved box size.
    materialBackdrop.position.copy(container.group.position);
    materialBackdrop.position.z -= Math.max(0.14, activePreset.container.span_z_m * 2);
    const extent = Math.max(activePreset.container.span_x_m, activePreset.container.span_y_m, activePreset.container.span_z_m);
    materialBackdrop.scale.setScalar(Math.max(0.8, extent * 12));
  }
  spatialPanel.update();
  recorder.sample(makeTrialSnapshot());
  updateTrialElapsed();
  updateReadout(tilt);
  renderer.render(scene, camera);
});

function resetContainerToRest() {
  if (deviceDemo.active) return;
  materialSound.silence();
  setActiveStimulus("manual");
  phoneInput.resetTilt();
  xrBridge.resetTilt();
  container.group.position.set(0, container.restY(), -0.72);
  container.group.rotation.set(0, 0, 0);
  container.group.quaternion.identity();
  currentTilt = { x: 0, y: 0 };
  updateReadout({ x: 0, y: 0 });
}

function updateReadout(tilt: TiltState) {
  ui.familyReadout.textContent = activePreset.family;
  ui.fillReadout.textContent = `${Math.round(activePreset.container.fill * 100)}%`;
  ui.tiltReadout.textContent = `${tilt.x.toFixed(2)} / ${tilt.y.toFixed(2)}`;
}

async function enableTiltMode() {
  try {
    const ok = await phoneInput.enableOrientation();
    ui.inputStatus.textContent = ok ? "端末の傾きで操作中です。" : "端末の傾きを利用できません。ドラッグで操作できます。";
    if (ok) {
      setActiveMethod("tilt");
    ui.modeBadge.textContent = "Preview";
    }
  } catch (error) {
    ui.inputStatus.textContent = `端末の傾きを利用できません: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function setActiveMethod(method: "touch" | "tilt" | "hand") {
  activeInputMethod = method;
  ui.touchModeButton.classList.toggle("active", method === "touch");
  ui.tiltModeButton.classList.toggle("active", method === "tilt");
  ui.touchModeButton.setAttribute("aria-pressed", String(method === "touch"));
  ui.tiltModeButton.setAttribute("aria-pressed", String(method === "tilt"));
}

function setActiveStimulus(stimulus: StimulusScriptName) {
  activeStimulus = stimulus;
  stimulusStartedAt = performance.now();
  ui.stimulusSelect.value = activeStimulus;
  spatialPanel.setStimulus(activeStimulus);
}

function applyPreset(name: string) {
  if (deviceDemo.active) {
    void deviceDemo.selectPreset(name);
    return;
  }
  applyPreviewPreset(name);
}

function applyPreviewPreset(name: string) {
  activePreset = findPreset(name);
  ui.presetSelect.value = activePreset.preset;
  spatialPanel.setSelectedPreset(activePreset.preset);
  container.setPreset(activePreset);
  updateReadout({ x: 0, y: 0 });
}

function setPanelState(state: SpatialPanelState) {
  panelState = {
    shakeBoost: THREE.MathUtils.clamp(state.shakeBoost, 0, 1),
    dampingPreview: THREE.MathUtils.clamp(state.dampingPreview, 0, 1)
  };
  spatialPanel.setState(panelState);
  ui.shakeBoostSlider.value = panelState.shakeBoost.toFixed(2);
  ui.shakeBoostValue.textContent = panelState.shakeBoost.toFixed(2);
  ui.dampingPreviewSlider.value = panelState.dampingPreview.toFixed(2);
  ui.dampingPreviewValue.textContent = panelState.dampingPreview.toFixed(2);
}

function parseStimulus(value: string): StimulusScriptName {
  return stimulusScripts.some((script) => script.value === value) ? (value as StimulusScriptName) : "manual";
}

function makeTrialSnapshot() {
  return {
    condition: ui.conditionInput.value.trim(),
    repeat: readRepeatNumber(),
    preset: activePreset.preset,
    inputMode: activeStimulus === "manual" ? currentInputMode() : `script:${activeStimulus}`,
    panelState,
    tilt: currentTilt
  };
}

function currentInputMode() {
  return renderer.xr.isPresenting ? "hand" : activeInputMethod;
}

function readRepeatNumber() {
  const repeat = Number.parseInt(ui.repeatInput.value, 10);
  return Number.isFinite(repeat) ? Math.max(1, repeat) : 1;
}

function updateTrialElapsed() {
  const elapsedMs = recorder.elapsedMs();
  const totalSeconds = elapsedMs / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const elapsedLabel = `${minutes.toString().padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
  ui.trialElapsed.textContent = elapsedLabel;
  ui.trialElapsed.setAttribute("datetime", `PT${Math.round(totalSeconds)}S`);
  spatialPanel.setTrialState({
    running: recorder.isRunning(),
    elapsedLabel,
    repeat: readRepeatNumber()
  });
}

function toggleTrialRunning() {
  if (recorder.isRunning()) {
    recorder.stop(makeTrialSnapshot());
    ui.trialStartStopButton.textContent = "Start";
    return;
  }
  recorder.start(makeTrialSnapshot());
  ui.trialStartStopButton.textContent = "Stop";
}

function markTrial() {
  recorder.mark(makeTrialSnapshot());
}

function advanceTrialRepeat() {
  recorder.next(makeTrialSnapshot());
  ui.repeatInput.value = String(Math.max(1, readRepeatNumber() + 1));
}

function exportTrialRecords(format: "json" | "csv") {
  const text = format === "csv" ? recorder.toCsv() : recorder.toJson();
  const blob = new Blob([text], { type: format === "csv" ? "text/csv" : "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `webxr-trials-${new Date().toISOString().replaceAll(":", "-")}.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}
