import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DeviceRig, type DeviceKinematics, type Vec3 } from './deviceRig';
import type { CameraFrame } from './device';

export type SeriesAngles = {A: number; B: number; C: number};
export interface SeriesFrame {
  angles: SeriesAngles; cutaway?: boolean; camera?: CameraFrame; showFingertips?: boolean;
  /** Illustrative hand input in the fixed CAD frame; pad angles remain relative to the body. */
  bodyTiltDeg?: number; bodyOffsetMeters?: Vec3;
}
export interface SeriesViewer {
  renderFrame(frame: SeriesFrame): void;
  getCameraPreset(name: 'overview'|'contact'|'side'): CameraFrame;
  getContactMarkers(): {id: string; x: number; y: number; visible: boolean}[];
  dispose(): void;
}

/** WHC2025's three-plane mechanism. No commands are sent to physical hardware. */
export async function createSeriesViewer(canvas: HTMLCanvasElement, options: {manual?: boolean; pixelRatio?: number} = {}): Promise<SeriesViewer> {
  const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power'});
  renderer.setPixelRatio(options.pixelRatio ?? Math.min(devicePixelRatio, 1.7));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .88;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(34, 1, .001, 10);
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04); scene.environment = environment.texture; scene.environmentIntensity = .55;
  room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xdbeaff, 0x343340, .85));
  for (const [color, intensity, position] of [[0xffeee0, 1.7, [-1,2,3]], [0x8be4df,1,[2,1,-2]], [0xffffff,.4,[-2,-.5,.5]]] as const) {
    const light = new THREE.DirectionalLight(color, intensity); light.position.set(position[0],position[1],position[2]); scene.add(light);
  }
  let rig: DeviceRig;
  try {
    const [gltf, response] = await Promise.all([new GLTFLoader().loadAsync('/models/whc2025-demo.glb'), fetch('/models/whc2025-kinematics.json')]);
    if (!response.ok) throw new Error('WHC2025 kinematic evidence unavailable.');
    rig = new DeviceRig(gltf, await response.json() as DeviceKinematics, {channelIds: ['A','B','C'], vibrationCount: 0});
    scene.add(rig.root);
  } catch (error) {environment.dispose(); renderer.dispose(); throw error;}
  const controls = new OrbitControls(camera, canvas); controls.enabled = !options.manual;
  controls.enableDamping = false; controls.enableZoom = false; controls.enablePan = false;
  const presets: Record<'overview'|'contact'|'side', CameraFrame> = {
    overview: {position: [.09,.055,.22], target: [0,0,0], up: [0,1,0], fov: 34},
    contact: {position: [.016,.02,.225], target: [0,0,0], up: [0,1,0], fov: 34},
    side: {position: [.2,.06,.12], target: [0,0,0], up: [0,1,0], fov: 34},
  };
  let disposed = false, fingersVisible = false;
  const fingertipGeometry = new THREE.CapsuleGeometry(.0055, .013, 6, 16);
  const fingertipMaterial = new THREE.MeshStandardMaterial({color: 0xf2dfc9, metalness: 0, roughness: .6, transparent: true, opacity: .5, depthWrite: false});
  const fingertips = new Map<string, THREE.Mesh>();
  for (const anchor of rig.getContactAnchors()) {
    const tip = new THREE.Mesh(fingertipGeometry, fingertipMaterial); tip.name = `illustrative_fingertip_${anchor.id}`; scene.add(tip); fingertips.set(anchor.id, tip);
  }
  const updateFingertips = () => {
    for (const anchor of rig.getContactAnchors()) {
      const tip = fingertips.get(anchor.id); if (!tip) continue;
      tip.visible = fingersVisible && !!anchor.normal;
      if (anchor.normal) {tip.position.copy(anchor.position).addScaledVector(anchor.normal, .012); tip.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), anchor.normal);}
    }
  };
  const applyCamera = (frame: CameraFrame) => {
    camera.position.set(...frame.position); controls.target.set(...(frame.target ?? [0,0,0]));
    camera.up.set(...(frame.up ?? [0,1,0])); camera.fov = frame.fov ?? 34;
    camera.updateProjectionMatrix(); camera.lookAt(controls.target); controls.update();
  };
  const draw = () => {if (!disposed) {updateFingertips(); renderer.render(scene,camera);}};
  const resize = () => {
    const rect = canvas.getBoundingClientRect(); if (disposed || !rect.width || !rect.height) return;
    renderer.setSize(rect.width,rect.height,false); camera.aspect = rect.width/rect.height; camera.updateProjectionMatrix(); draw();
  };
  const observer = new ResizeObserver(resize); observer.observe(canvas); resize(); applyCamera(presets.overview);
  controls.addEventListener('change',draw);
  rig.setAngles({A:0,B:0,C:0}); draw(); canvas.dataset.ready = 'true';
  return {
    renderFrame(frame) {
      rig.root.rotation.z = THREE.MathUtils.degToRad(frame.bodyTiltDeg ?? 0);
      rig.root.position.set(...(frame.bodyOffsetMeters ?? [0,0,0]));
      rig.setAngles(frame.angles); if (frame.cutaway !== undefined) rig.setCutaway(frame.cutaway);
      if (frame.showFingertips !== undefined) fingersVisible = frame.showFingertips;
      if (frame.camera) applyCamera(frame.camera); draw(); canvas.dataset.angles = JSON.stringify(frame.angles);
    },
    getCameraPreset(name) {return structuredClone(presets[name]);},
    getContactMarkers() {
      return rig.getContactAnchors().map(({id,position}) => {
        const point = position.project(camera);
        return {id,x:(point.x+1)/2,y:(1-point.y)/2,visible:Math.abs(point.x)<1&&Math.abs(point.y)<1&&Math.abs(point.z)<1};
      });
    },
    dispose() {
      if (disposed) return; disposed = true; observer.disconnect(); controls.removeEventListener('change',draw); controls.dispose();
      rig.dispose(); fingertipGeometry.dispose(); fingertipMaterial.dispose(); environment.dispose(); renderer.dispose();
    },
  };
}
