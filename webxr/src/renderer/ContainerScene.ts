import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { ContainerPreset, LocalContentState, TiltState } from "../types";
import { sanitizeDeviceContent, type DeviceContentState, type DeviceOrientation } from "../visualState";
import { GripProxy } from "./GripProxy";
import { ContainerGeometry, containerRestY, tableTopY, bottleBodyHeightM, bottleNeckRadiusM, tumblerTopDiameterM, tumblerBottomDiameterM } from "./ContainerGeometry";
import { LiquidContentRenderer } from "./LiquidContentRenderer";
import { ParticleContentRenderer } from "./ParticleContentRenderer";
import { disposeObjectTree } from "./disposeObjectTree";

export { containerRestY } from "./ContainerGeometry";
export type { DeviceContentState, DeviceOrientation } from "../visualState";

export class ContainerScene {
  readonly group = new THREE.Group();
  readonly gripProxy = new GripProxy();
  private preset?: ContainerPreset;
  private geometry?: ContainerGeometry;
  private resolvedDimensions = false;
  private deviceState?: DeviceContentState;
  private deviceOrientation?: DeviceOrientation;
  private liquid?: LiquidContentRenderer;
  private particles?: ParticleContentRenderer;
  private disposed = false;
  private deviceDirty = true;
  private desktop = true;
  private supportPoints: THREE.Vector3[] = [];
  private readonly offset = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();

  constructor() {
    this.group.name = "haptics-container";
    this.group.position.set(0, containerRestY, -0.72);
    this.gripProxy.setVisible(false);
  }

  setPreset(preset: ContainerPreset, useResolvedDimensions = false) {
    if (this.disposed) throw new Error("ContainerScene is disposed");
    this.preset = preset;
    this.resolvedDimensions = useResolvedDimensions;
    this.geometry = new ContainerGeometry(preset, useResolvedDimensions);
    this.deviceDirty = true;
    this.offset.set(0, 0, 0);
    this.rebuild();
    this.placeDesktop();
  }

  setDeviceState(state: DeviceContentState | null) {
    if (this.disposed) return;
    const wasConnected = this.deviceState !== undefined;
    this.deviceState = state ? sanitizeDeviceContent(state) : undefined;
    this.deviceDirty = true;
    if (!state) { this.deviceOrientation = undefined; this.offset.set(0, 0, 0); }
    if (wasConnected !== (this.deviceState !== undefined) && this.preset) this.rebuild();
  }

  setDeviceOrientation(orientation: DeviceOrientation | null) {
    if (this.disposed) return;
    this.deviceDirty = true;
    if (!orientation) this.deviceOrientation = undefined;
    else if (Number.isFinite(orientation.pitchRad) && Number.isFinite(orientation.rollRad)) this.deviceOrientation = { ...orientation };
  }

