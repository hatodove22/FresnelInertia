import * as THREE from "three";
import type { DeviceContentState } from "../visualState";
import { disposeObjectTree } from "./disposeObjectTree";

/** A fictional soft organ, not anatomical/medical reconstruction. Geometry and
 * colour consume the reported contraction; there is no local heartbeat clock. */
export class HeartbeatContentRenderer {
  readonly group = new THREE.Group();
  private readonly body: THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhysicalMaterial>;
  private readonly rest: Float32Array;

  constructor(size: THREE.Vector3) {
    this.group.name = "content-heartbeat";
    const geometry = new THREE.SphereGeometry(1, 72, 52);
    const points = geometry.getAttribute("position");
    for (let i = 0; i < points.count; ++i) {
      const x = points.getX(i), y = points.getY(i), z = points.getZ(i);
      // Broad shoulders taper into a rounded, off-centre apex. A shallow
      // upper cleft and asymmetric lobes keep this one continuous soft body.
      const shoulder = 0.84 + 0.13 * y;
      const cleft = 0.22 * Math.exp(-x * x / 0.075) * Math.max(0, (y - 0.28) / 0.72) ** 2;
      points.setXYZ(i,
        (x * shoulder - 0.12 * (1 - y) ** 1.5) * size.x * 0.48,
        (y - cleft + 0.035 * x) * size.y * 0.47,
        z * (0.89 + 0.08 * y + 0.06 * x) * size.z * 0.48);
    }
    geometry.computeVertexNormals();
    const material = new THREE.MeshPhysicalMaterial({
      color: "#a92f45", roughness: 0.34, metalness: 0,
      clearcoat: 0.35, clearcoatRoughness: 0.35,
      sheen: 0.7, sheenColor: new THREE.Color("#f78886"), sheenRoughness: 0.65,
      emissive: "#4b0714", emissiveIntensity: 0.035
    });
    this.body = new THREE.Mesh(geometry, material);
    this.body.name = "heartbeat-soft-body";
    this.body.castShadow = true; this.body.receiveShadow = true;
    this.rest = new Float32Array(points.array);
    this.group.add(this.body);
  }

  updateDevice(state: DeviceContentState) {
    const pulse = state.heartbeat;
    // Missing pulse telemetry is neutral, not permission to invent a rhythm.
    const contraction = pulse?.contraction ?? 0;
    const positions = this.body.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; ++i) {
      const x = this.rest[i * 3], y = this.rest[i * 3 + 1], z = this.rest[i * 3 + 2];
      const squeeze = contraction * (0.88 + 0.12 * Math.tanh(-y * 50));
      positions.setXYZ(i, x * (1 - 0.12 * squeeze), y * (1 - 0.085 * squeeze), z * (1 + 0.10 * squeeze));
    }
    positions.needsUpdate = true;
    this.body.geometry.computeVertexNormals();
    this.body.material.emissiveIntensity = 0.035 + 0.085 * contraction;
    this.group.userData.contraction = contraction;
    this.group.userData.beatSequence = pulse?.beatSequence ?? 0;
  }

  dispose() { disposeObjectTree(this.group); this.group.removeFromParent(); }
}
