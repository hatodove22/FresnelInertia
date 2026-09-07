import * as THREE from "three";
import type { ContainerPreset, LocalContentState } from "../types";
import type { DeviceContentState } from "../visualState";
import { ContainerGeometry } from "./ContainerGeometry";
import { disposeObjectTree } from "./disposeObjectTree";
import { createCoinRigidBodies, type CoinRigidBodyModel, type CoinRigidBodyPose } from "./CoinRigidBodies";

const clamp = THREE.MathUtils.clamp;
const hash = (n: number) => { const v = Math.sin(n * 127.1 + 31.7) * 43758.5453; return v - Math.floor(v); };
export const isSingleCoin = (preset: ContainerPreset) => /single.*coin|coin.*single/i.test(preset.preset);

/** Coins need finite footprint/thickness, not a particle cloud that collapses
 * onto one point at a wall. Count is illustrative except the explicit single. */
export function coinLayout(preset: ContainerPreset, size: THREE.Vector3) {
  const count = isSingleCoin(preset) ? 1 : Math.round(3 + clamp(preset.container.particle_count ?? 0.25, 0, 1) * 20);
  // Each disc gets its own shallow layer. The previous two-column depth layout
  // occupied almost the full floor, leaving only 0.9 mm of fore/aft travel.
  // This is only the initial arrangement. Contacts, not this layout, determine
  // every subsequent position and orientation.
  const layers = count;
  const positions = Array.from({ length: count }, (_, i) => {
    return { x: count === 1 ? 0 : (hash(i + 2) - 0.5) * 0.44,
      z: count === 1 ? 0 : (i % 2 ? 1 : -1) * 0.32 + (hash(i + 11) - 0.5) * 0.14, layer: i,
      slide: count === 1 ? 0 : (hash(i + 37) - 0.5) * 0.44,
      yaw: hash(i + 19) * Math.PI * 2 };
  });
  const meanX = positions.reduce((sum, p) => sum + p.x, 0) / count;
  const meanZ = positions.reduce((sum, p) => sum + p.z, 0) / count;
  const meanSlide = positions.reduce((sum, p) => sum + p.slide, 0) / count;
  positions.forEach(p => { p.x -= meanX; p.z -= meanZ; p.slide -= meanSlide; });
  // Fit the actual centered footprint, including incomplete rows/layers.
  // sqrt(1 + .08^2) bounds cylinder support at any rocking angle.
  const support = Math.hypot(1, 0.08);
  const radius = Math.min(Math.min(size.x, size.y, size.z) * (count === 1 ? 0.30 : 0.24),
    size.x * 0.45 / (Math.max(...positions.map(p => Math.abs(p.x) + Math.abs(p.slide))) + support),
    size.z * 0.45 / (Math.max(...positions.map(p => Math.abs(p.z))) + support),
    // Leave room for an upright disc among otherwise flat layers.
    size.y * 0.94 / ((layers - 1) * (0.16 + 0.025) + 2 * support + 0.22),
    size.y * 0.90 / (layers * (2 * (0.08 + Math.sin(0.065)) + 0.025)));
  positions.forEach(p => { p.x *= radius; p.z *= radius; p.slide *= radius; });
  return { count, radius, positions };
}

