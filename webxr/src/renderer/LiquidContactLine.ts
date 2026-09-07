import * as THREE from "three";
import { ContainedVolume } from "./ContainedVolume";

const edgeSegments = 8;
const ribbonSteps = 2;
// Cover the shared 40-sided convex round cavities as well as boxes.
const maxVertices = 84 * edgeSegments * ribbonSteps * 6;

/** Optical wall contact for the existing clipped liquid, not a new fluid model.
 * No clock or retained dynamics: identical supplied state gives identical mesh. */
export class LiquidContactLine {
  readonly group = new THREE.Group();
  private readonly wetGeometry = this.makeGeometry();
  private readonly foamGeometry = this.makeGeometry();
  private readonly wetMaterial = new THREE.MeshPhysicalMaterial({
    color: "#d5f4f5", roughness: 0.12, metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.15,
    transparent: true, opacity: 0.42, depthWrite: false,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  private readonly foamMaterial = new THREE.MeshStandardMaterial({
    color: "#f0f9f4", roughness: 0.76, metalness: 0,
    transparent: true, opacity: 0, depthWrite: false,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  private readonly wet = new THREE.Mesh(this.wetGeometry, this.wetMaterial);
  private readonly foam = new THREE.Mesh(this.foamGeometry, this.foamMaterial);
  private readonly center = new THREE.Vector3();
  private readonly boundaryStart = new THREE.Vector3();
  private readonly boundaryEnd = new THREE.Vector3();
  private readonly inward = new THREE.Vector3();
  private readonly vertex = new THREE.Vector3();
  private readonly span: number;
  private signature = "";
  private disposed = false;

  constructor(size: THREE.Vector3) {
    this.span = Math.min(size.x, size.y, size.z);
    this.group.name = "content-liquid-contact";
    this.wet.name = "content-liquid-meniscus";
    this.foam.name = "content-liquid-foam-edge";
    this.wet.renderOrder = 4;
    this.foam.renderOrder = 5;
    this.group.add(this.wet, this.foam);
    this.group.visible = false;
    this.foam.visible = false;
  }

  update(volume: ContainedVolume, fill: number, foam = 0) {
    if (this.disposed) return;
    const amount = THREE.MathUtils.clamp(Number.isFinite(foam) ? foam : 0, 0, 1);
    this.group.visible = Number.isFinite(fill) && fill > 0 && fill < 1 && volume.boundary.length >= 3;
    this.foam.visible = this.group.visible && amount > 0.001;
    if (!this.group.visible) {
      this.signature = "";
      this.wetGeometry.setDrawRange(0, 0);
      this.foamGeometry.setDrawRange(0, 0);
      return;
    }
    const signature = [fill, amount, volume.offset, volume.normal.x, volume.normal.y, volume.normal.z, volume.revision].join(",");
    if (signature === this.signature) return;
    this.signature = signature;
    this.center.set(0, 0, 0);
    for (const point of volume.boundary) this.center.add(point);
    this.center.multiplyScalar(1 / volume.boundary.length);
    this.writeRibbon(this.wetGeometry, volume, this.span * 0.006, this.span * 0.0008, 0);
    this.foamMaterial.opacity = amount * 0.48;
    if (this.foam.visible) {
      this.writeRibbon(this.foamGeometry, volume, this.span * (0.006 + amount * 0.012), this.span * 0.001, amount);
    } else this.foamGeometry.setDrawRange(0, 0);
  }

  private makeGeometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(maxVertices * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(maxVertices * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    return geometry;
  }

  private writeRibbon(geometry: THREE.BufferGeometry, volume: ContainedVolume, width: number, height: number, foam: number) {
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    const data = position.array as Float32Array;
    let cursor = 0;
    const emit = (point: THREE.Vector3, across: number, variation: number) => {
      this.inward.copy(this.center).sub(point);
      const distance = this.inward.length();
      this.vertex.copy(point);
      if (distance > 1e-12) this.vertex.addScaledVector(this.inward, Math.min(width * across * variation / distance, 0.48));
      // The exact outer boundary follows the shared waterline; only the narrow
      // optical lip curves inward and upward, never outside the container.
      const lift = Math.sin(across * Math.PI) * height;
      this.vertex.addScaledVector(volume.normal, lift).clamp(volume.lower, volume.upper);
      if (!volume.contains(this.vertex)) this.vertex.addScaledVector(volume.normal, -lift);
      data[cursor++] = this.vertex.x;
      data[cursor++] = this.vertex.y;
      data[cursor++] = this.vertex.z;
    };
    const boundary = volume.boundary;
    // A moving waterline is already tessellated by its surface owner. Avoid
    // multiplying those samples into a second high-density optical mesh.
    const segments = boundary.length > 12 ? 1 : edgeSegments;
    for (let edge = 0; edge < boundary.length; edge++) {
      const a = boundary[edge], b = boundary[(edge + 1) % boundary.length];
      for (let segment = 0; segment < segments; segment++) {
        this.boundaryStart.copy(a).lerp(b, segment / segments);
        this.boundaryEnd.copy(a).lerp(b, (segment + 1) / segments);
        // Object-locked edge texture only. No event, time or particle simulation.
        const variationAt = (sample: number) => 1 - foam * 0.26 * (0.5 + 0.5 * Math.sin(sample * 2.399));
        const startVariation = variationAt(edge * segments + segment);
        const endVariation = variationAt((edge * segments + segment + 1) % (boundary.length * segments));
        for (let strip = 0; strip < ribbonSteps; strip++) {
          const outer = strip / ribbonSteps, inner = (strip + 1) / ribbonSteps;
          emit(this.boundaryStart, outer, startVariation);
          emit(this.boundaryEnd, outer, endVariation);
          emit(this.boundaryEnd, inner, endVariation);
          emit(this.boundaryStart, outer, startVariation);
          emit(this.boundaryEnd, inner, endVariation);
          emit(this.boundaryStart, inner, startVariation);
        }
      }
    }
    // Clear unused slots when the plane changes from six sides to four/three.
    data.fill(0, cursor);
    geometry.setDrawRange(0, cursor / 3);
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.wetGeometry.dispose();
    this.foamGeometry.dispose();
    this.wetMaterial.dispose();
    this.foamMaterial.dispose();
    this.group.removeFromParent();
    this.group.clear();
    this.group.visible = false;
  }
}
