import * as THREE from "three";
import type { DeviceContentState } from "../visualState";
import { ContainerGeometry } from "./ContainerGeometry";
import { ContainedVolume } from "./ContainedVolume";
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


/** Retained accumulation surface plus source-phased grain detail. No browser
 * avalanche/particle integration is invented for accepted production state. */
export class SandPileRenderer {
  readonly group = new THREE.Group();
  readonly sandVolume: ContainedVolume;
  private readonly sandBody: THREE.Mesh;
  private readonly sandSurface: THREE.Mesh;
  private readonly particles: THREE.InstancedMesh;
  private readonly particleCount = 625;
  private readonly surfaceNormal = new THREE.Vector3();
  private readonly dummy = new THREE.Object3D();

  constructor(private readonly geometry: ContainerGeometry) {
    this.group.name = "content-sand-pile";
    this.group.visible = false;
    this.sandVolume = new ContainedVolume(geometry.liquidHull(), true);
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
    const slope = state.pileSlope ?? THREE.MathUtils.clamp(state.massX * 1.6, -1.2, 1.2);
    const span = Math.min(this.geometry.dimensions.x, this.geometry.dimensions.y, this.geometry.dimensions.z);
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
      const travel = Math.sin(phase * 7 + seed) * moving * this.geometry.dimensions.x * 0.025;
      const x = THREE.MathUtils.clamp((u - 0.5) * this.sandVolume.size.x * 0.97 + travel, this.sandVolume.lower.x + radius, this.sandVolume.upper.x - radius);
      const z = (v - 0.5) * this.sandVolume.size.z * 0.97;
      const surfaceY = this.sandVolume.heightAt(x, z);
      const occupied = surfaceY > this.sandVolume.lower.y + radius;
      this.dummy.position.set(x, Math.min(this.sandVolume.upper.y - radius, surfaceY + radius * 0.3), z);
      const grainSize = occupied && visible && this.sandVolume.contains(this.dummy.position, radius) ? radius * (0.65 + this.hash01(seed * 3.1) * 0.6) : 0;
      this.dummy.scale.set(grainSize * 0.8, grainSize * 0.55, grainSize);
      this.dummy.rotation.set(seed, seed * 0.7, seed * 1.3 + moving * Math.sin(phase * 7 + seed));
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
