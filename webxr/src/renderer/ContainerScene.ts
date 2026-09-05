import * as THREE from "three";
import type { ContainerPreset, LocalContentState, TiltState, VisualContainerShape } from "../types";
import { makeLabelTexture, makeLiquidNormalTexture } from "./ProceduralAssets";
import { GripProxy } from "./GripProxy";

const wallMaterial = new THREE.MeshPhysicalMaterial({
  color: "#e8f8fb",
  transparent: true,
  opacity: 0.26,
  roughness: 0.12,
  metalness: 0.0,
  transmission: 0.52,
  thickness: 0.025,
  clearcoat: 0.85,
  clearcoatRoughness: 0.16,
  depthWrite: false
});

const edgeMaterial = new THREE.LineBasicMaterial({ color: "#e9fbff", transparent: true, opacity: 0.68 });
const liquidMaterial = new THREE.MeshStandardMaterial({
  color: "#24a9bd",
  transparent: true,
  opacity: 0.48,
  roughness: 0.08,
  metalness: 0.0,
  side: THREE.DoubleSide,
  depthWrite: false
});
const liquidSurfaceMaterial = new THREE.MeshPhysicalMaterial({
  color: "#51d2dd",
  transparent: true,
  opacity: 0.86,
  roughness: 0.05,
  metalness: 0.0,
  clearcoat: 1.0,
  clearcoatRoughness: 0.03,
  side: THREE.DoubleSide,
  depthWrite: false
});
const foamMaterial = new THREE.MeshStandardMaterial({
  color: "#edf8f7",
  roughness: 0.42,
  transparent: true,
  opacity: 0.34,
  depthWrite: false
});
const granularMaterial = new THREE.MeshStandardMaterial({ color: "#d8c071", roughness: 0.76 });
const hybridMaterial = new THREE.MeshStandardMaterial({ color: "#e5f0f3", roughness: 0.36, metalness: 0.04 });
const labelMaterial = new THREE.MeshStandardMaterial({ roughness: 0.58, metalness: 0.0 });
const capMaterial = new THREE.MeshStandardMaterial({ color: "#d7dde0", roughness: 0.38, metalness: 0.18 });
const plasticCupMaterial = new THREE.MeshPhysicalMaterial({
  color: "#eff8fb",
  transparent: true,
  opacity: 0.34,
  roughness: 0.28,
  metalness: 0.0,
  transmission: 0.32,
  thickness: 0.012,
  clearcoat: 0.55,
  clearcoatRoughness: 0.22,
  depthWrite: false
});

const boxVisualSizeM = 0.07;
const bottleBodyDiameterM = 0.07;
const bottleBodyHeightM = 0.086;
const bottleNeckHeightM = 0.024;
const bottleNeckRadiusM = 0.014;
const tumblerTopDiameterM = 0.07;
const tumblerBottomDiameterM = 0.052;
const tumblerHeightM = 0.07;
const tableTopY = 0.824;
export const containerRestY = tableTopY + boxVisualSizeM * 0.5;

/** Aggregate firmware state, not measured positions of individual visible grains. */
export interface DeviceContentState {
  massX: number;
  massY: number;
  velocityX: number;
  velocityY: number;
  energy: number;
  fill: number;
  slosh?: number;
}

export interface DeviceOrientation {
  /** atan2(bodyGravity.z, hypot(bodyGravity.x, bodyGravity.y)) */
  pitchRad: number;
  /** -atan2(bodyGravity.x, bodyGravity.y) */
  rollRad: number;
}

interface ParticleState {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  radius: number;
  seed: number;
  friction: number;
  rollingDrag: number;
  restThreshold: number;
}

export class ContainerScene {
  readonly group = new THREE.Group();
  readonly gripProxy = new GripProxy();

  private shell?: THREE.Mesh;
  private edges?: THREE.LineSegments;
  private liquid?: THREE.Mesh;
  private liquidSurface?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  private foam?: THREE.InstancedMesh;
  private particles?: THREE.InstancedMesh;
  private label?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private preset?: ContainerPreset;
  private particleCount = 0;
  private foamCount = 0;
  private particleStates: ParticleState[] = [];
  private dimensions = new THREE.Vector3(0.06, 0.06, 0.06);
  private dummy = new THREE.Object3D();
  private localGravity = new THREE.Vector3();
  private lastElapsed = 0;
  private liquidInset = 0.78;
  private shape: VisualContainerShape = "box";
  private resolvedDimensions = false;
  private deviceState?: DeviceContentState;
  private deviceOrientation?: DeviceOrientation;
  private liquidGeometryHeight = 1;
  private liquidRestPositions?: Float32Array;

