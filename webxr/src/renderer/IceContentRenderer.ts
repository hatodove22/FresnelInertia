import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { ContainerPreset, LocalContentState } from "../types";
import type { DeviceContentState } from "../visualState";
import type { ContainedVolume } from "./ContainedVolume";
import { ContainerGeometry } from "./ContainerGeometry";
import { disposeObjectTree } from "./disposeObjectTree";

const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const unit = (value: number) => THREE.MathUtils.clamp(finite(value), 0, 1);
const signed = (value: number) => THREE.MathUtils.clamp(finite(value), -1, 1);
const hash = (seed: number) => { const value = Math.sin(seed * 127.1 + 51.7) * 43758.5453; return value - Math.floor(value); };
const corners = [-0.5, 0.5].flatMap(x => [-0.5, 0.5].flatMap(y => [-0.5, 0.5].map(z => new THREE.Vector3(x, y, z))));

function frostTexture() {
  const side = 64, data = new Uint8Array(side * side * 4);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const ix = Math.floor(x / 12), iy = Math.floor(y / 12);
    const smooth = (v: number) => v * v * (3 - 2 * v);
    const fx = smooth(x / 12 - ix), fy = smooth(y / 12 - iy);
    const cloud = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(hash(ix + iy * 71), hash(ix + 1 + iy * 71), fx),
      THREE.MathUtils.lerp(hash(ix + (iy + 1) * 71), hash(ix + 1 + (iy + 1) * 71), fx), fy);
    const value = Math.round(65 + cloud * 82 + hash(x + y * side) * 45);
    const at = (y * side + x) * 4;
    data[at] = data[at + 1] = data[at + 2] = value; data[at + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, side, side, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

interface IcePose { offset: THREE.Vector3; rotation: THREE.Quaternion; size: THREE.Vector3 }

/** A few legible ice chunks float on the existing liquid plane. This is a
 * stateless aggregate-state illustration, not individual buoyancy/collisions. */
export class IceContentRenderer {
  readonly group = new THREE.Group();
  private readonly bodies: THREE.InstancedMesh;
  private readonly bubbles: THREE.InstancedMesh;
  private readonly details: THREE.Group[] = [];
  private readonly edge: number;
  private readonly dummy = new THREE.Object3D();
  private readonly bubbleDummy = new THREE.Object3D();
  private readonly bubbleMatrix = new THREE.Matrix4();
  private readonly normal = new THREE.Vector3();
  private readonly u = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly point = new THREE.Vector3();
  private readonly anchor = new THREE.Vector3();
  private readonly center = new THREE.Vector3();
  private readonly surfaceRotation = new THREE.Quaternion();
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private disposed = false;

  constructor(private readonly preset: ContainerPreset, private readonly geometry: ContainerGeometry) {
    this.group.name = "ice-content"; this.group.visible = false;
    const count = Math.min(6, Math.max(3, Math.round(3 + unit(preset.container.particle_count ?? 0.18) * 4)));
    this.edge = Math.min(...geometry.dimensions.toArray()) * (count > 4 ? 0.19 : 0.23);
    const rounded = new RoundedBoxGeometry(1, 1, 1, 3, 0.12);
    const frost = frostTexture();
    const clear = new THREE.MeshPhysicalMaterial({
      color: "#e5f7fc", metalness: 0, roughness: 0.24, roughnessMap: frost,
      bumpMap: frost, bumpScale: this.edge * 0.006,
      // Three's transmission pass cannot recursively refract the surrounding
      // water. Alpha compositing preserves that already-drawn water and the
      // internal detail instead of replacing each chunk with the grey backdrop.
      transparent: true, opacity: 0.48, transmission: 0.55,
      ior: 1.31, thickness: this.edge * 0.55,
      attenuationColor: "#c5edf7", attenuationDistance: this.edge * 10,
      envMapIntensity: 1.25, clearcoat: 0.65, clearcoatRoughness: 0.09,
      depthWrite: false, side: THREE.FrontSide
    });
    this.bodies = new THREE.InstancedMesh(rounded, clear, count);
    this.bodies.name = "content-particles";
    this.bodies.userData.ice = true; this.bodies.userData.representativeCount = count;
    this.bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Ordinary opaque shadow maps make clear ice look like solid plastic.
    // The surrounding liquid already owns its approximate caustic footprint.
    this.bodies.castShadow = false; this.bodies.receiveShadow = true;
    this.bodies.renderOrder = 3;
    this.group.add(this.bodies);

    // Sparse internal inclusions leave the broad faces transparent. Geometry
    // and materials are shared inside this owner and disposed exactly once.
    const cloudMaterial = new THREE.MeshStandardMaterial({ color: "#e5f6f8", transparent: true,
      opacity: 0.15, roughness: 0.82, depthWrite: false });
    const bubbleGeometry = new THREE.SphereGeometry(1, 8, 6);
    const bubbleMaterial = new THREE.MeshStandardMaterial({ color: "#efffff", roughness: 0.23,
      transparent: true, opacity: 0.48, depthWrite: false });
    this.bubbles = new THREE.InstancedMesh(bubbleGeometry, bubbleMaterial, count * 5);
    this.bubbles.name = "ice-air-pockets"; this.bubbles.renderOrder = 4;
    this.bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.bubbles);
    const crackMaterial = new THREE.LineBasicMaterial({ color: "#d7f5fa", transparent: true, opacity: 0.30, depthWrite: false });
    for (let i = 0; i < count; i++) {
      const detail = new THREE.Group(); detail.name = `ice-detail-${i}`;
      const cloud = new THREE.Mesh(rounded, cloudMaterial);
      cloud.name = "ice-frost-core";
      cloud.scale.set(0.43, 0.58, 0.42); cloud.position.set(-0.08, -0.05, 0.04);
      cloud.rotation.set(0.12, 0.25, -0.18); cloud.renderOrder = 4;
      detail.add(cloud);
      const line = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.27, -0.13, -0.02), new THREE.Vector3(-0.06, 0.08, 0.02),
        new THREE.Vector3(-0.06, 0.08, 0.02), new THREE.Vector3(0.20, 0.23, -0.04),
        new THREE.Vector3(-0.06, 0.08, 0.02), new THREE.Vector3(0.08, -0.14, 0.12)
      ]);
      const cracks = new THREE.LineSegments(line, crackMaterial); cracks.name = "ice-fractures"; cracks.renderOrder = 4;
      detail.add(cracks); this.details.push(detail); this.group.add(detail);
    }
  }

  private fits(anchor: THREE.Vector3, scale: number, points: THREE.Vector3[], volume: ContainedVolume) {
    const margin = Math.min(...this.geometry.dimensions.toArray()) * 0.002;
    // The box's visible glass base ends at -0.475Y; its liquid hull is slightly lower.
    const floor = this.geometry.shape === "box" ? -this.geometry.dimensions.y * 0.474 : volume.lower.y + margin;
    return points.every(point => {
      this.point.copy(point).multiplyScalar(scale).add(anchor);
      return this.point.y >= floor && volume.contains(this.point, margin);
    });
  }

  updateDevice(state: DeviceContentState, volume: ContainedVolume) {
    if (this.disposed) return;
    this.group.visible = unit(state.fill) > 0 && volume.volume > 0;
    if (!this.group.visible) return;
    this.normal.copy(volume.normal).normalize();
    if (!Number.isFinite(this.normal.lengthSq()) || this.normal.lengthSq() < 0.5) this.normal.copy(this.yAxis);
    this.u.set(1, 0, 0).addScaledVector(this.normal, -this.normal.x);
    if (this.u.lengthSq() < 1e-6) this.u.set(0, 0, 1).addScaledVector(this.normal, -this.normal.z);
    this.u.normalize(); this.v.crossVectors(this.u, this.normal).normalize();
    this.surfaceRotation.setFromUnitVectors(this.yAxis, this.normal);
    this.center.copy(volume.lower).add(volume.upper).multiplyScalar(0.5);
    this.anchor.copy(this.center);
    if (volume.boundary.length >= 3) {
      this.anchor.set(0, 0, 0);
      for (const point of volume.boundary) this.anchor.add(point);
      this.anchor.multiplyScalar(1 / volume.boundary.length);
    } else this.anchor.addScaledVector(this.normal, volume.offset - this.normal.dot(this.anchor));
    const width = Math.abs(this.u.x) * volume.size.x + Math.abs(this.u.y) * volume.size.y + Math.abs(this.u.z) * volume.size.z;
    this.anchor.addScaledVector(this.u, signed(state.massX) * width * 0.16);
    if (Math.abs(this.normal.y) > 0.25) this.anchor.y = volume.heightAt(this.anchor.x, this.anchor.z);

    const count = this.bodies.count, columns = count > 4 ? 3 : 2, rows = Math.ceil(count / columns);
    const poses: IcePose[] = [], hullPoints: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / columns), rowCount = Math.min(columns, count - row * columns);
      const size = new THREE.Vector3(0.94 + hash(i + 3) * 0.10, 0.83 + hash(i + 5) * 0.13, 0.89 + hash(i + 9) * 0.13).multiplyScalar(this.edge);
      const rotation = this.surfaceRotation.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(
        (hash(i + 11) - 0.5) * 0.20 + Math.tanh(finite(state.velocityY)) * 0.08,
        hash(i + 19) * Math.PI * 2 + signed(state.massX) * 0.18,
        (hash(i + 17) - 0.5) * 0.20 - Math.tanh(finite(state.velocityX)) * 0.10)));
      const offset = this.u.clone().multiplyScalar((i % columns - (rowCount - 1) / 2) * this.edge * 1.85)
        .addScaledVector(this.v, (row - (rows - 1) / 2) * this.edge * 1.85)
        .addScaledVector(this.normal, -this.edge * (0.26 + hash(i + 23) * 0.035));
      poses.push({ offset, rotation, size });
      for (const corner of corners) hullPoints.push(corner.clone().multiply(size).applyQuaternion(rotation).add(offset));
    }
    // Fit the complete formation, preserving spacing between chunks. Common
    // translation/shrinkage takes precedence when a side-on/narrow/full cavity
    // cannot contain this illustrative amount of ice at the free surface.
    let scale = 1;
    if (!this.fits(this.center, scale, hullPoints, volume)) {
      let lo = 0, hi = 1;
      for (let step = 0; step < 20; step++) {
        const mid = (lo + hi) / 2;
        if (this.fits(this.center, mid, hullPoints, volume)) lo = mid; else hi = mid;
      }
      scale = lo;
    }
    if (!this.fits(this.anchor, scale, hullPoints, volume)) {
      const target = this.anchor.clone(); let lo = 0, hi = 1;
      for (let step = 0; step < 20; step++) {
        const mid = (lo + hi) / 2;
        this.anchor.copy(this.center).lerp(target, mid);
        if (this.fits(this.anchor, scale, hullPoints, volume)) lo = mid; else hi = mid;
      }
      this.anchor.copy(this.center).lerp(target, lo);
    }
    for (let i = 0; i < count; i++) {
      const pose = poses[i];
      this.dummy.position.copy(pose.offset).multiplyScalar(scale).add(this.anchor);
      this.dummy.quaternion.copy(pose.rotation); this.dummy.scale.copy(pose.size).multiplyScalar(scale);
      this.dummy.updateMatrix(); this.bodies.setMatrixAt(i, this.dummy.matrix);
      this.details[i].position.copy(this.dummy.position); this.details[i].quaternion.copy(this.dummy.quaternion);
      this.details[i].scale.copy(this.dummy.scale);
      for (let j = 0; j < 5; j++) {
        const seed = i * 13 + j * 3;
        this.bubbleDummy.position.set((hash(seed + 2) - 0.5) * 0.58, (hash(seed + 3) - 0.5) * 0.55, (hash(seed + 4) - 0.5) * 0.54);
        this.bubbleDummy.scale.setScalar(0.014 + hash(seed + 5) * 0.023); this.bubbleDummy.updateMatrix();
        this.bubbleMatrix.multiplyMatrices(this.dummy.matrix, this.bubbleDummy.matrix);
        this.bubbles.setMatrixAt(i * 5 + j, this.bubbleMatrix);
      }
    }
    this.bodies.instanceMatrix.needsUpdate = true; this.bodies.computeBoundingSphere();
    this.bubbles.instanceMatrix.needsUpdate = true; this.bubbles.computeBoundingSphere();
  }

  updatePreview(content: LocalContentState, _elapsed: number, _dt: number, _orientation: THREE.Quaternion, volume: ContainedVolume) {
    this.updateDevice({ massX: content.surfaceOffsetX, massY: -1 + this.preset.container.fill,
      velocityX: content.surfaceVelocityX, velocityY: content.surfaceVelocityY,
      energy: content.agitation, fill: this.preset.container.fill }, volume);
  }

  dispose() {
    if (this.disposed) return;
    disposeObjectTree(this.group); this.group.removeFromParent(); this.disposed = true;
  }
}
