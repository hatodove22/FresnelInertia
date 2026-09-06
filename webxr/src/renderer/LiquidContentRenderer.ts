import * as THREE from "three";
import type { ContainerPreset, LocalContentState } from "../types";
import type { DeviceContentState } from "../visualState";
import { ContainerGeometry } from "./ContainerGeometry";
import { ContainedVolume } from "./ContainedVolume";
import { makeLiquidNormalTexture } from "./ProceduralAssets";
import { disposeObjectTree } from "./disposeObjectTree";
import { LiquidContactLine } from "./LiquidContactLine";
import { LiquidCaustics } from "./LiquidCaustics";
import { LiquidSlosh } from "./LiquidSlosh";
import { SodaJet } from "./SodaJet";

/** Convex containment and rich source-clock optics share one material owner.
 * Presentation motion is never fed back into device dynamics or outputs. */
export class LiquidContentRenderer {
  readonly group = new THREE.Group();
  readonly volume: ContainedVolume;
  private readonly liquid: THREE.Mesh;
  private readonly liquidSurface: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  private readonly liquidContact: LiquidContactLine;
  private readonly liquidCaustics: LiquidCaustics;
  private readonly liquidSlosh: LiquidSlosh;
  private readonly sodaJet: SodaJet;
  private readonly sodaBubbles: THREE.InstancedMesh;
  private readonly sodaSpray: THREE.InstancedMesh;
  private readonly surfaceNormal = new THREE.Vector3();
  private readonly inverse = new THREE.Quaternion();
  private readonly dummy = new THREE.Object3D();