  constructor() {
    this.group.name = "haptics-container";
    this.group.position.set(0, containerRestY, -0.72);
    this.gripProxy.setVisible(false);
    liquidSurfaceMaterial.normalMap = makeLiquidNormalTexture();
    liquidSurfaceMaterial.normalScale = new THREE.Vector2(0.18, 0.18);
  }

  setPreset(preset: ContainerPreset, useResolvedDimensions = false) {
    this.preset = preset;
    this.resolvedDimensions = useResolvedDimensions;
    // Firmware currently resolves a box; preview-only bottle/cup geometry must
    // not override the dimensions of the connected physical model.
    this.shape = useResolvedDimensions ? "box" : preset.visual_shape ?? "box";
    if (useResolvedDimensions) {
      const dimension = (value: number) => Number.isFinite(value) && value > 0 ? value : 0.06;
      this.dimensions.set(dimension(preset.container.span_x_m), dimension(preset.container.span_y_m), dimension(preset.container.span_z_m));
    } else if (this.shape === "cylinder_bottle") {
      this.dimensions.set(bottleBodyDiameterM, bottleBodyHeightM + bottleNeckHeightM, bottleBodyDiameterM);
    } else if (this.shape === "tumbler_cup") {
      this.dimensions.set(tumblerTopDiameterM, tumblerHeightM, tumblerTopDiameterM);
    } else {
      this.dimensions.set(boxVisualSizeM, boxVisualSizeM, boxVisualSizeM);
    }
    this.group.position.y = this.restY();
    this.rebuild();
  }

  /** null restores the independent, explicitly offline preview. Retain the last
   * state on stale telemetry to freeze contents without predicting their motion. */
  setDeviceState(state: DeviceContentState | null) {
    const wasConnected = this.deviceState !== undefined;
    const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
    this.deviceState = state ? {
      massX: THREE.MathUtils.clamp(finite(state.massX), -1, 1),
      massY: THREE.MathUtils.clamp(finite(state.massY), -1, 1),
      velocityX: finite(state.velocityX),
      velocityY: finite(state.velocityY),
      energy: THREE.MathUtils.clamp(finite(state.energy), 0, 1),
      fill: THREE.MathUtils.clamp(finite(state.fill), 0, 1),
      slosh: state.slosh === undefined ? undefined : THREE.MathUtils.clamp(finite(state.slosh), 0, 1)
    } : undefined;
    if (!state) this.deviceOrientation = undefined;
    if (wasConnected !== (this.deviceState !== undefined) && this.preset) this.rebuild();
  }

  /** Connected angles in radians, without preview scaling or time prediction. */
  setDeviceOrientation(orientation: DeviceOrientation | null) {
    if (!orientation) {
      this.deviceOrientation = undefined;
    } else if (Number.isFinite(orientation.pitchRad) && Number.isFinite(orientation.rollRad)) {
      this.deviceOrientation = { ...orientation };
    }
  }

  restY() {
    return tableTopY + this.dimensions.y * 0.5;
  }

  update(tilt: TiltState, content: LocalContentState, elapsed: number, dt: number) {
    this.lastElapsed = elapsed;
    this.gripProxy.pulse(elapsed);
    if (this.deviceState) {
      if (this.deviceOrientation) {
        this.group.rotation.set(this.deviceOrientation.pitchRad, 0, this.deviceOrientation.rollRad);
      }
      this.updateDeviceContent(this.deviceState);
      return;
    }
    this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, tilt.y * 0.62, 0.16);
    this.group.rotation.z = THREE.MathUtils.lerp(this.group.rotation.z, -tilt.x * 0.62, 0.16);

    if (this.liquid && this.preset) {
      const height = this.liquidHeight() * Math.max(0.04, this.preset.container.fill);
      const offsetLimitX = this.dimensions.x * (0.5 - this.liquidInset * 0.5) * 0.82;
      const offsetLimitZ = this.dimensions.z * (0.5 - this.liquidInset * 0.5) * 0.82;
      this.liquid.position.x = THREE.MathUtils.clamp(content.surfaceOffsetX * this.dimensions.x * 0.06, -offsetLimitX, offsetLimitX);
      this.liquid.position.z = THREE.MathUtils.clamp(-content.surfaceOffsetY * this.dimensions.z * 0.06, -offsetLimitZ, offsetLimitZ);
      this.clampLiquidOffset(this.liquid.position);
      this.liquid.position.y = this.liquidBottomY() + height * 0.5;
      this.liquid.rotation.set(0, 0, 0);
      this.liquid.scale.y = 1 + Math.sin(elapsed * 7.2) * content.agitation * 0.018;
    }

