import * as THREE from "three";
import { ContainerScene } from "./renderer/ContainerScene";
import { EnvironmentScene } from "./renderer/EnvironmentScene";
import { SpatialControlPanel } from "./renderer/SpatialControlPanel";
import { PhoneInput } from "./input/PhoneInput";
import { presets, findPreset } from "./presets";
import { VisualSimulator } from "./simulator";
import type { DemoUiElements, TiltState } from "./types";
import type { SpatialPanelState } from "./types";
import { WebXrBridge } from "./xr/WebXrBridge";
import { iwsdkIntegrationNotes } from "./iwsdkNotes";
import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
if (!canvas) {
  throw new Error("Scene canvas not found");
}

const ui: DemoUiElements = {
  presetSelect: document.querySelector<HTMLSelectElement>("#preset-select")!,
  orientationButton: document.querySelector<HTMLButtonElement>("#orientation-button")!,
  xrButton: document.querySelector<HTMLButtonElement>("#xr-button")!,
  questButton: document.querySelector<HTMLButtonElement>("#quest-button")!,
  touchModeButton: document.querySelector<HTMLButtonElement>("#touch-mode-button")!,
  tiltModeButton: document.querySelector<HTMLButtonElement>("#tilt-mode-button")!,
  handModeButton: document.querySelector<HTMLButtonElement>("#hand-mode-button")!,
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
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;

const scene = new THREE.Scene();
const worldRoot = new THREE.Group();
worldRoot.name = "demo-world-root";
scene.add(worldRoot);
const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.01, 20);
camera.position.set(0, 1.18, 0.78);

const lightRig = new THREE.Group();
lightRig.add(new THREE.HemisphereLight("#edf8ff", "#263127", 1.72));
const key = new THREE.DirectionalLight("#fff7ea", 3.3);
key.position.set(1.2, 2.25, 0.8);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 0.2;
key.shadow.camera.far = 5;
key.shadow.camera.left = -1.6;
key.shadow.camera.right = 1.6;
key.shadow.camera.top = 1.4;
key.shadow.camera.bottom = -1.4;
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
floor.position.y = 0.826;
floor.position.z = -0.72;
floor.receiveShadow = true;
worldRoot.add(floor);

const environment = new EnvironmentScene();
worldRoot.add(environment.group);

const container = new ContainerScene();
worldRoot.add(container.group);

const simulator = new VisualSimulator();
const phoneInput = new PhoneInput(canvas);
let panelState: SpatialPanelState = { shakeBoost: 0.35, dampingPreview: 0.5 };
const spatialPanel = new SpatialControlPanel({
  presetNames: presets.map((preset) => preset.preset),
  selectedPreset: "liquid_small_box",
  onPresetSelected: (name) => {
    ui.presetSelect.value = name;
    applyPreset(name);
  },
  onStateChanged: (state) => {
    panelState = state;
  }
});
worldRoot.add(spatialPanel.group);
const xrBridge = new WebXrBridge(renderer, scene, worldRoot, container.group, ui.modeBadge, spatialPanel);
let activePreset = findPreset("liquid_small_box");
let lastTime = performance.now();

console.info("IWSDK integration", iwsdkIntegrationNotes);

for (const preset of presets) {
  const option = document.createElement("option");
  option.value = preset.preset;
  option.textContent = preset.preset.replaceAll("_", " ");
  ui.presetSelect.appendChild(option);
}

ui.presetSelect.value = activePreset.preset;
ui.presetSelect.addEventListener("change", () => {
  applyPreset(ui.presetSelect.value);
});

ui.orientationButton.addEventListener("click", async () => {
  await enableTiltMode();
});

ui.touchModeButton.addEventListener("click", () => {
  phoneInput.setTouchMode();
  setActiveMethod("touch");
  ui.modeBadge.textContent = "Phone";
});

ui.tiltModeButton.addEventListener("click", async () => {
  await enableTiltMode();
});

ui.handModeButton.addEventListener("click", () => {
  ui.xrButton.click();
});

ui.resetButton.addEventListener("click", () => {
  phoneInput.resetTilt();
  xrBridge.resetTilt();
  container.group.position.set(0, container.restY(), -0.72);
  container.group.rotation.set(0, 0, 0);
  container.group.quaternion.identity();
  updateReadout({ x: 0, y: 0 });
});

ui.questButton.addEventListener("click", () => {
  const url = new URL("https://www.oculus.com/open_url/");
  url.searchParams.set("url", window.location.href);
  window.location.href = url.toString();
});

xrBridge.installButton(ui.xrButton);
container.setPreset(activePreset);
updateReadout(phoneInput.tilt);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop((time) => {
  const dt = Math.min(0.05, Math.max(0.001, (time - lastTime) / 1000));
  lastTime = time;
  xrBridge.update();

  const tilt = renderer.xr.isPresenting ? xrBridge.tilt : phoneInput.tilt;
  const content = simulator.update(activePreset, tilt, dt, panelState);
  container.update(tilt, content, time * 0.001, dt);
  spatialPanel.update();
  updateReadout(tilt);
  renderer.render(scene, camera);
});

function updateReadout(tilt: TiltState) {
  ui.familyReadout.textContent = activePreset.family;
  ui.fillReadout.textContent = `${Math.round(activePreset.container.fill * 100)}%`;
  ui.tiltReadout.textContent = `${tilt.x.toFixed(2)} / ${tilt.y.toFixed(2)}`;
}

async function enableTiltMode() {
  const ok = await phoneInput.enableOrientation();
  ui.orientationButton.textContent = ok ? "Tilt On" : "Tilt Blocked";
  ui.orientationButton.disabled = ok;
  if (ok) {
    setActiveMethod("tilt");
    ui.modeBadge.textContent = "Tilt";
  }
}

function setActiveMethod(method: "touch" | "tilt" | "hand") {
  ui.touchModeButton.classList.toggle("active", method === "touch");
  ui.tiltModeButton.classList.toggle("active", method === "tilt");
  ui.handModeButton.classList.toggle("active", method === "hand");
}

function applyPreset(name: string) {
  activePreset = findPreset(name);
  ui.presetSelect.value = activePreset.preset;
  spatialPanel.setSelectedPreset(activePreset.preset);
  container.setPreset(activePreset);
  updateReadout({ x: 0, y: 0 });
}