  constructor(private readonly preset: ContainerPreset, private readonly geometry: ContainerGeometry) {
    this.volume = new ContainedVolume(geometry.liquidHull(), geometry.dimensions.x);
    this.liquid = new THREE.Mesh(this.volume.body, new THREE.MeshPhysicalMaterial({
      color: "#c7f3f0", roughness: 0.075, metalness: 0,
      opacity: 1, transmission: 0.94, ior: 1.333,
      attenuationColor: "#3299a5", attenuationDistance: geometry.dimensions.z * 1.4,
      thickness: geometry.dimensions.z, envMapIntensity: 0.85,
      side: THREE.FrontSide, depthWrite: false
    }));
    this.liquidSurface = new THREE.Mesh(this.volume.surface, new THREE.MeshPhysicalMaterial({ normalMap: makeLiquidNormalTexture(), side: THREE.DoubleSide }));
    this.liquidSurface.material.normalMap!.colorSpace = THREE.NoColorSpace;
    Object.assign(this.liquidSurface.material, {
      transparent: false, opacity: 1, transmission: 0.92, ior: 1.333,
      roughness: 0.07, thickness: geometry.dimensions.y * this.preset.container.fill,
      attenuationDistance: geometry.dimensions.y * 2, envMapIntensity: 1.1,
      clearcoat: 0, depthWrite: false
    });
    this.liquidSurface.material.color.set("#d1f7f3");
    this.liquidSurface.material.attenuationColor.set("#58b1b7");
    this.liquidSurface.material.normalScale.set(0.075, 0.075);
    const bubbleMaterial = new THREE.MeshPhysicalMaterial({ color: "#efffff", transparent: true, opacity: 0.68, roughness: 0.1, clearcoat: 1, depthWrite: false });
    this.sodaBubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), bubbleMaterial, 72);
    this.sodaBubbles.name = "content-soda-bubbles";
    this.sodaBubbles.renderOrder = 3;
    this.sodaBubbles.visible = false;
    const sprayMaterial = new THREE.MeshStandardMaterial({ color: "#efffff", emissive: "#87d7dc",
      emissiveIntensity: 0.22, transparent: true, opacity: 0.9, roughness: 0.24, depthWrite: false });
    this.sodaSpray = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 5), sprayMaterial, 96);
    this.sodaSpray.name = "content-soda-spray";
    this.sodaSpray.renderOrder = 7;
    this.sodaSpray.visible = false;
    this.group.add(this.sodaBubbles, this.sodaSpray);
    this.sodaJet = new SodaJet(geometry.dimensions);
    this.liquidContact = new LiquidContactLine(this.volume.size);
    this.group.add(this.sodaJet.group, this.liquidContact.group);
    this.liquidCaustics = new LiquidCaustics(this.volume.size, geometry.liquidHull()[0]);
    this.group.add(this.liquidCaustics.mesh);
    this.liquidSlosh = new LiquidSlosh(this.volume.size);
    this.liquid.name = "content-liquid";
    this.liquid.renderOrder = 1;
    this.liquidSurface.name = "content-liquid-surface";
    this.liquidSurface.renderOrder = 2;
    this.group.add(this.liquid, this.liquidSurface);
    this.volume.update(preset.container.fill, this.surfaceNormal.set(0, 1, 0));
  }

  updatePreview(content: LocalContentState, elapsed: number, orientation: THREE.Quaternion) {
    this.updateDevice({
      massX: content.surfaceOffsetX, massY: -1 + this.preset.container.fill,
      velocityX: content.surfaceVelocityX, velocityY: content.surfaceVelocityY,
      energy: content.agitation, slosh: content.agitation, fill: this.preset.container.fill,
      phaseS: elapsed
    }, orientation);
  }

  private hash01(value: number) {
    const s = Math.sin(value * 127.1) * 43758.5453;
    return s - Math.floor(s);
  }

  updateDevice(state: DeviceContentState, orientation: THREE.Quaternion) {
    const pressure = state.pressure;
    const fill = state.fill * (pressure?.remaining ?? 1);
    const activity = state.slosh ?? state.energy;
    const phase = state.phaseS ?? state.massX * 3 + state.massY * 2 + state.velocityY * 0.1;
    this.surfaceNormal.set(0, 1, 0).applyQuaternion(this.inverse.copy(orientation).invert());
    // A free surface is level in world space at rest. State-driven dynamic
    // disturbance remains in the device's actual modeled x/y cross-section.
    this.surfaceNormal.x -= THREE.MathUtils.clamp(state.massX * 0.22 + state.velocityX * 0.025, -0.35, 0.35) * activity;
    this.surfaceNormal.y -= THREE.MathUtils.clamp(state.massY * 0.12 + state.velocityY * 0.025, -0.35, 0.35) * activity;
    const span = Math.min(this.geometry.dimensions.x, this.geometry.dimensions.y, this.geometry.dimensions.z);
    // Decorative water modes can be richer than the reduced haptic model. They
    // consume the source clock/pose but never feed back into content or outputs.
    // Missing sample times retain the old stateless path instead of inventing a
    // live clock for legacy input. Repeated samples freeze all visual dynamics.
    const visual = state.phaseS === undefined ? undefined : this.liquidSlosh.update({
      timeS: state.phaseS, normal: this.surfaceNormal,
      massX: state.massX, massY: state.massY, velocityX: state.velocityX, velocityY: state.velocityY,
      activity, fill, viscosity: this.preset.container.viscosity ?? 0.3
    });
    const visualActivity = visual?.activity ?? activity;
    this.volume.update(fill, visual?.normal ?? this.surfaceNormal,
      visual ? 0 : span * 0.024 * activity, visual ? 0 : phase, visual);
    this.liquid.visible = this.liquidSurface.visible = fill > 0;
    this.liquid.position.set(0, 0, 0);
    this.liquid.scale.set(1, 1, 1);
    this.liquid.rotation.set(0, 0, 0);
    this.liquidSurface.position.set(0, 0, 0);
    this.liquidSurface.rotation.set(0, 0, 0);
    this.liquidSurface.scale.set(1, 1, 1);
    this.liquid.userData.centroid = this.volume.centroid.toArray();
    this.liquid.userData.fillVolume = this.volume.volume;
    this.liquidSurface.userData.visualDynamics = !!visual;
    this.liquidSurface.userData.visualActivity = visualActivity;
    this.liquidSurface.userData.visualNormal = this.volume.normal.toArray();
    this.liquidSurface.material.thickness = this.geometry.dimensions.y * fill;
    this.liquidSurface.material.normalScale.setScalar(0.018 + visualActivity * 0.19);
    const flowX = visual?.flow.x ?? state.massX * 0.035;
    const flowZ = visual?.flow.y ?? state.massY * 0.02;
    this.liquidSurface.material.normalMap?.offset.set(flowX, flowZ);
    this.liquidContact.update(this.volume, fill, pressure ? pressure.charge * 0.7 : 0);
    this.liquidCaustics.update(fill, visualActivity, flowX * 18 + flowZ * 13, this.volume);
    this.sodaJet.update(pressure);
    this.updateCarbonation(state);
    this.group.userData.volumeFraction = this.volume.volume / this.volume.capacity;
    this.group.userData.surfaceNormal = this.volume.normal.toArray();
  }

  private updateCarbonation(state: DeviceContentState) {
    const pressure = state.pressure;
    this.sodaBubbles.visible = !!pressure && state.fill * pressure.remaining > 0 && pressure.phase !== "spent";
    this.sodaSpray.visible = pressure?.phase === "burst" && pressure.phaseS < 2.3;
    if (!pressure) return;
    const span = Math.min(this.geometry.dimensions.x, this.geometry.dimensions.y, this.geometry.dimensions.z);
    const phase = pressure.phaseS;
    for (let i = 0; i < this.sodaBubbles.count; i++) {
      const seed = i * 13.73 + pressure.burstSequence * 0.47;
      const x = (this.hash01(seed + 1.1) - 0.5) * this.geometry.dimensions.x * 0.88;
      const z = (this.hash01(seed + 4.9) - 0.5) * this.geometry.dimensions.z * 0.88;
      const ceiling = this.volume.heightAt(x, z);
      const height = Math.max(0, ceiling + this.geometry.dimensions.y / 2);
      const rise = (this.hash01(seed + 9.3) + phase * (0.16 + pressure.charge * 0.28)) % 1;
      const radius = span * (0.0035 + pressure.charge * 0.006) * (0.7 + this.hash01(seed * 2.1) * 0.6);
      this.dummy.position.set(x, -this.geometry.dimensions.y / 2 + rise * height, z);
      const inside = this.volume.normal.dot(this.dummy.position) < this.volume.offset - radius && height > radius * 2 && this.volume.contains(this.dummy.position, radius);
      this.dummy.scale.setScalar(inside ? radius : 0);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.sodaBubbles.setMatrixAt(i, this.dummy.matrix);
    }
    for (let i = 0; i < this.sodaSpray.count; i++) {
      const seed = i * 7.31 + pressure.burstSequence;
      // A short initial pop followed by a dwindling jet, all on the shared
      // burst clock. Millimetre-scale droplets remain legible on a phone.
      const delay = i < 24 ? this.hash01(seed + 0.3) * 0.12 : this.hash01(seed + 0.3) * 1.65;
      const age = phase - delay;
      const life = 0.55 + this.hash01(seed * 3.4) * 0.6;
      const active = pressure.phase === "burst" && age >= 0 && age < life;
      const angle = seed * 2.4;
      const velocity = span * (0.4 + this.hash01(seed) * 0.75);
      this.dummy.position.set(
        Math.cos(angle) * velocity * age,
        this.geometry.dimensions.y / 2 + span * 2.6 * age - span * 3.1 * age * age,
        Math.sin(angle) * velocity * age
      );
      // Fine elongated satellites around the connected jet, not large beads
      // standing in for the entire fluid mass.
      const radius = span * (0.007 + this.hash01(seed * 5) * 0.012) * Math.exp(-delay * 0.45);
      const size = active ? radius * Math.sqrt(1 - age / life) : 0;
      this.dummy.scale.set(size * 0.75, size * 1.5, size * 0.75);
      this.dummy.rotation.set(Math.cos(angle) * 0.55, 0, Math.sin(angle) * 0.55);
      this.dummy.updateMatrix();
      this.sodaSpray.setMatrixAt(i, this.dummy.matrix);
    }
    this.sodaBubbles.instanceMatrix.needsUpdate = true;
    this.sodaSpray.instanceMatrix.needsUpdate = true;
    this.sodaBubbles.computeBoundingSphere();
    this.sodaSpray.computeBoundingSphere();
  }
  dispose() {
    this.sodaJet.dispose();
    this.sodaJet.group.removeFromParent();
    this.liquidContact.dispose();
    this.liquidCaustics.dispose();
    disposeObjectTree(this.group);
    this.group.removeFromParent();
  }
}