    if (this.liquidSurface && this.preset) {
      this.updateLiquidSurface(content, elapsed);
      this.updateFoam(content, elapsed);
    }

    if (this.particles && this.preset) {
      this.updateParticles(tilt, content, dt);
    }
  }

  private rebuild() {
    this.group.clear();
    this.gripProxy.setVisible(false);
    if (!this.preset) {
      return;
    }

    const geometry = this.makeShellGeometry();
    this.shell = new THREE.Mesh(geometry, this.shape === "tumbler_cup" ? plasticCupMaterial : wallMaterial);
    this.shell.renderOrder = 4;
    this.shell.castShadow = true;
    this.shell.receiveShadow = true;
    if (this.shape === "cylinder_bottle") {
      this.shell.position.y = -this.dimensions.y * 0.5 + bottleBodyHeightM * 0.5;
    }
    this.group.add(this.shell);

    this.edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
    this.edges.renderOrder = 5;
    this.edges.position.copy(this.shell.position);
    this.group.add(this.edges);
    if (this.shape === "cylinder_bottle") {
      this.buildBottleTop();
    } else if (this.shape === "tumbler_cup") {
      this.buildTumblerRim();
    }

    const labelTexture = makeLabelTexture(this.preset.preset, this.preset.family);
    labelTexture.repeat.set(1, 1);
    const label = labelMaterial.clone();
    label.map = labelTexture;
    label.needsUpdate = true;
    const labelWidth = this.isRoundContainer() ? this.dimensions.x * 0.54 : this.dimensions.x * 0.6;
    const labelHeight = this.shape === "cylinder_bottle" ? bottleBodyHeightM * 0.34 : this.dimensions.y * 0.34;
    this.label = new THREE.Mesh(new THREE.PlaneGeometry(labelWidth, labelHeight), label);
    this.label.name = "container-preview-label";
    this.label.visible = this.deviceState === undefined;
    this.label.renderOrder = 6;
    this.label.position.set(
      0,
      this.isRoundContainer() ? -this.dimensions.y * 0.14 : -this.dimensions.y * 0.03,
      this.dimensions.z * 0.506
    );
    this.group.add(this.label);

    if (this.preset.family === "Liquid" || this.preset.family === "Hybrid") {
      const fillHeight = Math.max(0.006, this.liquidHeight() * this.preset.container.fill);
      this.liquidGeometryHeight = fillHeight;
      const liquidGeometry = this.makeLiquidGeometry(fillHeight);
      this.liquidRestPositions = Float32Array.from(liquidGeometry.attributes.position.array);
      this.liquid = new THREE.Mesh(
        liquidGeometry,
        liquidMaterial
      );
      this.liquid.renderOrder = 1;
      this.liquid.name = "content-liquid";
      this.liquid.position.y = this.liquidBottomY() + fillHeight * 0.5;
      this.group.add(this.liquid);

      const surfaceGeometry =
        this.isRoundContainer()
          ? new THREE.CircleGeometry(this.liquidSurfaceRadius(fillHeight), 56)
          : new THREE.PlaneGeometry(this.dimensions.x * (this.liquidInset - 0.04), this.dimensions.z * (this.liquidInset - 0.04), 18, 18);
      this.liquidSurface = new THREE.Mesh(
        surfaceGeometry,
        liquidSurfaceMaterial
      );
      this.liquidSurface.renderOrder = 2;
      this.liquidSurface.name = "content-liquid-surface";
      this.liquidSurface.rotation.x = -Math.PI * 0.5;
      this.liquidSurface.position.y = this.liquidBottomY() + fillHeight + 0.0008;
      this.group.add(this.liquidSurface);

      this.foamCount = this.preset.family === "Hybrid" ? 9 : 16;
      this.foam = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), foamMaterial, this.foamCount);
      this.foam.renderOrder = 3;
      this.group.add(this.foam);
    } else {
      this.liquid = undefined;
      this.liquidRestPositions = undefined;
      this.liquidSurface = undefined;
      this.foam = undefined;
      this.foamCount = 0;
    }

    if (this.preset.family === "Granular" || this.preset.family === "Hybrid") {
      this.particleCount = this.resolvedDimensions
        ? this.isSingleMarble() ? 1 : Math.round(16 + THREE.MathUtils.clamp(this.preset.container.particle_count ?? 0.6, 0, 1) * 96)
        : this.preset.family === "Hybrid" ? 26 : 62;
      const particleGeometry =
        this.preset.family === "Hybrid" ? new THREE.IcosahedronGeometry(1, 0) : new THREE.SphereGeometry(1, 10, 8);
      this.particles = new THREE.InstancedMesh(
        particleGeometry,
        this.preset.family === "Hybrid" ? hybridMaterial : granularMaterial,
        this.particleCount
      );
      this.particles.renderOrder = 3;
      this.particles.name = "content-particles";
      this.particles.castShadow = true;
      this.particles.receiveShadow = true;
      this.particleStates = this.createParticleStates();
      this.group.add(this.particles);
    } else {
      this.particles = undefined;
      this.particleCount = 0;
      this.particleStates = [];
    }

    this.group.scale.setScalar(1.0);
    this.gripProxy.setSize(this.dimensions);
    this.group.add(this.gripProxy.group);
  }

  private makeShellGeometry() {
    if (this.shape === "cylinder_bottle") {
      return new THREE.CylinderGeometry(this.dimensions.x * 0.5, this.dimensions.x * 0.5, bottleBodyHeightM, 64, 1, true);
    }
    if (this.shape === "tumbler_cup") {
      return new THREE.CylinderGeometry(tumblerTopDiameterM * 0.5, tumblerBottomDiameterM * 0.5, tumblerHeightM, 64, 1, true);
    }
    return new THREE.BoxGeometry(this.dimensions.x, this.dimensions.y, this.dimensions.z);
  }

  private makeLiquidGeometry(fillHeight: number) {
    if (this.shape === "cylinder_bottle") {
      return new THREE.CylinderGeometry(
        this.dimensions.x * this.liquidInset * 0.5,
        this.dimensions.x * this.liquidInset * 0.5,
        fillHeight,
        56,
        1,
        false
      );
    }
    if (this.shape === "tumbler_cup") {
      return new THREE.CylinderGeometry(
        this.liquidSurfaceRadius(fillHeight),
        tumblerBottomDiameterM * this.liquidInset * 0.5,
        fillHeight,
        56,
        1,
        false
      );
    }
    return new THREE.BoxGeometry(this.dimensions.x * this.liquidInset, fillHeight, this.dimensions.z * this.liquidInset, 8, 2, 8);
  }

  private buildTumblerRim() {
    const rimY = this.dimensions.y * 0.5;
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(tumblerTopDiameterM * 0.5, 0.0022, 8, 72),
      plasticCupMaterial
    );
    rim.rotation.x = Math.PI * 0.5;
    rim.position.y = rimY;
    rim.renderOrder = 5;
    this.group.add(rim);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(tumblerBottomDiameterM * 0.42, tumblerBottomDiameterM * 0.46, 0.005, 48),
      plasticCupMaterial
    );
    base.position.y = -this.dimensions.y * 0.5 + 0.0025;
    base.renderOrder = 4;
    this.group.add(base);
  }

  private buildBottleTop() {
    const shoulderY = -this.dimensions.y * 0.5 + bottleBodyHeightM;
    const neckY = shoulderY + bottleNeckHeightM * 0.5;
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(bottleNeckRadiusM, bottleNeckRadiusM * 1.12, bottleNeckHeightM, 40, 1, true),
      wallMaterial
    );
    neck.position.y = neckY;
    neck.renderOrder = 4;
    this.group.add(neck);

    const neckEdges = new THREE.LineSegments(new THREE.EdgesGeometry(neck.geometry), edgeMaterial);
    neckEdges.position.copy(neck.position);
    neckEdges.renderOrder = 5;
    this.group.add(neckEdges);

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(bottleNeckRadiusM * 1.16, bottleNeckRadiusM * 1.16, 0.008, 40),
      capMaterial
    );
    cap.position.y = shoulderY + bottleNeckHeightM + 0.004;
    cap.castShadow = true;
    this.group.add(cap);

    const shoulder = new THREE.Mesh(
      new THREE.CylinderGeometry(bottleNeckRadiusM * 1.18, this.dimensions.x * 0.5, 0.014, 48, 1, true),
      wallMaterial
    );
    shoulder.position.y = shoulderY + 0.007;
    shoulder.renderOrder = 4;
    this.group.add(shoulder);
  }

  private liquidBottomY() {
    return -this.dimensions.y * 0.5;
  }

  private liquidHeight() {
    if (this.shape === "cylinder_bottle") {
      return bottleBodyHeightM;
    }
    if (this.shape === "tumbler_cup") {
      return tumblerHeightM;
    }
    return this.dimensions.y;
  }

  private isRoundContainer() {
    return this.shape === "cylinder_bottle" || this.shape === "tumbler_cup";
  }

  private liquidSurfaceRadius(fillHeight: number) {
    if (this.shape === "tumbler_cup") {
      const fillT = THREE.MathUtils.clamp(fillHeight / Math.max(tumblerHeightM, 0.001), 0, 1);
      return THREE.MathUtils.lerp(tumblerBottomDiameterM, tumblerTopDiameterM, fillT) * (this.liquidInset - 0.04) * 0.5;
    }
    return this.dimensions.x * (this.liquidInset - 0.04) * 0.5;
  }

  private clampLiquidOffset(position: THREE.Vector3) {
    if (!this.isRoundContainer()) {
      return;
    }
    const maxRadius = this.dimensions.x * (0.5 - this.liquidInset * 0.5) * 0.82;
    const radial = Math.hypot(position.x, position.z);
    if (radial > maxRadius && radial > 0.000001) {
      const scale = maxRadius / radial;
      position.x *= scale;
      position.z *= scale;
    }
  }

  private updateLiquidSurface(content: LocalContentState, elapsed: number) {
    if (!this.liquidSurface || !this.preset) {
      return;
    }
    const geometry = this.liquidSurface.geometry;
    const position = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i) / this.dimensions.x;
      const y = position.getY(i) / this.dimensions.z;
      const ripple =
        Math.sin(x * 18 + elapsed * 5.4) * content.wavePrimary * 0.0022 +
        Math.cos(y * 16 - elapsed * 4.6) * content.waveSecondary * 0.0017 +
        Math.sin((x + y) * 24 + elapsed * 8.2) * content.impactPulse * 0.0012;
      position.setZ(i, ripple);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();

    this.liquidSurface.position.x = content.surfaceOffsetX * this.dimensions.x * 0.18;
    this.liquidSurface.position.z = -content.surfaceOffsetY * this.dimensions.z * 0.18;
    this.clampLiquidOffset(this.liquidSurface.position);
    const surfaceHalfX = this.dimensions.x * (this.liquidInset - 0.04) * 0.5;
    const surfaceHalfZ = this.dimensions.z * (this.liquidInset - 0.04) * 0.5;
    const offsetLimitX = this.dimensions.x * 0.5 - surfaceHalfX - 0.002;
    const offsetLimitZ = this.dimensions.z * 0.5 - surfaceHalfZ - 0.002;
    if (!this.isRoundContainer()) {
      this.liquidSurface.position.x = THREE.MathUtils.clamp(this.liquidSurface.position.x, -offsetLimitX, offsetLimitX);
      this.liquidSurface.position.z = THREE.MathUtils.clamp(this.liquidSurface.position.z, -offsetLimitZ, offsetLimitZ);
    }
    const fillHeight = this.liquidHeight() * Math.max(0.04, this.preset.container.fill);
    const headroom = this.liquidHeight() - fillHeight;
    const maxTiltX = THREE.MathUtils.clamp((headroom * 0.42) / Math.max(surfaceHalfZ, 0.001), 0.08, 0.42);
    const maxTiltZ = THREE.MathUtils.clamp((headroom * 0.42) / Math.max(surfaceHalfX, 0.001), 0.08, 0.42);
    this.liquidSurface.rotation.x = -Math.PI * 0.5 + THREE.MathUtils.clamp(content.surfaceOffsetY * 0.34, -maxTiltX, maxTiltX);
    this.liquidSurface.rotation.y = THREE.MathUtils.clamp(content.surfaceOffsetX * 0.34, -maxTiltZ, maxTiltZ);
    if (this.liquidSurface.material.normalMap) {
      this.liquidSurface.material.normalMap.offset.set(elapsed * 0.025, elapsed * 0.018);
    }
  }

  private updateFoam(content: LocalContentState, elapsed: number) {
    if (!this.foam || !this.liquidSurface || !this.preset) {
      return;
    }
    const fillHeight = this.liquidHeight() * Math.max(0.04, this.preset.container.fill);
    for (let i = 0; i < this.foamCount; i += 1) {
      const seed = i * 17.31;
      const ring = i / Math.max(1, this.foamCount - 1);
      const angle = seed + elapsed * (0.16 + content.agitation * 0.42);
      const edgeBias = 0.18 + ring * 0.78;
      const x = Math.cos(angle) * this.dimensions.x * 0.38 * edgeBias + content.surfaceOffsetX * this.dimensions.x * 0.13;
      const z = Math.sin(angle * 0.84) * this.dimensions.z * 0.38 * edgeBias - content.surfaceOffsetY * this.dimensions.z * 0.13;
      const y = this.liquidBottomY() + fillHeight + 0.002 + Math.sin(elapsed * 2.8 + seed) * 0.0015;
      const visibility = THREE.MathUtils.smoothstep(content.agitation + content.impactPulse * 0.45, 0.12, 0.9);
      const radius = (0.00075 + (i % 4) * 0.00028) * visibility;
      this.dummy.position.set(x, y, z);
      this.dummy.scale.setScalar(radius);
      this.dummy.updateMatrix();
      this.foam.setMatrixAt(i, this.dummy.matrix);
    }
    this.foam.instanceMatrix.needsUpdate = true;
  }

  private createParticleStates(): ParticleState[] {
    const states: ParticleState[] = [];
    const radiusBase = this.preset?.family === "Hybrid" ? 0.005 : 0.0036;
    for (let i = 0; i < this.particleCount; i += 1) {
      const seed = i * 9.173 + 0.31;
      const radius = radiusBase * (this.preset?.family === "Hybrid" && i % 4 === 0 ? 1.75 : 1.0);
      const fillHeight = this.liquidHeight() * Math.max(0.04, this.preset?.container.fill ?? 0.5);
      const liquidTopY = this.liquidBottomY() + fillHeight;
      states.push({
        pos: new THREE.Vector3(
          Math.sin(seed * 1.7) * this.dimensions.x * 0.22,
          this.preset?.family === "Hybrid"
            ? liquidTopY - radius * THREE.MathUtils.lerp(0.18, 0.52, this.hash01(seed * 8.19))
            : -this.dimensions.y * 0.42 + radius * 1.8 + (i % 5) * radius * 0.28,
          Math.cos(seed * 1.3) * this.dimensions.z * 0.22
        ),
        vel: new THREE.Vector3(0, 0, 0),
        radius,
        seed,
        friction: THREE.MathUtils.lerp(0.72, 1.22, this.hash01(seed * 2.17)),
        rollingDrag: THREE.MathUtils.lerp(0.86, 0.985, this.hash01(seed * 4.31)),
        restThreshold: THREE.MathUtils.lerp(0.0012, 0.0042, this.hash01(seed * 6.77))
      });
    }
    return states;
  }

  private updateParticles(tilt: TiltState, content: LocalContentState, dt: number) {
    if (!this.particles || !this.preset) {
      return;
    }
    const hardness = this.preset.container.particle_hardness ?? 0.45;
    const baseDamping = THREE.MathUtils.lerp(0.78, 0.95, hardness);
    this.localGravity.set(0, -1, 0).applyQuaternion(this.group.quaternion.clone().invert());
    const gravityX = this.localGravity.x * 0.42 + content.surfaceOffsetX * 0.08;
    const gravityZ = this.localGravity.z * 0.42 - content.surfaceOffsetY * 0.08;
    const liquidLimitX = this.dimensions.x * this.liquidInset * 0.5;
    const liquidLimitZ = this.dimensions.z * this.liquidInset * 0.5;
    const limitX = this.preset.family === "Hybrid" ? liquidLimitX : this.dimensions.x * 0.5;
    const limitY = this.dimensions.y * 0.5;
    const limitZ = this.preset.family === "Hybrid" ? liquidLimitZ : this.dimensions.z * 0.5;
    const fillHeight = this.liquidHeight() * Math.max(0.04, this.preset.container.fill);
    const liquidTopY = this.liquidBottomY() + fillHeight;

    for (let i = 0; i < this.particleStates.length; i += 1) {
      const particle = this.particleStates[i];
      const jitterPhase = this.lastElapsed * (1.3 + particle.seed * 0.017);
      const microJitter = content.agitation * 0.0025 + content.impactPulse * 0.006;
      particle.vel.x += gravityX * particle.friction * dt;
      particle.vel.z += gravityZ * particle.friction * dt;
      if (this.preset.family === "Hybrid") {
        const floatDepth = particle.radius * THREE.MathUtils.lerp(0.2, 0.56, this.hash01(particle.seed * 8.19));
        const targetY =
          liquidTopY -
          floatDepth +
          Math.sin(this.lastElapsed * (1.1 + this.hash01(particle.seed * 3.7) * 0.7) + particle.seed) *
            particle.radius *
            (0.16 + content.agitation * 0.38);
        particle.vel.y += (targetY - particle.pos.y) * 16.0 * dt;
        particle.vel.y *= Math.pow(0.90, dt * 60);
      } else {
        particle.vel.y -= 0.09 * dt;
      }
      particle.vel.x += (Math.sin(jitterPhase + particle.seed) * microJitter + Math.sin(this.lastElapsed * 12.7 + particle.seed) * content.impactPulse * 0.012) * dt;
      particle.vel.z += (Math.cos(jitterPhase * 1.19 + particle.seed) * microJitter + Math.cos(this.lastElapsed * 10.1 + particle.seed) * content.impactPulse * 0.012) * dt;
      particle.pos.addScaledVector(particle.vel, dt);

      const maxX = limitX - particle.radius * 1.35;
      const maxZ = limitZ - particle.radius * 1.35;
      if (particle.pos.x > maxX) {
        particle.pos.x = maxX;
        particle.vel.x *= -hardness * 0.72;
      } else if (particle.pos.x < -maxX) {
        particle.pos.x = -maxX;
        particle.vel.x *= -hardness * 0.72;
      }
      if (particle.pos.z > maxZ) {
        particle.pos.z = maxZ;
        particle.vel.z *= -hardness * 0.72;
      } else if (particle.pos.z < -maxZ) {
        particle.pos.z = -maxZ;
        particle.vel.z *= -hardness * 0.72;
      }
      const floorY = -limitY + particle.radius * 1.7;
      const ceilingY =
        this.preset.family === "Hybrid"
          ? Math.min(limitY - particle.radius * 1.5, liquidTopY + particle.radius * 0.55)
          : limitY - particle.radius * 1.5;
      if (particle.pos.y < floorY) {
        particle.pos.y = floorY;
        particle.vel.y = Math.abs(particle.vel.y) * hardness * 0.34 + content.impactPulse * 0.015;
      } else if (particle.pos.y > ceilingY) {
        particle.pos.y = ceilingY;
        particle.vel.y *= -hardness * 0.3;
      }
      const horizontalSpeed = Math.hypot(particle.vel.x, particle.vel.z);
      if (horizontalSpeed < particle.restThreshold && content.agitation < 0.08) {
        particle.vel.x *= 0.35;
        particle.vel.z *= 0.35;
      }
      const individualDamping = baseDamping * particle.rollingDrag;
      particle.vel.x *= Math.pow(individualDamping, dt * 60);
      particle.vel.z *= Math.pow(individualDamping, dt * 60);
      particle.vel.y *= Math.pow(baseDamping, dt * 60);

      const visualScale = particle.radius * (1 + Math.sin(this.lastElapsed * 2.1 + particle.seed) * 0.04);
      this.dummy.position.copy(particle.pos);
      this.dummy.scale.setScalar(visualScale);
      this.dummy.rotation.set(
        particle.pos.z * 80 + this.lastElapsed * 0.6,
        particle.seed,
        particle.pos.x * 80 - this.lastElapsed * 0.4
      );
      this.dummy.updateMatrix();
      this.particles.setMatrixAt(i, this.dummy.matrix);
    }
    this.particles.instanceMatrix.needsUpdate = true;
  }

  private hash01(value: number) {
    const s = Math.sin(value * 127.1) * 43758.5453;
    return s - Math.floor(s);
  }

  private isSingleMarble() {
    return this.resolvedDimensions && this.preset !== undefined &&
      (/marble/i.test(this.preset.preset) ||
        ((this.preset.container.particle_count ?? 1) <= 0.1 &&
         (this.preset.container.particle_hardness ?? 0) >= 0.8));
  }

  private updateDeviceContent(state: DeviceContentState) {
    const visible = state.fill > 0;
    if (this.particles) {
      this.particles.visible = visible;
      const single = this.isSingleMarble();
      const smallestSpan = Math.min(this.dimensions.x, this.dimensions.y, this.dimensions.z);
      const radius = smallestSpan * (single ? 0.085 : this.preset?.family === "Hybrid" ? 0.047 : 0.025);
      // Firmware x/y map to THREE x/y (not the preview's x/z floor plane).
      // +/-1 is rendered at the visible particle's wall-contact position.
      const cx = state.massX * Math.max(0, this.dimensions.x * 0.5 - radius);
      const cy = state.massY * Math.max(0, this.dimensions.y * 0.5 - radius);
      const spread = single ? 0 : 0.12 + state.fill * 0.22 + state.energy * 0.06;
      const sx = Math.max(0, Math.min(this.dimensions.x * spread, this.dimensions.x * 0.5 - radius - Math.abs(cx)));
      const sy = Math.max(0, Math.min(this.dimensions.y * spread, this.dimensions.y * 0.5 - radius - Math.abs(cy)));
      const sz = Math.max(0, Math.min(this.dimensions.z * spread, this.dimensions.z * 0.5 - radius));
      for (let i = 0; i < this.particleCount; i += 1) {
        // Symmetric pairs keep the illustrative cloud centroid exactly on the
        // reported mass. No grain integration, clock, random walk or prediction.
        const unpaired = this.particleCount % 2 === 1 && i === this.particleCount - 1;
        const seed = Math.floor(i / 2) * 9.173 + 0.31;
        const sign = unpaired ? 0 : i % 2 === 0 ? 1 : -1;
        this.dummy.position.set(
          cx + sign * Math.sin(seed * 1.7) * sx,
          cy + sign * Math.cos(seed * 2.3) * sy,
          sign * Math.sin(seed * 1.3) * sz
        );
        this.dummy.scale.setScalar(radius);
        this.dummy.rotation.set(0, seed, Math.atan2(state.velocityY, state.velocityX));
        this.dummy.updateMatrix();
        this.particles.setMatrixAt(i, this.dummy.matrix);
      }
      this.particles.instanceMatrix.needsUpdate = true;
    }
    if (this.foam) this.foam.visible = false;
    if (!this.liquid || !this.liquidSurface) return;
    this.liquid.visible = visible;
    this.liquidSurface.visible = visible;
    const height = this.dimensions.y * Math.max(0.001, state.fill);
    const freeX = this.dimensions.x * (1 - this.liquidInset) * 0.5;
    const freeY = Math.max(0, (this.dimensions.y - height) * 0.5);
    const cx = state.massX * freeX;
    const cy = state.massY * freeY;
    const topY = cy + height * 0.5;
    const headroom = Math.max(0, this.dimensions.y * 0.5 - topY);
    const deformation = Math.min(height * 0.18, headroom * 0.8);
    const halfX = this.dimensions.x * this.liquidInset * 0.5;
    const slope = THREE.MathUtils.clamp(state.massX * 0.22 + state.velocityX * 0.025, -1, 1) * deformation * 0.5;
    const activity = state.slosh ?? state.energy;
    const ripple = deformation * 0.5 * activity;
    const displacement = (x: number, z: number) =>
      slope * x / Math.max(halfX, 0.001) + ripple * 0.5 *
        (Math.sin(x / this.dimensions.x * 18 + state.massX * 3) +
         Math.cos(z / this.dimensions.z * 16 + state.massY * 3 + state.velocityY * 0.1));

    this.liquid.position.set(cx, cy, 0);
    this.liquid.rotation.set(0, 0, 0);
    this.liquid.scale.set(1, height / this.liquidGeometryHeight, 1);
    if (this.liquidRestPositions) {
      const position = this.liquid.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < position.count; i += 1) {
        const x = this.liquidRestPositions[i * 3];
        const y = this.liquidRestPositions[i * 3 + 1];
        const z = this.liquidRestPositions[i * 3 + 2];
        const topWeight = THREE.MathUtils.clamp(y / this.liquidGeometryHeight + 0.5, 0, 1);
        position.setXYZ(i, x, y + displacement(x, z) * topWeight / this.liquid.scale.y, z);
      }
      position.needsUpdate = true;
      this.liquid.geometry.computeVertexNormals();
    }
    this.liquidSurface.position.set(cx, topY, 0);
    this.liquidSurface.rotation.set(-Math.PI * 0.5, 0, 0);
    const surface = this.liquidSurface.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < surface.count; i += 1) {
      surface.setZ(i, displacement(surface.getX(i), -surface.getY(i)));
    }
    surface.needsUpdate = true;
    this.liquidSurface.geometry.computeVertexNormals();
    // Texture phase is also state-derived, so stale telemetry freezes the view.
    this.liquidSurface.material.normalMap?.offset.set(state.massX * 0.05, state.massY * 0.05);
  }
}
