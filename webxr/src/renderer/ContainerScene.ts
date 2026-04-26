import * as THREE from "three";
import type { ContainerPreset, LocalContentState, TiltState } from "../types";
import { makeLabelTexture, makeLiquidNormalTexture } from "./ProceduralAssets";

const wallMaterial = new THREE.MeshPhysicalMaterial({
  color: "#e8f8fb",
  transparent: true,
  opacity: 0.26,
  roughness: 0.12,
  metalness: 0.0,
  transmission: 0.52,
  thickness: 0.025,
  clearcoat: 0.85,
  clearcoatRoughness: 0.16
});

const edgeMaterial = new THREE.LineBasicMaterial({ color: "#e9fbff", transparent: true, opacity: 0.68 });
const liquidMaterial = new THREE.MeshPhysicalMaterial({
  color: "#24a9bd",
  transparent: true,
  opacity: 0.48,
  roughness: 0.08,
  metalness: 0.0,
  transmission: 0.2,
  clearcoat: 0.5,
  clearcoatRoughness: 0.06
});
const liquidSurfaceMaterial = new THREE.MeshPhysicalMaterial({
  color: "#51d2dd",
  transparent: true,
  opacity: 0.86,
  roughness: 0.05,
  metalness: 0.0,
  clearcoat: 1.0,
  clearcoatRoughness: 0.03
});
const foamMaterial = new THREE.MeshStandardMaterial({ color: "#edf8f7", roughness: 0.36, transparent: true, opacity: 0.88 });
const granularMaterial = new THREE.MeshStandardMaterial({ color: "#d8c071", roughness: 0.76 });
const hybridMaterial = new THREE.MeshStandardMaterial({ color: "#e5f0f3", roughness: 0.36, metalness: 0.04 });
const labelMaterial = new THREE.MeshStandardMaterial({ roughness: 0.58, metalness: 0.0 });

interface ParticleState {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  radius: number;
  seed: number;
}

export class ContainerScene {
  readonly group = new THREE.Group();

  private shell?: THREE.Mesh;
  private edges?: THREE.LineSegments;
  private liquid?: THREE.Mesh;
  private liquidSurface?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshPhysicalMaterial>;
  private foam?: THREE.InstancedMesh;
  private particles?: THREE.InstancedMesh;
  private label?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private preset?: ContainerPreset;
  private particleCount = 0;
  private foamCount = 0;
  private particleStates: ParticleState[] = [];
  private dimensions = new THREE.Vector3(0.06, 0.06, 0.06);
  private dummy = new THREE.Object3D();
  private lastElapsed = 0;
  private liquidInset = 0.78;

  constructor() {
    this.group.name = "haptics-container";
    this.group.position.set(0, 1.03, -0.72);
    liquidSurfaceMaterial.normalMap = makeLiquidNormalTexture();
    liquidSurfaceMaterial.normalScale = new THREE.Vector2(0.18, 0.18);
  }

  setPreset(preset: ContainerPreset) {
    this.preset = preset;
    this.dimensions.set(preset.container.span_x_m, preset.container.span_z_m, preset.container.span_y_m);
    this.rebuild();
  }

  update(tilt: TiltState, content: LocalContentState, elapsed: number, dt: number) {
    this.lastElapsed = elapsed;
    this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, tilt.y * 0.62, 0.16);
    this.group.rotation.z = THREE.MathUtils.lerp(this.group.rotation.z, -tilt.x * 0.62, 0.16);