function faceTexture(reverse = false) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#a9a294"; ctx.fillRect(0, 0, 256, 256);
  // A restrained minted face, including concentric rims and radial milling.
  for (let i = 0; i < 90; i++) {
    const a = i * Math.PI * 2 / 90;
    ctx.strokeStyle = i % 2 ? "#e5dfcd" : "#827764"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(128 + Math.cos(a) * 111, 128 + Math.sin(a) * 111);
    ctx.lineTo(128 + Math.cos(a) * 120, 128 + Math.sin(a) * 120); ctx.stroke();
  }
  for (const [r, color, width] of [[105, "#efe4c5", 3], [99, "#73654c", 2], [72, "#c9bc9e", 1]] as const) {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.arc(128, 128, r, 0, Math.PI * 2); ctx.stroke();
  }
  if (reverse) {
    // Distinct reverse: an eight-point minted rosette makes an actual half
    // turn visible, unlike identical artwork on both cylinder caps.
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const angle = i * Math.PI / 8, r = i % 2 ? 24 : 58;
      const x = 128 + Math.sin(angle) * r, y = 128 + Math.cos(angle) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fillStyle = "#89754e"; ctx.fill();
    ctx.strokeStyle = "#f6e8be"; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(128, 128, 12, 0, Math.PI * 2); ctx.fillStyle = "#e9d5a3"; ctx.fill();
  } else {
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "bold 92px Georgia, serif"; ctx.fillStyle = "#796c52"; ctx.fillText("1", 130, 134);
    ctx.fillStyle = "#f2e7cb"; ctx.fillText("1", 127, 131);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Visual-only rigid bodies share accepted IMU input with the haptic model.
 * They do not copy its aggregate centroid or emit any actuator/audio events. */
export class CoinContentRenderer {
  readonly group = new THREE.Group();
  readonly ready: Promise<void>;
  status: "loading" | "ready" | "error" = "loading";
  error?: string;
  private readonly layout;
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly gravity = new THREE.Vector3();
  private readonly inverse = new THREE.Quaternion();
  private physics?: CoinRigidBodyModel;
  private previewTime = 0;
  private disposed = false;

  constructor(private readonly preset: ContainerPreset, private readonly geometry: ContainerGeometry) {
    this.group.name = "coin-content";
    this.layout = coinLayout(preset, geometry.dimensions);
    const edge = new THREE.MeshStandardMaterial({ color: "#b9a474", metalness: 0.86, roughness: 0.28 });
    const face = new THREE.MeshStandardMaterial({ color: "#e1cb94", map: faceTexture(), metalness: 0.76, roughness: 0.36 });
    const reverse = new THREE.MeshStandardMaterial({ color: "#d6bd82", map: faceTexture(true), metalness: 0.76, roughness: 0.36 });
    this.mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 0.16, 64), [edge, face, reverse], this.layout.count);
    this.mesh.name = "content-particles";
    this.mesh.userData.coin = true;
    this.mesh.userData.representativeCount = this.layout.count;
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 3;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < this.layout.count; i++) this.mesh.setColorAt(i, new THREE.Color().setHSL(0.11, 0.08, 0.86 + hash(i) * 0.12));
    this.group.add(this.mesh);
    const { radius } = this.layout;
    const initial = this.layout.positions.map(p => ({
      position: { x: p.x, y: -geometry.dimensions.y * 0.474 + radius * (0.08 + p.layer * 0.185), z: p.z },
      rotation: { x: 0, y: Math.sin(p.yaw / 2), z: 0, w: Math.cos(p.yaw / 2) },
      radius
    }));
    this.present(initial);
    this.mesh.visible = preset.container.fill > 0;
    this.ready = createCoinRigidBodies(geometry.dimensions, initial).then(model => {
      // Selecting another material while Wasm loads must release the abandoned
      // world, not attach it to the next material or replay the loading gesture.
      if (this.disposed) { model.dispose(); return; }
      this.physics = model;
      this.status = "ready";
    }).catch(error => {
      if (this.disposed) return;
      this.status = "error";
      this.error = error instanceof Error ? error.message : String(error);
    });
  }

  private present(poses: readonly CoinRigidBodyPose[]) {
    poses.forEach((pose, i) => {
      this.dummy.position.copy(pose.position);
      this.dummy.quaternion.copy(pose.rotation);
      this.dummy.scale.setScalar(this.layout.radius);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingSphere();
  }

  updateDevice(state: DeviceContentState, orientation = new THREE.Quaternion(), acceleration?: readonly number[]) {
    if (this.disposed) return;
    this.mesh.visible = state.fill > 0;
    this.gravity.set(0, -1, 0).applyQuaternion(this.inverse.copy(orientation).invert());
    if (this.physics) this.present(this.physics.update({
      timeS: state.phaseS, gravity: this.gravity, acceleration, fill: state.fill
    }));
  }

  updatePreview(_content: LocalContentState, dt: number, orientation: THREE.Quaternion) {
    if (this.disposed || !Number.isFinite(dt)) return;
    this.previewTime += clamp(dt, 0, 0.05);
    this.mesh.visible = this.preset.container.fill > 0;
    this.gravity.set(0, -1, 0).applyQuaternion(this.inverse.copy(orientation).invert());
    if (this.physics) this.present(this.physics.update({
      timeS: this.previewTime, gravity: this.gravity, fill: this.preset.container.fill
    }));
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.physics?.dispose();
    this.physics = undefined;
    disposeObjectTree(this.group);
    this.group.removeFromParent();
  }
}
