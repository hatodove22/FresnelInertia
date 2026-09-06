import * as THREE from "three";
import type { ContainerPreset, LocalContentState, TiltState, VisualContainerShape } from "../types";
import { makeLabelTexture, makeLiquidNormalTexture } from "./ProceduralAssets";
import { GripProxy } from "./GripProxy";
import { ContainedVolume } from "./ContainedVolume";
import { LiquidContactLine } from "./LiquidContactLine";
import { SodaJet } from "./SodaJet";
import { LiquidCaustics } from "./LiquidCaustics";
import { LiquidSlosh } from "./LiquidSlosh";

/** Object-locked grain on every face; vertex colors alias into broad diagonal
 * bands on the clipped box's sparse wall triangles. No time-driven shimmer. */
function makeSandMaterial(color: string, grainSize: number) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.97, side: THREE.DoubleSide });
  material.onBeforeCompile = shader => {
    shader.uniforms.sandGrainSize = { value: grainSize };
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vSandPosition;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSandPosition = position;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 vSandPosition;
      uniform float sandGrainSize;
      float sandHash(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float sandNoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(sandHash(i), sandHash(i + vec3(1,0,0)), f.x),
                       mix(sandHash(i + vec3(0,1,0)), sandHash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(sandHash(i + vec3(0,0,1)), sandHash(i + vec3(1,0,1)), f.x),
                       mix(sandHash(i + vec3(0,1,1)), sandHash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        vec3 grainPosition = vSandPosition / sandGrainSize;
        float detail = 1.0 - smoothstep(0.7, 1.8, max(length(dFdx(grainPosition)), length(dFdy(grainPosition))));
        float grain = (sandNoise(grainPosition) - 0.5) * detail;
        float mottling = sandNoise(grainPosition * 0.071 + vec3(7.1, 2.7, 4.9)) - 0.5;
        diffuseColor.rgb *= 1.0 + grain * 0.55 + mottling * 0.10;
      `);
  };
  material.customProgramCacheKey = () => "contained-sand-grain-v1";
  return material;
}

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
  /** Retained granular free-surface gradient dy/dx from the shared mass model. */
  pileSlope?: number;
  granularFlow?: number;
  /** Model time, never substituted with the rendering clock for device state. */
  phaseS?: number;
  pressure?: {
    charge: number;
    phase: "sealed" | "burst" | "spent";
    phaseS: number;
    remaining: number;
    burstSequence: number;
  };
}

export interface DeviceOrientation {
  /** -atan2(bodyGravity.z, hypot(bodyGravity.x, bodyGravity.y)) */
  pitchRad: number;
  /** atan2(bodyGravity.x, bodyGravity.y) */
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
  private liquidVolume?: ContainedVolume;
  private sandVolume?: ContainedVolume;
  private sandBody?: THREE.Mesh;
  private sandSurface?: THREE.Mesh;
  private sodaBubbles?: THREE.InstancedMesh;
  private sodaSpray?: THREE.InstancedMesh;
  private sodaJet?: SodaJet;
  private liquidContact?: LiquidContactLine;
  private liquidCaustics?: LiquidCaustics;
  private liquidSlosh?: LiquidSlosh;
  private readonly surfaceNormal = new THREE.Vector3();

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
      slosh: state.slosh === undefined ? undefined : THREE.MathUtils.clamp(finite(state.slosh), 0, 1),
      pileSlope: state.pileSlope === undefined ? undefined : THREE.MathUtils.clamp(finite(state.pileSlope), -8, 8),
      granularFlow: state.granularFlow === undefined ? undefined : THREE.MathUtils.clamp(finite(state.granularFlow), 0, 1),
      phaseS: state.phaseS === undefined ? undefined : finite(state.phaseS),
      pressure: state.pressure ? {
        charge: THREE.MathUtils.clamp(finite(state.pressure.charge), 0, 1),
        phase: state.pressure.phase,
        phaseS: Math.max(0, finite(state.pressure.phaseS)),
        remaining: THREE.MathUtils.clamp(finite(state.pressure.remaining), 0, 1),
        burstSequence: finite(state.pressure.burstSequence)
      } : undefined
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

    if ((this.liquidVolume || this.sandVolume) && this.preset) {
      // The retained offline preview uses the same geometry with its explicitly
      // local visual input. Connected/production-Wasm state takes the path above.
      this.updateDeviceContent({
        massX: content.surfaceOffsetX, massY: -1 + this.preset.container.fill,
        velocityX: content.surfaceVelocityX, velocityY: content.surfaceVelocityY,
        energy: content.agitation, slosh: content.agitation,
        fill: this.preset.container.fill, phaseS: elapsed,
        granularFlow: content.agitation
      });
      return;
    }

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
    this.sodaJet?.group.removeFromParent();
    this.sodaJet?.dispose();
    this.liquidContact?.dispose();
    this.liquidCaustics?.dispose();
    this.sodaJet = undefined;
    this.liquidContact = undefined;
    this.liquidCaustics = undefined;
    this.liquidSlosh = undefined;
    // Preset comparisons replace these meshes often. Release per-instance
    // optics/buffers, but keep the grip and shared baseline materials alive.
    const shared = new Set<THREE.Material>([wallMaterial, plasticCupMaterial, edgeMaterial,
      liquidMaterial, liquidSurfaceMaterial, foamMaterial, granularMaterial,
      hybridMaterial, labelMaterial, capMaterial]);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.gripProxy.group.removeFromParent();
    this.group.traverse(object => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return;
      if (object instanceof THREE.InstancedMesh) object.dispose();
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!shared.has(material)) materials.add(material);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.map?.dispose();
        if (material.normalMap !== liquidSurfaceMaterial.normalMap) material.normalMap?.dispose();
      }
      material.dispose();
    }
    this.liquidVolume = undefined;
    this.sandVolume = undefined;
    this.sandBody = undefined;
    this.sandSurface = undefined;
    this.sodaBubbles = undefined;
    this.sodaSpray = undefined;
    this.group.clear();
    this.gripProxy.setVisible(false);
    if (!this.preset) {
      return;
    }

    const geometry = this.makeShellGeometry();
    this.shell = new THREE.Mesh(geometry, this.shape === "tumbler_cup" ? plasticCupMaterial : wallMaterial);
    if (this.shape === "box" && (this.preset.family === "Liquid" || this.preset.family === "Hybrid")) {
      // A thin transparent vessel, not another nested screen-space refraction
      // layer masking the liquid. Retain the accepted marble/sand shell.
      this.shell.material = wallMaterial.clone();
      const vessel = this.shell.material as THREE.MeshPhysicalMaterial;
      vessel.opacity = 0.075;
      vessel.transmission = 0;
      vessel.roughness = 0.08;
      vessel.envMapIntensity = 0.5;
    }
    this.shell.renderOrder = 4;
    this.shell.castShadow = true;
    this.shell.receiveShadow = true;
    if (this.shape === "cylinder_bottle") {
      this.shell.position.y = -this.dimensions.y * 0.5 + bottleBodyHeightM * 0.5;
    }
    this.group.add(this.shell);

    this.edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
    if (this.shape === "box" && (this.preset.family === "Liquid" || this.preset.family === "Hybrid")) {
      this.edges.material = edgeMaterial.clone();
      this.edges.material.opacity = 0.42;
    }
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
      if (this.shape === "box") {
        this.liquid.geometry.dispose();
        this.liquidSurface.geometry.dispose();
        this.liquidVolume = new ContainedVolume(this.dimensions.clone());
        this.liquid.geometry = this.liquidVolume.body;
        this.liquidSurface.geometry = this.liquidVolume.surface;
        this.liquid.material = new THREE.MeshPhysicalMaterial({
          color: "#c7f3f0", roughness: 0.075, metalness: 0,
          opacity: 1, transmission: 0.94, ior: 1.333,
          attenuationColor: "#3299a5", attenuationDistance: this.dimensions.z * 1.4,
          thickness: this.dimensions.z, envMapIntensity: 0.85,
          side: THREE.FrontSide, depthWrite: false
        });
        this.liquidSurface.material = liquidSurfaceMaterial.clone();
        this.liquidSurface.material.normalMap = liquidSurfaceMaterial.normalMap?.clone() ?? null;
        Object.assign(this.liquidSurface.material, {
          transparent: false, opacity: 1, transmission: 0.92, ior: 1.333,
          roughness: 0.07, thickness: this.dimensions.y * this.preset.container.fill,
          attenuationDistance: this.dimensions.y * 2, envMapIntensity: 1.1,
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
        this.sodaJet = new SodaJet(this.dimensions);
        this.liquidContact = new LiquidContactLine(this.dimensions);
        this.group.add(this.sodaJet.group, this.liquidContact.group);
        this.liquidCaustics = new LiquidCaustics(this.dimensions);
        this.group.add(this.liquidCaustics.mesh);
        this.liquidSlosh = new LiquidSlosh(this.dimensions);
      }
    } else {
      this.liquid = undefined;
      this.liquidRestPositions = undefined;
      this.liquidSurface = undefined;
      this.foam = undefined;
      this.foamCount = 0;
    }

    if (this.preset.family === "Granular" || this.preset.family === "Hybrid") {
      const sand = this.isSandPile();
      this.particleCount = this.resolvedDimensions
        ? this.isSingleMarble() ? 1 : Math.round(16 + THREE.MathUtils.clamp(this.preset.container.particle_count ?? 0.6, 0, 1) * 96)
        : this.preset.family === "Hybrid" ? 26 : 62;
      if (sand) this.particleCount = 625;
      const particleGeometry =
        this.preset.family === "Hybrid" || sand ? new THREE.IcosahedronGeometry(1, 0) : new THREE.SphereGeometry(1, 10, 8);
      this.particles = new THREE.InstancedMesh(
        particleGeometry,
        this.preset.family === "Hybrid" ? hybridMaterial : sand ? new THREE.MeshStandardMaterial({ color: "#f1cf83", roughness: 0.96 }) : granularMaterial,
        this.particleCount
      );
      this.particles.renderOrder = 3;
      this.particles.name = "content-particles";
      this.particles.castShadow = true;
      this.particles.receiveShadow = true;
      this.particleStates = this.createParticleStates();
      this.group.add(this.particles);
      if (sand) {
        this.sandVolume = new ContainedVolume(this.dimensions.clone(), true);
        const grainSize = Math.min(this.dimensions.x, this.dimensions.y, this.dimensions.z) / 110;
        this.sandBody = new THREE.Mesh(this.sandVolume.body, makeSandMaterial("#bb924e", grainSize));
        this.sandSurface = new THREE.Mesh(this.sandVolume.surface, makeSandMaterial("#d9b568", grainSize));
        this.sandBody.name = "content-sand-body";
        this.sandSurface.name = "content-sand-surface";
        this.sandBody.receiveShadow = this.sandSurface.receiveShadow = true;
        this.sandBody.castShadow = this.sandSurface.castShadow = true;
        this.group.add(this.sandBody, this.sandSurface);
        for (let i = 0; i < this.particleCount; i++) {
          const shade = this.hash01(i * 11.19 + 0.73);
          this.particles.setColorAt(i, new THREE.Color().setHSL(0.095 + shade * 0.025, 0.32 + shade * 0.2, 0.48 + shade * 0.22));
        }
      }
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

  private isSandPile() {
    return this.preset?.family === "Granular" && !this.isSingleMarble() &&
      (this.deviceState?.pileSlope !== undefined ||
       ((this.preset.container.particle_count ?? 0) >= 0.5 && (this.preset.container.particle_hardness ?? 1) < 0.8));
  }

  private updateDeviceContent(state: DeviceContentState) {
    const visible = state.fill > 0;
    if (this.particles && !this.sandVolume) {
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
    if (this.sandVolume) this.updateSandPile(state);
    if (this.foam) this.foam.visible = false;
    if (!this.liquid || !this.liquidSurface) return;
    if (this.liquidVolume) {
      this.updateContainedLiquid(state);
      return;
    }
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

  private updateSandPile(state: DeviceContentState) {
    if (!this.sandVolume || !this.sandBody || !this.sandSurface || !this.particles) return;
    const visible = state.fill > 0;
    this.sandBody.visible = this.sandSurface.visible = this.particles.visible = visible;
    // New firmware supplies the retained plane. Old v3 gets a bounded visual
    // estimate, not another browser simulation or an assumption of new physics.
    const slope = state.pileSlope ?? THREE.MathUtils.clamp(state.massX * 1.6, -1.2, 1.2);
    const span = Math.min(this.dimensions.x, this.dimensions.y, this.dimensions.z);
    this.sandVolume.update(state.fill, this.surfaceNormal.set(-slope, 1, 0), span * 0.004);
    this.sandBody.userData.centroid = this.sandVolume.centroid.toArray();
    const flow = state.granularFlow ?? THREE.MathUtils.clamp(Math.hypot(state.velocityX, state.velocityY) * 0.2, 0, 1);
    const phase = state.phaseS ?? state.massX * 3 + state.massY;
    const radius = span * 0.0075;
    const width = 25;
    for (let i = 0; i < this.particleCount; i++) {
      const seed = i * 9.173 + 0.31;
      const u = (i % width + 0.15 + 0.7 * this.hash01(seed)) / width;
      const v = (Math.floor(i / width) + 0.15 + 0.7 * this.hash01(seed * 2.3)) / width;
      // Only a minority of surface grains move during actual flow. Their phase
      // is supplied by the shared model, so resting/stale slopes remain fixed.
      const moving = this.hash01(seed * 5.7) < 0.28 ? flow : 0;
      const travel = Math.sin(phase * 7 + seed) * moving * this.dimensions.x * 0.025;
      const x = THREE.MathUtils.clamp((u - 0.5) * this.dimensions.x * 0.97 + travel, -this.dimensions.x / 2 + radius, this.dimensions.x / 2 - radius);
      const z = (v - 0.5) * this.dimensions.z * 0.97;
      const surfaceY = this.sandVolume.heightAt(x, z);
      const occupied = surfaceY > -this.dimensions.y / 2 + radius;
      this.dummy.position.set(x, Math.min(this.dimensions.y / 2 - radius, surfaceY + radius * 0.3), z);
      const grainSize = occupied && visible ? radius * (0.65 + this.hash01(seed * 3.1) * 0.6) : 0;
      this.dummy.scale.set(grainSize * 0.8, grainSize * 0.55, grainSize);
      this.dummy.rotation.set(seed, seed * 0.7, seed * 1.3 + moving * Math.sin(phase * 7 + seed));
      this.dummy.updateMatrix();
      this.particles.setMatrixAt(i, this.dummy.matrix);
    }
    this.particles.instanceMatrix.needsUpdate = true;
    this.particles.computeBoundingSphere();
  }

  private updateContainedLiquid(state: DeviceContentState) {
    if (!this.liquidVolume || !this.liquid || !this.liquidSurface) return;
    const pressure = state.pressure;
    const fill = state.fill * (pressure?.remaining ?? 1);
    const activity = state.slosh ?? state.energy;
    const phase = state.phaseS ?? state.massX * 3 + state.massY * 2 + state.velocityY * 0.1;
    this.surfaceNormal.set(0, 1, 0).applyQuaternion(this.group.quaternion.clone().invert());
    // A free surface is level in world space at rest. State-driven dynamic
    // disturbance remains in the device's actual modeled x/y cross-section.
    this.surfaceNormal.x -= THREE.MathUtils.clamp(state.massX * 0.16 + state.velocityX * 0.025, -0.3, 0.3) * activity;
    const span = Math.min(this.dimensions.x, this.dimensions.y, this.dimensions.z);
    // Decorative water modes can be richer than the reduced haptic model. They
    // consume the source clock/pose but never feed back into content or outputs.
    // Missing sample times retain the old stateless path instead of inventing a
    // live clock for legacy input. Repeated samples freeze all visual dynamics.
    const visual = state.phaseS === undefined ? undefined : this.liquidSlosh?.update({
      timeS: state.phaseS, normal: this.surfaceNormal,
      massX: state.massX, massY: state.massY, velocityX: state.velocityX, velocityY: state.velocityY,
      activity, fill, viscosity: this.preset?.container.viscosity ?? 0.3
    });
    const visualActivity = visual?.activity ?? activity;
    this.liquidVolume.update(fill, visual?.normal ?? this.surfaceNormal,
      visual ? 0 : span * 0.024 * activity, visual ? 0 : phase, visual);
    this.liquid.visible = this.liquidSurface.visible = fill > 0;
    this.liquid.position.set(0, 0, 0);
    this.liquid.scale.set(1, 1, 1);
    this.liquid.rotation.set(0, 0, 0);
    this.liquidSurface.position.set(0, 0, 0);
    this.liquidSurface.rotation.set(0, 0, 0);
    this.liquidSurface.scale.set(1, 1, 1);
    this.liquid.userData.centroid = this.liquidVolume.centroid.toArray();
    this.liquid.userData.fillVolume = this.liquidVolume.volume;
    this.liquidSurface.userData.visualDynamics = !!visual;
    this.liquidSurface.userData.visualActivity = visualActivity;
    this.liquidSurface.userData.visualNormal = this.liquidVolume.normal.toArray();
    this.liquidSurface.material.thickness = this.dimensions.y * fill;
    this.liquidSurface.material.normalScale.setScalar(0.018 + visualActivity * 0.19);
    const flowX = visual?.flow.x ?? state.massX * 0.035;
    const flowZ = visual?.flow.y ?? state.massY * 0.02;
    this.liquidSurface.material.normalMap?.offset.set(flowX, flowZ);
    this.liquidContact?.update(this.liquidVolume, fill, pressure ? pressure.charge * 0.7 : 0);
    this.liquidCaustics?.update(fill, visualActivity, flowX * 18 + flowZ * 13, this.liquidVolume);
    this.sodaJet?.update(pressure);
    this.updateCarbonation(state);
  }

  private updateCarbonation(state: DeviceContentState) {
    if (!this.sodaBubbles || !this.sodaSpray || !this.liquidVolume) return;
    const pressure = state.pressure;
    this.sodaBubbles.visible = !!pressure && state.fill * pressure.remaining > 0 && pressure.phase !== "spent";
    this.sodaSpray.visible = pressure?.phase === "burst" && pressure.phaseS < 2.3;
    if (!pressure) return;
    const span = Math.min(this.dimensions.x, this.dimensions.y, this.dimensions.z);
    const phase = pressure.phaseS;
    for (let i = 0; i < this.sodaBubbles.count; i++) {
      const seed = i * 13.73 + pressure.burstSequence * 0.47;
      const x = (this.hash01(seed + 1.1) - 0.5) * this.dimensions.x * 0.88;
      const z = (this.hash01(seed + 4.9) - 0.5) * this.dimensions.z * 0.88;
      const ceiling = this.liquidVolume.heightAt(x, z);
      const height = Math.max(0, ceiling + this.dimensions.y / 2);
      const rise = (this.hash01(seed + 9.3) + phase * (0.16 + pressure.charge * 0.28)) % 1;
      const radius = span * (0.0035 + pressure.charge * 0.006) * (0.7 + this.hash01(seed * 2.1) * 0.6);
      this.dummy.position.set(x, -this.dimensions.y / 2 + rise * height, z);
      const inside = this.liquidVolume.normal.dot(this.dummy.position) < this.liquidVolume.offset - radius && height > radius * 2;
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
        this.dimensions.y / 2 + span * 2.6 * age - span * 3.1 * age * age,
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
}
