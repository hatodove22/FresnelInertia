import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { ContainerPreset, LocalContentState } from "../types";
import { deviceParticleLayout, deviceParticlePose, isSingleMarble, type DeviceContentState } from "../visualState";
import { ContainerGeometry } from "./ContainerGeometry";
import { disposeObjectTree } from "./disposeObjectTree";

interface ParticleState {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  radius: number;
  seed: number;
  friction: number;
  rollingDrag: number;
  restThreshold: number;
}

/** Solid ingredient shared by Granular and Hybrid. Only preview integrates particles. */
export class ParticleContentRenderer {
  readonly group = new THREE.Group();
  private particles: THREE.InstancedMesh;
  private particleCount = 0;
  private particleStates: ParticleState[] = [];
  private dummy = new THREE.Object3D();
  private localGravity = new THREE.Vector3();
  private lastElapsed = 0;

  constructor(private readonly preset: ContainerPreset, private readonly geometry: ContainerGeometry,
    private readonly resolvedDimensions: boolean) {
    const sand = /sand/i.test(preset.preset);
    const coin = /coin/i.test(preset.preset);
    const marble = isSingleMarble(preset, resolvedDimensions);
    const material = new THREE.MeshPhysicalMaterial(this.preset.family === "Hybrid"
      ? { color: "#e1f3f5", roughness: 0.2, clearcoat: 1, metalness: 0.06 }
      : marble ? { color: "#d8c071", roughness: 0.76 }
      : sand ? { color: "#d9b778", roughness: 0.92 }
      : coin ? { color: "#b99b61", roughness: 0.3, metalness: 0.8 }
      : { color: "#99c9bc", roughness: 0.25, clearcoat: 0.85 });
    this.particleCount = this.resolvedDimensions
      ? isSingleMarble(this.preset, this.resolvedDimensions) ? 1 : Math.round(16 + THREE.MathUtils.clamp(this.preset.container.particle_count ?? 0.6, 0, 1) * 96)
      : this.preset.family === "Hybrid" ? 26 : 62;
    if (sand && !marble) this.particleCount *= 4;
    const particleGeometry =
      this.preset.family === "Hybrid" ? new RoundedBoxGeometry(1.12, 1.12, 1.12, 2, 0.08)
        : coin ? new THREE.CylinderGeometry(0.99, 0.99, 0.16, 24)
        : sand ? new THREE.IcosahedronGeometry(1, 0) : new THREE.SphereGeometry(1, 10, 8);
    this.particles = new THREE.InstancedMesh(
      particleGeometry,
      material,
      this.particleCount
    );
    this.particles.renderOrder = 3;
    this.particles.name = "content-particles";
    this.particles.castShadow = true;
    this.particles.receiveShadow = true;
    if (!marble) for (let i = 0; i < this.particleCount; i++) {
      const tint = new THREE.Color().setHSL(sand || coin ? 0.1 : this.preset.family === "Hybrid" ? 0.53 : 0.42 + (i % 5) * 0.035,
        sand ? 0.18 : 0.12, 0.64 + this.hash01(i * 3.19) * 0.28);
      this.particles.setColorAt(i, tint);
    }
    this.particleStates = this.createParticleStates();
    this.group.add(this.particles);
  }

