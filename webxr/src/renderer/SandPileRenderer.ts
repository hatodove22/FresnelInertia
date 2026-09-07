import * as THREE from "three";
import type { DeviceContentState } from "../visualState";
import { ContainerGeometry } from "./ContainerGeometry";
import { ContainedVolume, type SurfaceWaveField } from "./ContainedVolume";
import { SandSurfaceFlow } from "./SandSurfaceFlow";
import { SandSurfaceSampler } from "./SandSurfaceSampler";
import { disposeObjectTree } from "./disposeObjectTree";

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


/** Reported retained pile plus a thin presentation-only flowing skin. Bulk
 * slope/volume still come from the device; this does not produce haptic events. */
export class SandPileRenderer {
  readonly group = new THREE.Group();
  readonly sandVolume: ContainedVolume;
  private readonly sandBody: THREE.Mesh;
  private readonly sandSurface: THREE.Mesh;
  private readonly particles: THREE.InstancedMesh;
  private readonly particleCount = 1225;
  private readonly surfaceFlow = new SandSurfaceFlow(this.particleCount);
  private readonly sampler: SandSurfaceSampler;
  private readonly relief: SurfaceWaveField;
  private sampledRevision = -1;
  private readonly surfaceNormal = new THREE.Vector3();
  private readonly dummy = new THREE.Object3D();

  constructor(private readonly geometry: ContainerGeometry) {
    this.group.name = "content-sand-pile";
    this.group.visible = false;
    this.sandVolume = new ContainedVolume(geometry.liquidHull(), true);
    this.sampler = new SandSurfaceSampler(this.sandVolume.surface, this.sandVolume.size);
    this.relief = {
      revision: 0, maxDisplacement: 0,
      displacement: (u, v) => {
        // ContainedVolume supplies coordinates in its plane basis. Convert to
        // body x/z so the evolving relief and persistent grain lanes coincide.
        const volume = this.sandVolume, ny = volume.normal.y;
        const slope = -volume.normal.x / ny;
        const projectedWidth = ny * volume.size.x + Math.abs(volume.normal.x) * volume.size.y;
        const bodyU = (u * projectedWidth - slope * volume.offset) * ny / volume.size.x;
        return this.surfaceFlow.displacement(bodyU, v) * ny * ny;
      },
    };
    const grainSize = Math.min(...geometry.dimensions.toArray()) / 110;
    this.sandBody = new THREE.Mesh(this.sandVolume.body, makeSandMaterial("#bb924e", grainSize));
    this.sandSurface = new THREE.Mesh(this.sandVolume.surface, makeSandMaterial("#d9b568", grainSize));
    this.sandBody.name = "content-sand-body";
    this.sandSurface.name = "content-sand-surface";
    this.sandBody.receiveShadow = this.sandSurface.receiveShadow = true;
    this.sandBody.castShadow = this.sandSurface.castShadow = true;
    this.particles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: "#f1cf83", roughness: 0.96 }), this.particleCount);
    this.particles.name = "content-sand-grains";
    this.particles.renderOrder = 3;
    this.particles.castShadow = this.particles.receiveShadow = true;
    for (let i = 0; i < this.particleCount; i++) {
      const shade = this.hash01(i * 11.19 + 0.73);
      this.particles.setColorAt(i, new THREE.Color().setHSL(0.095 + shade * 0.025, 0.32 + shade * 0.2, 0.48 + shade * 0.22));
    }
    this.group.add(this.sandBody, this.sandSurface, this.particles);
  }

  private hash01(value: number) {
    const s = Math.sin(value * 127.1) * 43758.5453;
    return s - Math.floor(s);
  }

  update(state: DeviceContentState) {
    if (!this.sandVolume || !this.sandBody || !this.sandSurface || !this.particles) return;
    const visible = state.fill > 0;
    this.sandBody.visible = this.sandSurface.visible = this.particles.visible = visible;
    // New firmware supplies the retained plane. Old v3 gets a bounded visual
    // estimate, not another browser simulation or an assumption of new physics.
    const reportedSlope = state.pileSlope ?? state.massX * 1.6;
    const slope = Number.isFinite(reportedSlope) ? THREE.MathUtils.clamp(reportedSlope, -20, 20) : 0;
    const span = Math.min(this.geometry.dimensions.x, this.geometry.dimensions.y, this.geometry.dimensions.z);
    const flow = state.granularFlow ?? THREE.MathUtils.clamp(Math.hypot(state.velocityX, state.velocityY) * 0.2, 0, 1);
    this.surfaceFlow.update({ timeS: state.phaseS, fill: state.fill, slope, flow, velocityX: state.velocityX,
      widthM: this.sandVolume.size.x, depthM: this.sandVolume.size.z, heightM: this.sandVolume.size.y });
    this.relief.revision = this.surfaceFlow.revision;
    this.relief.maxDisplacement = this.surfaceFlow.maxDisplacement / (1 + slope * slope);
    this.sandVolume.update(state.fill, this.surfaceNormal.set(-slope, 1, 0), 0, 0, this.relief);
    this.sandBody.userData.centroid = this.sandVolume.centroid.toArray();
    if (this.sampledRevision !== this.sandVolume.revision) {
      this.sampler.rebuild();
      this.sampledRevision = this.sandVolume.revision;
    }
    const radius = span * 0.006;
    for (let i = 0; i < this.particleCount; i++) {
      const seed = i * 9.173 + 0.31;
      const grain = this.surfaceFlow.grains[i];
      const x = grain.u * this.sandVolume.size.x * 0.97;
      const z = grain.v * this.sandVolume.size.z * 0.97;
      const surfaceY = this.sampler.heightAt(x, z);
      const occupied = surfaceY !== undefined && surfaceY > this.sandVolume.lower.y + radius;
      // Embed a little of each grain in the actual corrected mesh. The bulk and
      // its moving skin cannot separate as the reported slope or relief changes.
      this.dummy.position.set(x, (surfaceY ?? this.sandVolume.lower.y) - radius * 0.1, z);
      const grainSize = occupied && visible && this.sandVolume.contains(this.dummy.position, radius * 1.3)
        ? radius * (0.65 + this.hash01(seed * 3.1) * 0.6) * grain.visibility : 0;
      this.dummy.scale.set(grainSize * 0.8, grainSize * 0.55, grainSize);
      this.dummy.rotation.set(seed, seed * 0.7, grain.rotation);
      this.dummy.updateMatrix();
      this.particles.setMatrixAt(i, this.dummy.matrix);
    }
    this.particles.instanceMatrix.needsUpdate = true;
    this.particles.computeBoundingSphere();
  }


  dispose() {
    disposeObjectTree(this.group);
    this.group.removeFromParent();
  }
}
