import * as THREE from "three";
import type { ContainerPreset, LocalContentState } from "../types";
import type { DeviceContentState } from "../visualState";
import { ContainerGeometry } from "./ContainerGeometry";
import { ContainedVolume } from "./ContainedVolume";
import { makeLiquidNormalTexture } from "./ProceduralAssets";
import { disposeObjectTree } from "./disposeObjectTree";

/** Contained, constant-volume liquid. Free-surface bias illustrates aggregate
 * motion; it is not a second simulation or an exact reconstruction of CoM. */
export class LiquidContentRenderer {
  readonly group = new THREE.Group();
  readonly volume: ContainedVolume;
  private readonly liquid: THREE.Mesh;
  private readonly liquidSurface: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  private readonly normal = new THREE.Vector3();
  private readonly inverse = new THREE.Quaternion();

  constructor(private readonly preset: ContainerPreset, geometry: ContainerGeometry) {
    this.volume = new ContainedVolume(geometry.liquidHull(), geometry.dimensions.x);
    this.liquid = new THREE.Mesh(this.volume.body, new THREE.MeshPhysicalMaterial({
      color: "#168f9b", transparent: true, opacity: 0.62, roughness: 0.16,
      metalness: 0, clearcoat: 0.7, side: THREE.FrontSide, depthWrite: false
    }));
    this.liquid.name = "content-liquid";
    this.liquid.renderOrder = 1;
    const surfaceMaterial = new THREE.MeshPhysicalMaterial({
      color: "#268e9b", transparent: true, opacity: 0.88, roughness: 0.25,
      metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08,
      side: THREE.DoubleSide, depthWrite: false,
      normalMap: makeLiquidNormalTexture(), normalScale: new THREE.Vector2(0.035, 0.035)
    });
    surfaceMaterial.normalMap!.colorSpace = THREE.NoColorSpace;
    this.liquidSurface = new THREE.Mesh(this.volume.surface, surfaceMaterial);
    this.liquidSurface.name = "content-liquid-surface";
    this.liquidSurface.renderOrder = 2;
    this.group.add(this.liquid, this.liquidSurface);
    this.volume.update(preset.container.fill, new THREE.Vector3(0, 1, 0));
  }

  private plane(orientation: THREE.Quaternion, x: number, z: number, y = 0) {
    this.normal.set(0, 1, 0).applyQuaternion(this.inverse.copy(orientation).invert());
    // A plane also works sideways/inverted; no singular division by its Y component.
    this.normal.x -= THREE.MathUtils.clamp(x, -0.35, 0.35);
    this.normal.y -= THREE.MathUtils.clamp(y, -0.35, 0.35);
    this.normal.z -= THREE.MathUtils.clamp(z, -0.35, 0.35);
    return this.normal.normalize();
  }

  updatePreview(content: LocalContentState, elapsed: number, orientation: THREE.Quaternion) {
    this.draw(this.preset.container.fill, this.plane(orientation, content.surfaceOffsetX * 0.25, -content.surfaceOffsetY * 0.25));
    this.liquidSurface.material.normalScale.setScalar(0.025 + content.agitation * 0.07);
    this.liquidSurface.material.normalMap?.offset.set(elapsed * 0.015, elapsed * 0.011);
  }

  updateDevice(state: DeviceContentState, orientation: THREE.Quaternion) {
    this.draw(state.fill, this.plane(orientation,
      state.massX * 0.22 + state.velocityX * 0.025, 0,
      state.massY * 0.12 + state.velocityY * 0.025));
    this.liquidSurface.material.normalScale.setScalar(0.025 + (state.slosh ?? state.energy) * 0.07);
    this.liquidSurface.material.normalMap?.offset.set(state.massX * 0.05, state.massY * 0.05);
  }

  private draw(fill: number, normal: THREE.Vector3) {
    this.liquid.visible = this.liquidSurface.visible = fill > 0;
    this.volume.update(fill, normal);
    this.group.userData.volumeFraction = this.volume.volume / this.volume.capacity;
    this.group.userData.surfaceNormal = normal.toArray();
  }

  dispose() {
    disposeObjectTree(this.group);
    this.group.removeFromParent();
  }
}