  private createParticleStates(): ParticleState[] {
    const states: ParticleState[] = [];
    const radiusBase = this.preset?.family === "Hybrid" ? 0.005 : /sand/i.test(this.preset.preset) ? 0.0015 : 0.0036;
    for (let i = 0; i < this.particleCount; i += 1) {
      const seed = i * 9.173 + 0.31;
      const radius = radiusBase * (this.preset?.family === "Hybrid" && i % 4 === 0 ? 1.75 : 1.0);
      const fillHeight = this.geometry.liquidHeight() * Math.max(0.04, this.preset?.container.fill ?? 0.5);
      const liquidTopY = this.geometry.liquidBottomY() + fillHeight;
      states.push({
        pos: new THREE.Vector3(
          Math.sin(seed * 1.7) * this.geometry.dimensions.x * 0.22,
          this.preset?.family === "Hybrid"
            ? liquidTopY - radius * THREE.MathUtils.lerp(0.18, 0.52, this.hash01(seed * 8.19))
            : -this.geometry.dimensions.y * 0.42 + radius * 1.8 + (i % 5) * radius * 0.28,
          Math.cos(seed * 1.3) * this.geometry.dimensions.z * 0.22
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

  updatePreview(content: LocalContentState, elapsed: number, dt: number, orientation: THREE.Quaternion,
    surface?: { normal: THREE.Vector3; level: number }) {
    this.lastElapsed = elapsed;
    if (!this.particles || !this.preset) {
      return;
    }
    this.particles.visible = this.preset.container.fill > 0;
    const hardness = this.preset.container.particle_hardness ?? 0.45;
    const baseDamping = THREE.MathUtils.lerp(0.78, 0.95, hardness);
    this.localGravity.set(0, -1, 0).applyQuaternion(orientation.clone().invert());
    const gravityX = this.localGravity.x * 0.42 + content.surfaceOffsetX * 0.08;
    const gravityZ = this.localGravity.z * 0.42 - content.surfaceOffsetY * 0.08;
    const liquidLimitX = this.geometry.dimensions.x * this.geometry.liquidInset * 0.5;
    const liquidLimitZ = this.geometry.dimensions.z * this.geometry.liquidInset * 0.5;
    const limitX = this.preset.family === "Hybrid" ? liquidLimitX : this.geometry.dimensions.x * 0.5;
    const limitY = this.geometry.dimensions.y * 0.5;
    const limitZ = this.preset.family === "Hybrid" ? liquidLimitZ : this.geometry.dimensions.z * 0.5;
    const fillHeight = this.geometry.liquidHeight() * Math.max(0.04, this.preset.container.fill);
    const liquidTopY = this.geometry.liquidBottomY() + fillHeight;

    for (let i = 0; i < this.particleStates.length; i += 1) {
      const particle = this.particleStates[i];
      const localSurfaceY = surface && surface.normal.y > 0.3
        ? THREE.MathUtils.clamp((surface.level - surface.normal.x * particle.pos.x - surface.normal.z * particle.pos.z) / surface.normal.y,
          -limitY + particle.radius, limitY - particle.radius) : liquidTopY;
      const jitterPhase = this.lastElapsed * (1.3 + particle.seed * 0.017);
      const microJitter = content.agitation * 0.0025 + content.impactPulse * 0.006;
      particle.vel.x += gravityX * particle.friction * dt;
      particle.vel.z += gravityZ * particle.friction * dt;
      if (this.preset.family === "Hybrid") {
        const floatDepth = particle.radius * THREE.MathUtils.lerp(0.2, 0.56, this.hash01(particle.seed * 8.19));
        const targetY =
          localSurfaceY -
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
          ? Math.min(limitY - particle.radius * 1.5, localSurfaceY + particle.radius * 0.55)
          : limitY - particle.radius * 1.5;
      if (particle.pos.y < floorY) {
        particle.pos.y = floorY;
        particle.vel.y = Math.abs(particle.vel.y) * hardness * 0.34 + content.impactPulse * 0.015;
      } else if (particle.pos.y > ceilingY) {
        particle.pos.y = ceilingY;
        particle.vel.y *= -hardness * 0.3;
      }
      const horizontalSpeed = Math.hypot(particle.vel.x, particle.vel.z);
      if (this.geometry.isRoundContainer()) {
        const radius = Math.max(0, this.geometry.innerRadiusAt(particle.pos.y) - particle.radius * 1.35);
        const distance = Math.hypot(particle.pos.x, particle.pos.z);
        if (distance > radius && distance > 0) {
          const nx = particle.pos.x / distance, nz = particle.pos.z / distance;
          particle.pos.x = nx * radius;
          particle.pos.z = nz * radius;
          const outward = Math.max(0, particle.vel.x * nx + particle.vel.z * nz);
          particle.vel.x -= nx * outward * (1 + hardness * 0.72);
          particle.vel.z -= nz * outward * (1 + hardness * 0.72);
        }
      }
      if (horizontalSpeed < particle.restThreshold && content.agitation < 0.08) {
        particle.vel.x *= 0.35;
        particle.vel.z *= 0.35;
      }
      const individualDamping = baseDamping * particle.rollingDrag;
      particle.vel.x *= Math.pow(individualDamping, dt * 60);
      particle.vel.z *= Math.pow(individualDamping, dt * 60);
      particle.vel.y *= Math.pow(baseDamping, dt * 60);

      const visualScale = particle.radius;
      this.dummy.position.copy(particle.pos);
      this.dummy.scale.setScalar(visualScale);
      this.dummy.rotation.set(
        particle.pos.z * 80,
        particle.seed,
        particle.pos.x * 80
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

  updateDevice(state: DeviceContentState) {
    this.particles.visible = state.fill > 0;
    const layout = deviceParticleLayout(this.geometry.dimensions, state, this.preset.family, isSingleMarble(this.preset, this.resolvedDimensions));
    for (let i = 0; i < this.particleCount; i += 1) {
      const pose = deviceParticlePose(layout, i, this.particleCount);
      this.dummy.position.set(pose.x, pose.y, pose.z);
      this.dummy.scale.setScalar(layout.radius);
      this.dummy.rotation.set(0, pose.seed, layout.angle);
      this.dummy.updateMatrix();
      this.particles.setMatrixAt(i, this.dummy.matrix);
    }
    this.particles.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    disposeObjectTree(this.group);
    this.group.removeFromParent();
  }
}
