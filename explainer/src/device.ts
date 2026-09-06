import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DeviceRig, type DeviceKinematics, type Vec3 } from './deviceRig';
import { mechanismPose, normalizePose, contactAngle, type DevicePose, type MechanismMode } from './mechanismMotion';
export type {DevicePose, MechanismMode} from './mechanismMotion';

export interface CameraFrame {position: Vec3; target?: Vec3; up?: Vec3; fov?: number}
export interface MechanismFrame extends DevicePose {cutaway?: boolean; camera?: CameraFrame}
export interface ViewerOptions {
  variant?: 'hero' | 'detail' | 'film'; reducedMotion?: boolean; manual?: boolean;
  pixelRatio?: number; onUpdate?: (pose: DevicePose) => void;
}
export interface DeviceViewer {
  setPlaying(value: boolean): void; setMode(mode: MechanismMode): void; setAngle(value: number): void;
  setCutaway(value: boolean): void; resetCamera(): void; dispose(): void;
  renderFrame(frame: MechanismFrame): void;
  getCameraPreset(name: 'overview' | 'contact' | 'gears' | 'spatial'): CameraFrame;
}
// Both web views share a clock even when CAD loads finish at different times.
const clock = {time: 0, stamp: -1, playing: true};
function tick(stamp: number) {
  if (clock.stamp >= 0 && clock.playing) clock.time += Math.min(.05, Math.max(0, (stamp - clock.stamp) / 1000));
  clock.stamp = stamp; return clock.time;
}
/** Shared actual-CAD renderer for web interaction and deterministic film capture. */
export async function createDeviceViewer(canvas: HTMLCanvasElement, settings: ViewerOptions | boolean = {}): Promise<DeviceViewer> {
  const options: ViewerOptions = typeof settings === 'boolean' ? {reducedMotion: settings} : settings;
  const manual = options.manual ?? false;
  const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power'});
  renderer.setPixelRatio(options.pixelRatio ?? Math.min(devicePixelRatio, 1.7));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .88;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(34, 1, .001, 10);
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04); scene.environment = environment.texture; scene.environmentIntensity = .55;
  room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xdbeaff, 0x343340, .85));
  const key = new THREE.DirectionalLight(0xffeee0, 1.7); key.position.set(-1, 2, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0x8be4df, 1); rim.position.set(2, 1, -2); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffffff, .4); fill.position.set(-2, -.5, .5); scene.add(fill);
  let rig: DeviceRig;
  try {
    const [gltf, response] = await Promise.all([new GLTFLoader().loadAsync('/models/device-cad.glb'), fetch('/models/device-kinematics.json')]);
    if (!response.ok) throw new Error('CAD kinematic evidence could not be loaded.');
    rig = new DeviceRig(gltf, await response.json() as DeviceKinematics); scene.add(rig.root);
  } catch (error) {environment.dispose(); renderer.dispose(); throw error;}
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false; controls.enablePan = false; controls.enableZoom = false;
  controls.enabled = !manual; controls.autoRotate = false; controls.target.set(0, 0, 0);
  const presets: Record<'overview'|'contact'|'gears'|'spatial', CameraFrame> = {
    overview: {position: [.095, .07, .175], target: [0, 0, 0], up: [0, 1, 0], fov: 34},
    contact: {position: [.012, .042, .205], target: [0, -.002, .008], up: [0, 1, 0], fov: 34},
    gears: {position: [.008, .012, .15], target: [0, -.002, .023], up: [0, 1, 0], fov: 34},
    spatial: {position: [.195, .035, .065], target: [0, 0, 0], up: [0, 1, 0], fov: 34},
  };
  let disposed = false, visible = true, mode: MechanismMode = 'common';
  let playing = !options.reducedMotion, manualAngle: number | undefined;
  let pose = mechanismPose(mode, clock.time, options.reducedMotion ? 0 : undefined);
  let cutaway = false, request = 0, dirty = true;
  const defaultPreset = options.variant === 'detail' ? 'contact' : 'overview';
  let activePreset: keyof typeof presets = defaultPreset;
  const applyCamera = (frame: CameraFrame) => {
    camera.position.set(...frame.position); controls.target.set(...(frame.target ?? [0, 0, 0]));
    camera.up.set(...(frame.up ?? [0, 1, 0])); camera.fov = frame.fov ?? 34;
    camera.updateProjectionMatrix(); camera.lookAt(controls.target); controls.update();
  };
  const render = (notify = true) => {
    if (disposed) return;
    rig.setPose(pose); rig.setCutaway(cutaway); renderer.render(scene, camera);
    canvas.dataset.ready = 'true'; canvas.dataset.pose = JSON.stringify(pose);
    dirty = false; if (notify) options.onUpdate?.(pose);
  };
  const resetCamera = () => {
    const preset = presets[activePreset]; applyCamera(preset);
    if (!manual) {
      const target = controls.target, offset = camera.position.clone().sub(target), originalDistance = offset.length();
      const minFov = Math.min(THREE.MathUtils.degToRad(camera.fov), 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
      const distance = .058 / Math.sin(minFov / 2) * 1.035;
      camera.position.copy(target).add(offset.normalize().multiplyScalar(Math.max(distance, originalDistance)));
      camera.lookAt(target); controls.update();
    }
    dirty = true; render();
  };
  const resize = () => {
    const bounds = canvas.getBoundingClientRect(); if (!bounds.width || !bounds.height || disposed) return;
    renderer.setSize(bounds.width, bounds.height, false); camera.aspect = bounds.width / bounds.height;
    camera.updateProjectionMatrix(); resetCamera();
  };
  const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
  const intersection = new IntersectionObserver(([entry]) => {visible = entry.isIntersecting; dirty = true;}, {rootMargin: '150px'});
  if (!manual) intersection.observe(canvas);
  const changed = () => {dirty = true; render(false);};
  controls.addEventListener('change', changed);
  const keydown = (event: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return; event.preventDefault();
    if (event.key === 'Home') resetCamera();
    else {camera.position.sub(controls.target).applyAxisAngle(camera.up, event.key === 'ArrowLeft' ? .15 : -.15).add(controls.target); camera.lookAt(controls.target); controls.update(); render();}
  };
  canvas.tabIndex = 0; canvas.setAttribute('aria-label', '実CADの接触面と伝達機構。ドラッグまたは左右キーで視点を回転、Homeで視点を戻します。');
  canvas.addEventListener('keydown', keydown);
  const loop = (stamp: number) => {
    if (disposed) return; request = requestAnimationFrame(loop);
    if (!visible || document.hidden) return;
    const time = tick(stamp);
    if (playing) {pose = mechanismPose(mode, time, manualAngle); dirty = true;}
    if (dirty) render();
  };
  if (!manual) {clock.playing = playing; request = requestAnimationFrame(loop);}
  render();
  return {
    setPlaying(value) {
      // A hidden viewport must freeze at the same shared instant as the visible one.
      if (!value && playing) {pose = mechanismPose(mode, clock.time, manualAngle); render();}
      playing = value; clock.playing = value; clock.stamp = -1;
      if (value) manualAngle = undefined; dirty = true;
    },
    setMode(value) {
      const previous = mode; mode = value; pose = mechanismPose(mode, clock.time, manualAngle);
      if (!manual && previous !== value && (value === 'impact' || previous === 'impact')) {
        activePreset = value === 'impact' ? 'spatial' : defaultPreset; resetCamera();
      }
      render();
    },
    setAngle(value) {manualAngle = contactAngle(value); pose = mechanismPose(mode, clock.time, manualAngle); render();},
    setCutaway(value) {cutaway = value; render();}, resetCamera,
    renderFrame(frame) {pose = normalizePose(frame); if (frame.cutaway !== undefined) cutaway = frame.cutaway; if (frame.camera) applyCamera(frame.camera); render();},
    getCameraPreset(name) {return structuredClone(presets[name]);},
    dispose() {if (disposed) return; disposed = true; cancelAnimationFrame(request); observer.disconnect(); intersection.disconnect(); canvas.removeEventListener('keydown', keydown); controls.removeEventListener('change', changed); controls.dispose(); rig.dispose(); environment.dispose(); renderer.dispose();},
  };
}