    if (this.liquid && this.preset) {
      const height = this.dimensions.y * Math.max(0.04, this.preset.container.fill);
      const offsetLimitX = this.dimensions.x * (0.5 - this.liquidInset * 0.5) * 0.82;
      const offsetLimitZ = this.dimensions.z * (0.5 - this.liquidInset * 0.5) * 0.82;
      this.liquid.position.x = THREE.MathUtils.clamp(content.surfaceOffsetX * this.dimensions.x * 0.06, -offsetLimitX, offsetLimitX);
      this.liquid.position.z = THREE.MathUtils.clamp(-content.surfaceOffsetY * this.dimensions.z * 0.06, -offsetLimitZ, offsetLimitZ);
      this.liquid.position.y = -this.dimensions.y * 0.5 + height * 0.5;
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
    if (!this.preset) {
      return;
    }

    const geometry = new THREE.BoxGeometry(this.dimensions.x, this.dimensions.y, this.dimensions.z);
    this.shell = new THREE.Mesh(geometry, wallMaterial);
    this.shell.castShadow = true;
    this.shell.receiveShadow = true;
    this.group.add(this.shell);

    this.edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
    this.group.add(this.edges);

    const labelTexture = makeLabelTexture(this.preset.preset, this.preset.family);
    labelTexture.repeat.set(1, 1);
    const label = labelMaterial.clone();
    label.map = labelTexture;
    label.needsUpdate = true;
    this.label = new THREE.Mesh(new THREE.PlaneGeometry(this.dimensions.x * 0.6, this.dimensions.y * 0.34), label);
    this.label.position.set(0, -this.dimensions.y * 0.03, this.dimensions.z * 0.506);
    this.group.add(this.label);

    if (this.preset.family === "Liquid" || this.preset.family === "Hybrid") {
      const fillHeight = Math.max(0.006, this.dimensions.y * this.preset.container.fill);
      this.liquid = new THREE.Mesh(
        new THREE.BoxGeometry(this.dimensions.x * this.liquidInset, fillHeight, this.dimensions.z * this.liquidInset, 8, 2, 8),
        liquidMaterial
      );
      this.liquid.position.y = -this.dimensions.y * 0.5 + fillHeight * 0.5;
      this.group.add(this.liquid);

      this.liquidSurface = new THREE.Mesh(
        new THREE.PlaneGeometry(this.dimensions.x * (this.liquidInset - 0.04), this.dimensions.z * (this.liquidInset - 0.04), 18, 18),
        liquidSurfaceMaterial
      );
      this.liquidSurface.rotation.x = -Math.PI * 0.5;
      this.liquidSurface.position.y = -this.dimensions.y * 0.5 + fillHeight + 0.0008;
      this.group.add(this.liquidSurface);

      this.foamCount = this.preset.family === "Hybrid" ? 18 : 28;
      this.foam = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), foamMaterial, this.foamCount);
      this.group.add(this.foam);
    } else {
      this.liquid = undefined;
      this.liquidSurface = undefined;
      this.foam = undefined;
      this.foamCount = 0;
    }

    if (this.preset.family === "Granular" || this.preset.family === "Hybrid") {
      this.particleCount = this.preset.family === "Hybrid" ? 26 : 62;
      const particleGeometry =
        this.preset.family === "Hybrid" ? new THREE.IcosahedronGeometry(1, 0) : new THREE.SphereGeometry(1, 10, 8);
      this.particles = new THREE.InstancedMesh(
        particleGeometry,
        this.preset.family === "Hybrid" ? hybridMaterial : granularMaterial,
        this.particleCount
      );
      this.particles.castShadow = true;
      this.particles.receiveShadow = true;
      this.particleStates = this.createParticleStates();
      this.group.add(this.particles);
    } else {
      this.particles = undefined;
      this.particleCount = 0;
      this.particleStates = [];
    }

    const scale = 3.8;
    this.group.scale.setScalar(scale);
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
    const surfaceHalfX = this.dimensions.x * (this.liquidInset - 0.04) * 0.5;
    const surfaceHalfZ = this.dimensions.z * (this.liquidInset - 0.04) * 0.5;
    const offsetLimitX = this.dimensions.x * 0.5 - surfaceHalfX - 0.002;
    const offsetLimitZ = this.dimensions.z * 0.5 - surfaceHalfZ - 0.002;
    this.liquidSurface.position.x = THREE.MathUtils.clamp(this.liquidSurface.position.x, -offsetLimitX, offsetLimitX);
    this.liquidSurface.position.z = THREE.MathUtils.clamp(this.liquidSurface.position.z, -offsetLimitZ, offsetLimitZ);
    const fillHeight = this.dimensions.y * Math.max(0.04, this.preset.container.fill);
    const headroom = this.dimensions.y - fillHeight;
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
    const fillHeight = this.dimensions.y * Math.max(0.04, this.preset.container.fill);
    for (let i = 0; i < this.foamCount; i += 1) {
      const seed = i * 17.31;
      const ring = i / Math.max(1, this.foamCount - 1);
      const angle = seed + elapsed * (0.16 + content.agitation * 0.42);
      const edgeBias = 0.18 + ring * 0.78;
      const x = Math.cos(angle) * this.dimensions.x * 0.38 * edgeBias + content.surfaceOffsetX * this.dimensions.x * 0.13;
      const z = Math.sin(angle * 0.84) * this.dimensions.z * 0.38 * edgeBias - content.surfaceOffsetY * this.dimensions.z * 0.13;
      const y = -this.dimensions.y * 0.5 + fillHeight + 0.002 + Math.sin(elapsed * 2.8 + seed) * 0.0015;
      const radius = (0.0015 + (i % 4) * 0.00055) * (0.4 + content.agitation * 0.9 + content.impactPulse * 0.4);
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
      states.push({
        pos: new THREE.Vector3(
          Math.sin(seed * 1.7) * this.dimensions.x * 0.22,
          -this.dimensions.y * 0.42 + radius * 1.8 + (i % 5) * radius * 0.28,
          Math.cos(seed * 1.3) * this.dimensions.z * 0.22
        ),
        vel: new THREE.Vector3(0, 0, 0),
        radius,
        seed
      });
    }
    return states;
  }

  private updateParticles(tilt: TiltState, content: LocalContentState, dt: number) {
    if (!this.particles || !this.preset) {
      return;
    }
    const hardness = this.preset.container.particle_hardness ?? 0.45;
    const damping = THREE.MathUtils.lerp(0.82, 0.96, hardness);
    const gravityX = tilt.x * 0.42 + content.surfaceOffsetX * 0.08;
    const gravityZ = -tilt.y * 0.42 - content.surfaceOffsetY * 0.08;
    const limitX = this.dimensions.x * 0.43;
    const limitY = this.dimensions.y * 0.43;
    const limitZ = this.dimensions.z * 0.43;

    for (let i = 0; i < this.particleStates.length; i += 1) {
      const particle = this.particleStates[i];
      particle.vel.x += gravityX * dt;
      particle.vel.z += gravityZ * dt;
      particle.vel.y -= 0.09 * dt;
      particle.vel.x += Math.sin(this.lastElapsed * 12.7 + particle.seed) * content.impactPulse * 0.012 * dt;
      particle.vel.z += Math.cos(this.lastElapsed * 10.1 + particle.seed) * content.impactPulse * 0.012 * dt;
      particle.pos.addScaledVector(particle.vel, dt);

      if (particle.pos.x > limitX) {
        particle.pos.x = limitX;
        particle.vel.x *= -hardness * 0.72;
      } else if (particle.pos.x < -limitX) {
        particle.pos.x = -limitX;
        particle.vel.x *= -hardness * 0.72;
      }
      if (particle.pos.z > limitZ) {
        particle.pos.z = limitZ;
        particle.vel.z *= -hardness * 0.72;
      } else if (particle.pos.z < -limitZ) {
        particle.pos.z = -limitZ;
        particle.vel.z *= -hardness * 0.72;
      }
      const floorY = -limitY + particle.radius * 1.7;
      if (particle.pos.y < floorY) {
        particle.pos.y = floorY;
        particle.vel.y = Math.abs(particle.vel.y) * hardness * 0.34 + content.impactPulse * 0.015;
      }
      particle.vel.multiplyScalar(Math.pow(damping, dt * 60));

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
}