  /** A bounded acceleration cue, not inertial position tracking. Called only for
   * new snapshots, so stale/disconnected scenes remain completely still. */
  setDeviceAcceleration(acceleration: readonly number[] | null, elapsedSeconds = 0.1) {
    if (this.disposed) return;
    if (!acceleration) { this.offset.set(0, 0, 0); this.deviceDirty = true; return; }
    if (acceleration.length !== 3 || !acceleration.every(Number.isFinite)) return;
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return;
    const pose = this.deviceOrientation;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pose?.pitchRad ?? 0, 0, pose?.rollRad ?? 0));
    this.scratch.set(acceleration[0], acceleration[1], acceleration[2]).applyQuaternion(q);
    this.scratch.y = 0; // Desktop plane only; never push the vessel through the stage.
    const magnitude = this.scratch.length();
    const limit = Math.min(0.01, (this.geometry ? Math.min(...this.geometry.dimensions.toArray()) : 0.06) * 0.18);
    this.scratch.multiplyScalar(magnitude > 0.025 ? Math.min(limit, (magnitude - 0.025) * 0.018) / magnitude : 0);
    // Follow a gesture promptly, then gently recenter only its positional cue.
    // A 0.8 s release constant removes ~95% of the offset in 2.4 s of quiet input.
    const timeConstant = magnitude <= 0.025 ? 0.8 : 0.12;
    this.offset.lerp(this.scratch, 1 - Math.exp(-Math.min(elapsedSeconds, 0.5) / timeConstant));
    this.deviceDirty = true;
  }

  /** Tracked XR owns translation. Presentation placement only runs on desktop. */
  setDesktopPresentation(enabled: boolean) {
    if (this.desktop !== enabled) this.deviceDirty = true;
    this.desktop = enabled;
  }

  restY() { return tableTopY + (this.geometry?.dimensions.y ?? 0.06) * 0.5 + 0.0008; }
  getSize(target: THREE.Vector3) { return this.geometry ? target.copy(this.geometry.dimensions) : target.setScalar(0.06); }

  /** Stable anchor: following the translated object with the camera cancels the cue. */
  getDesktopTarget(target: THREE.Vector3) {
    return target.set(0, tableTopY + (this.geometry?.dimensions.length() ?? 0.104) * 0.5, -0.72);
  }

  update(tilt: TiltState, content: LocalContentState, elapsed: number, dt: number) {
    if (this.disposed) return;
    this.gripProxy.pulse(elapsed);
    if (this.deviceState) {
      if (this.desktop && !this.deviceDirty) return;
      if (this.deviceOrientation) this.group.rotation.set(this.deviceOrientation.pitchRad, 0, this.deviceOrientation.rollRad);
      this.liquid?.updateDevice(this.deviceState, this.group.quaternion);
      this.particles?.updateDevice(this.deviceState);
      this.deviceDirty = false;
    } else {
      this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, tilt.y * 0.62, 0.16);
      this.group.rotation.z = THREE.MathUtils.lerp(this.group.rotation.z, -tilt.x * 0.62, 0.16);
      this.liquid?.updatePreview(content, elapsed, this.group.quaternion);
      this.particles?.updatePreview(content, elapsed, dt, this.group.quaternion, this.liquid?.volume);
      // Preview motion is explicitly illustrative, never sent to the hardware.
      const gain = Math.min(...(this.geometry?.dimensions.toArray() ?? [0.06])) * 0.04;
      this.scratch.set(Math.tanh(content.surfaceVelocityX) * gain, 0, -Math.tanh(content.surfaceVelocityY) * gain);
      this.offset.lerp(this.scratch, 1 - Math.exp(-Math.min(dt, 0.1) * 12));
    }
    this.placeDesktop();
  }

  private placeDesktop() {
    if (!this.desktop || !this.supportPoints.length) return;
    let lowest = Infinity;
    for (const p of this.supportPoints) lowest = Math.min(lowest, this.scratch.copy(p).applyQuaternion(this.group.quaternion).y);
    this.group.position.set(this.offset.x, tableTopY - lowest + 0.0008, -0.72 + this.offset.z);
  }

  dispose() {
    if (this.disposed) return;
    this.clearPresentation();
    this.gripProxy.dispose();
    this.group.removeFromParent();
    this.disposed = true;
  }

  private clearPresentation() {
    this.group.remove(this.gripProxy.group);
    this.liquid?.dispose();
    this.particles?.dispose();
    disposeObjectTree(this.group);
    this.liquid = undefined;
    this.particles = undefined;
    this.supportPoints = [];
  }

  private rebuild() {
    this.clearPresentation();
    this.gripProxy.setVisible(false);
    if (!this.preset || !this.geometry || this.disposed) return;
    const dims = this.geometry.dimensions;
    const glass = new THREE.MeshPhysicalMaterial({
      color: "#d8edf0", transparent: true, opacity: 0.14, roughness: 0.18,
      metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12, depthWrite: false,
      side: THREE.FrontSide
    });
    const trim = new THREE.MeshStandardMaterial({ color: "#c3d4d5", roughness: 0.28, metalness: 0.65 });
    const shellGeometry = this.geometry.shape === "box"
      ? new RoundedBoxGeometry(dims.x, dims.y, dims.z, 3, Math.min(dims.x, dims.y, dims.z) * 0.018)
      : this.geometry.makeShellGeometry();
    const shell = new THREE.Mesh(shellGeometry, glass);
    shell.name = "container-shell";
    shell.renderOrder = 4;
    if (this.geometry.shape === "cylinder_bottle") shell.position.y = -dims.y / 2 + bottleBodyHeightM / 2;
    this.group.add(shell);

    const ring = (radius: number, y: number, width: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, width, 8, 64), material);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = y;
      mesh.renderOrder = 5;
      this.group.add(mesh);
    };
    if (this.geometry.shape === "box") {
      const outline = new THREE.BoxGeometry(dims.x, dims.y, dims.z);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(outline),
        new THREE.LineBasicMaterial({ color: "#c2e0e2", transparent: true, opacity: 0.4 }));
      outline.dispose();
      edges.renderOrder = 5;
      this.group.add(edges);
      // A narrow base shows wall thickness without covering the contents.
      const base = new THREE.Mesh(new RoundedBoxGeometry(dims.x, dims.y * 0.025, dims.z, 2, dims.y * 0.006), glass);
      base.position.y = -dims.y * 0.4875;
      base.renderOrder = 4;
      base.castShadow = true;
      this.group.add(base);
      trim.dispose();
    } else if (this.geometry.shape === "cylinder_bottle") {
      const shoulderY = -dims.y / 2 + bottleBodyHeightM;
      const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(bottleNeckRadiusM, dims.x / 2, 0.014, 64, 1, true), glass);
      shoulder.position.y = shoulderY + 0.007;
      shoulder.renderOrder = 4;
      this.group.add(shoulder);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(bottleNeckRadiusM, bottleNeckRadiusM, 0.006, 48, 1, true), glass);
      neck.position.y = shoulderY + 0.017;
      this.group.add(neck);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(bottleNeckRadiusM * 1.08, bottleNeckRadiusM * 1.08, 0.004, 64), trim);
      cap.position.y = dims.y / 2 - 0.002;
      cap.castShadow = true;
      this.group.add(cap);
      ring(dims.x / 2 - 0.0006, -dims.y / 2 + 0.0006, 0.0006, glass);
      ring(bottleNeckRadiusM * 1.07, dims.y / 2 - 0.001, 0.0005, trim);
    } else {
      ring(tumblerTopDiameterM / 2 - 0.0007, dims.y / 2 - 0.0007, 0.0007, glass);
      ring(tumblerBottomDiameterM / 2 - 0.0008, -dims.y / 2 + 0.0008, 0.0008, glass);
      trim.dispose();
    }
    // Cache only vessel vertices, including its cap and rims; never dynamic contents.
    for (const child of this.group.children) {
      const mesh = child as THREE.Mesh;
      if (!mesh.geometry) continue;
      mesh.updateMatrix();
      const positions = mesh.geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i++) this.supportPoints.push(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrix));
    }
    if (this.preset.family === "Liquid" || this.preset.family === "Hybrid") {
      this.liquid = new LiquidContentRenderer(this.preset, this.geometry);
      this.group.add(this.liquid.group);
    }
    if (this.preset.family === "Granular" || this.preset.family === "Hybrid") {
      this.particles = new ParticleContentRenderer(this.preset, this.geometry, this.resolvedDimensions);
      this.group.add(this.particles.group);
    }
    this.group.scale.setScalar(1);
    this.gripProxy.setSize(dims);
    this.group.add(this.gripProxy.group);
  }
}
