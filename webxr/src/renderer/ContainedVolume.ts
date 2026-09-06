import * as THREE from "three";

interface ClippedBox {
  walls: THREE.Vector3[][];
  surface: THREE.Vector3[];
  volume: number;
}

/** Presentation-only displacement over the clipped plane. Revision changes
 * when its source sample advances; no clock is advanced by this geometry. */
export interface SurfaceWaveField {
  revision: number;
  displacement(u: number, v: number): number;
}

const epsilon = 1e-10;

// Smooth, deterministic local roughness without periodic diagonal wave bands.
function sandRelief(x: number, z: number): number {
  const hash = (a: number, b: number) => {
    let n = Math.imul(a, 374761393) + Math.imul(b, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const ix = Math.floor(x), iz = Math.floor(z);
  const smooth = (v: number) => v * v * (3 - 2 * v);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iz), hash(ix + 1, iz), fx),
    THREE.MathUtils.lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), fx), fz) * 2 - 1;
}

function boxFaces(size: THREE.Vector3): THREE.Vector3[][] {
  const x = size.x / 2, y = size.y / 2, z = size.z / 2;
  const point = (a: number, b: number, c: number) => new THREE.Vector3(a * x, b * y, c * z);
  return [
    [[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]],
    [[-1,-1,1],[-1,1,1],[-1,1,-1],[-1,-1,-1]],
    [[-1,1,-1],[-1,1,1],[1,1,1],[1,1,-1]],
    [[-1,-1,1],[-1,-1,-1],[1,-1,-1],[1,-1,1]],
    [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
    [[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]]
  ].map(face => face.map(([a,b,c]) => point(a,b,c)));
}

function polygonVolume(polygon: THREE.Vector3[]): number {
  let volume = 0;
  for (let i = 1; i + 1 < polygon.length; i++) {
    volume += polygon[0].dot(new THREE.Vector3().crossVectors(polygon[i], polygon[i + 1])) / 6;
  }
  return volume;
}

function clipBox(faces: THREE.Vector3[][], normal: THREE.Vector3, offset: number): ClippedBox {
  const walls: THREE.Vector3[][] = [];
  const intersections: THREE.Vector3[] = [];
  for (const face of faces) {
    const clipped: THREE.Vector3[] = [];
    for (let i = 0; i < face.length; i++) {
      const a = face[i], b = face[(i + 1) % face.length];
      const da = normal.dot(a) - offset, db = normal.dot(b) - offset;
      if (da <= epsilon) clipped.push(a);
      if ((da < -epsilon && db > epsilon) || (da > epsilon && db < -epsilon)) {
        const crossing = a.clone().lerp(b, da / (da - db));
        clipped.push(crossing);
        if (!intersections.some(p => p.distanceToSquared(crossing) < 1e-18)) intersections.push(crossing);
      } else if (Math.abs(da) <= epsilon && !intersections.some(p => p.distanceToSquared(a) < 1e-18)) {
        intersections.push(a);
      }
    }
    if (clipped.length >= 3) walls.push(clipped);
  }
  if (intersections.length >= 3) {
    const center = intersections.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / intersections.length);
    const axis = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = axis.cross(normal).normalize(), v = new THREE.Vector3().crossVectors(normal, u);
    intersections.sort((a, b) => {
      const av = a.clone().sub(center), bv = b.clone().sub(center);
      return Math.atan2(av.dot(v), av.dot(u)) - Math.atan2(bv.dot(v), bv.dot(u));
    });
  }
  const surface = intersections.length >= 3 ? intersections : [];
  return { walls, surface, volume: Math.abs(walls.reduce((sum, wall) => sum + polygonVolume(wall), 0) + polygonVolume(surface)) };
}

function triangles(polygon: THREE.Vector3[], output: number[]) {
  for (let i = 1; i + 1 < polygon.length; i++) {
    for (const point of [polygon[0], polygon[i], polygon[i + 1]]) output.push(point.x, point.y, point.z);
  }
}

/** A box clipped by its free surface, solved for fill volume. No simulated
 * motion or wall-clock state: the caller owns all motion, phase and material. */
export class ContainedVolume {
  readonly body = new THREE.BufferGeometry();
  readonly surface = new THREE.BufferGeometry();
  readonly normal = new THREE.Vector3(0, 1, 0);
  readonly centroid = new THREE.Vector3();
  offset = 0;
  volume = 0;
  private readonly boundaryPoints: THREE.Vector3[] = [];
  private readonly boundaryPool = Array.from({ length: 6 }, () => new THREE.Vector3());
  private readonly faces: THREE.Vector3[][];
  private signature = "";

  constructor(readonly size: THREE.Vector3, private readonly sand = false) {
    this.faces = boxFaces(size);
  }

  /** Ordered, exact wall/free-surface intersections. This borrowed read-only
   * view changes on update; it is empty for an empty or completely full box. */
  get boundary(): readonly Readonly<THREE.Vector3>[] { return this.boundaryPoints; }

  update(fill: number, normal: THREE.Vector3, amplitude = 0, phase = 0, waves?: SurfaceWaveField) {
    const fraction = THREE.MathUtils.clamp(Number.isFinite(fill) ? fill : 0, 0, 1);
    this.normal.copy(normal);
    if (!Number.isFinite(this.normal.lengthSq()) || this.normal.lengthSq() < 1e-12) this.normal.set(0, 1, 0);
    this.normal.normalize();
    const signature = [fraction, ...this.normal.toArray(), amplitude, phase, waves?.revision ?? "static"].join(",");
    if (signature === this.signature) return;
    this.signature = signature;
    const extent = (Math.abs(this.normal.x) * this.size.x + Math.abs(this.normal.y) * this.size.y + Math.abs(this.normal.z) * this.size.z) / 2;
    const fullVolume = this.size.x * this.size.y * this.size.z;
    let lo = -extent, hi = extent;
    for (let step = 0; step < 25; step++) {
      const mid = (lo + hi) / 2;
      if (clipBox(this.faces, this.normal, mid).volume < fullVolume * fraction) lo = mid;
      else hi = mid;
    }
    this.offset = fraction === 0 ? -extent - epsilon : fraction === 1 ? extent + epsilon : (lo + hi) / 2;
    const clipped = fraction === 0 ? { walls: [], surface: [], volume: 0 }
      : fraction === 1 ? { walls: this.faces, surface: [], volume: fullVolume }
      : clipBox(this.faces, this.normal, this.offset);
    this.volume = clipped.volume;
    this.boundaryPoints.length = clipped.surface.length;
    for (let i = 0; i < clipped.surface.length; i++) {
      this.boundaryPoints[i] = this.boundaryPool[i].copy(clipped.surface[i]);
    }
    const bodyPositions: number[] = [];
    for (const face of clipped.walls) triangles(face, bodyPositions);
    this.writeGeometry(this.body, bodyPositions, false);
    this.writeSurface(clipped.surface, amplitude, phase, waves);
    this.centroid.set(0, 0, 0);
    let signedVolume = 0;
    for (const face of [...clipped.walls, clipped.surface]) {
      for (let i = 1; i + 1 < face.length; i++) {
        const a = face[0], b = face[i], c = face[i + 1];
        const tetra = a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
        signedVolume += tetra;
        this.centroid.add(a.clone().add(b).add(c).multiplyScalar(tetra / 4));
      }
    }
    if (Math.abs(signedVolume) > 1e-15) this.centroid.multiplyScalar(1 / signedVolume);
  }

  heightAt(x: number, z: number) {
    if (Math.abs(this.normal.y) < 1e-8) return -this.size.y / 2;
    return THREE.MathUtils.clamp((this.offset - this.normal.x * x - this.normal.z * z) / this.normal.y, -this.size.y / 2, this.size.y / 2);
  }

  private writeSurface(polygon: THREE.Vector3[], amplitude: number, phase: number, waves?: SurfaceWaveField) {
    const positions: number[] = [];
    if (polygon.length < 3) { this.writeGeometry(this.surface, positions, true); return; }
    const center = polygon.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / polygon.length);
    const edgeSamples: THREE.Vector3[] = [];
    for (let side = 0; side < polygon.length; side++) {
      for (let segment = 0; segment < 8; segment++) edgeSamples.push(polygon[side].clone().lerp(polygon[(side + 1) % polygon.length], segment / 8));
    }
    const rings = 8, count = edgeSamples.length;
    const points: THREE.Vector3[] = [];
    const heights: number[] = [], weights: number[] = [];
    const shortest = Math.min(this.size.x, this.size.y, this.size.z);
    // At neutral pose u/v are body x/z. Projection keeps the wave field
    // two-dimensional as the supporting plane approaches a side wall.
    const uAxis = new THREE.Vector3(1, 0, 0).addScaledVector(this.normal, -this.normal.x);
    if (uAxis.lengthSq() < 1e-6) uAxis.set(0, 0, 1).addScaledVector(this.normal, -this.normal.z);
    uAxis.normalize();
    const vAxis = new THREE.Vector3().crossVectors(uAxis, this.normal).normalize();
    const projectedSize = (axis: THREE.Vector3) => Math.abs(axis.x) * this.size.x + Math.abs(axis.y) * this.size.y + Math.abs(axis.z) * this.size.z;
    const uSize = projectedSize(uAxis), vSize = projectedSize(vAxis);
    for (let ring = 0; ring <= rings; ring++) {
      const r = ring / rings;
      for (const edge of edgeSamples) {
        const p = center.clone().lerp(edge, r);
        // Rich broad waves keep their shoulder close to the walls, while the
        // exact outer seam remains pinned to the same volume boundary.
        const weight = waves ? 1 - r ** 4 : 1 - r * r;
        const x = p.x / this.size.x, z = p.z / this.size.z;
        const wave = this.sand
          ? sandRelief(x * 8 + 3.7, z * 8 + 8.1) * 0.4
          : Math.sin(x * 11 + z * 7 - phase * 4.1) * 0.65 + Math.cos(z * 13 - x * 5 + phase * 3.3) * 0.35;
        points.push(p);
        const sample = waves?.displacement(p.dot(uAxis) / uSize, p.dot(vAxis) / vSize);
        const height = sample === undefined ? wave * Math.min(Math.abs(amplitude), shortest * 0.035)
          : Number.isFinite(sample) ? THREE.MathUtils.clamp(sample, -shortest * 0.07, shortest * 0.07) : 0;
        heights.push(height * weight);
        weights.push(weight);
      }
    }
    const indices: number[] = [];
    for (let ring = 1; ring <= rings; ring++) {
      for (let sector = 0; sector < count; sector++) {
        const next = (sector + 1) % count;
        const a = (ring - 1) * count + sector, b = ring * count + sector;
        const c = ring * count + next, d = (ring - 1) * count + next;
        indices.push(a, b, c);
        if (ring > 1) indices.push(a, c, d);
      }
    }
    // Zero mean surface displacement preserves volume rather than swelling
    // the entire body. Boundary vertices remain exactly on wall intersections.
    let displacement = 0, weightArea = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = indices.slice(i, i + 3);
      const area = new THREE.Vector3().crossVectors(points[b].clone().sub(points[a]), points[c].clone().sub(points[a])).length() / 2;
      displacement += area * (heights[a] + heights[b] + heights[c]) / 3;
      weightArea += area * (weights[a] + weights[b] + weights[c]) / 3;
    }
    const correction = weightArea > 0 ? displacement / weightArea : 0;
    // Compress the whole displacement together when a crest approaches a wall.
    // Clipping individual vertices after mean correction would change volume.
    let amplitudeScale = 1;
    for (let i = 0; i < points.length; i++) {
      heights[i] -= correction * weights[i];
      for (let axis = 0; axis < 3; axis++) {
        const travel = this.normal.getComponent(axis) * heights[i];
        if (Math.abs(travel) < 1e-12) continue;
        const room = this.size.getComponent(axis) / 2 - Math.sign(travel) * points[i].getComponent(axis);
        amplitudeScale = Math.min(amplitudeScale, Math.max(0, room / Math.abs(travel)));
      }
    }
    for (let i = 0; i < points.length; i++) points[i].addScaledVector(this.normal, heights[i] * amplitudeScale);
    for (const index of indices) positions.push(...points[index].toArray());
    this.writeGeometry(this.surface, positions, true);
    if (!this.sand) {
      // The surface is non-indexed for the changing clipped polygon, but liquid
      // highlights must cross triangle edges smoothly, not look like cut glass.
      const normals = points.map(() => new THREE.Vector3());
      const ab = new THREE.Vector3(), ac = new THREE.Vector3();
      for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i], b = indices[i + 1], c = indices[i + 2];
        ab.subVectors(points[b], points[a]); ac.subVectors(points[c], points[a]); ab.cross(ac);
        normals[a].add(ab); normals[b].add(ab); normals[c].add(ab);
      }
      const centerNormal = new THREE.Vector3();
      for (let i = 0; i < count; i++) centerNormal.add(normals[i]);
      for (let i = 0; i < count; i++) normals[i].copy(centerNormal);
      for (const normal of normals) {
        if (normal.lengthSq() < 1e-18) normal.copy(this.normal);
        else normal.normalize();
      }
      const attribute = this.surface.getAttribute("normal") as THREE.BufferAttribute;
      for (let i = 0; i < indices.length; i++) attribute.setXYZ(i, normals[indices[i]].x, normals[indices[i]].y, normals[indices[i]].z);
      attribute.needsUpdate = true;
    }
  }

  private writeGeometry(geometry: THREE.BufferGeometry, positions: number[], surface: boolean) {
    // Stable GPU buffers avoid leaking/reallocating an attribute every model
    // frame as the waterline crosses box corners and changes polygon topology.
    const capacity = surface ? 8190 : 270;
    if (!geometry.hasAttribute("position")) {
      geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(capacity), 3));
      geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(capacity / 3 * 2), 2));
    }
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    (position.array as Float32Array).fill(0);
    (position.array as Float32Array).set(positions);
    position.needsUpdate = true;
    geometry.setDrawRange(0, positions.length / 3);
    const uvs: number[] = [];
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i] / this.size.x, y = positions[i + 1] / this.size.y, z = positions[i + 2] / this.size.z;
      // A side-on surface still has two-dimensional texture coordinates.
      if (surface && Math.abs(this.normal.x) > Math.max(Math.abs(this.normal.y), Math.abs(this.normal.z))) uvs.push(y + 0.5, z + 0.5);
      else if (surface && Math.abs(this.normal.z) > Math.abs(this.normal.y)) uvs.push(x + 0.5, y + 0.5);
      else uvs.push(x + 0.5, z + 0.5);
    }
    const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
    (uv.array as Float32Array).set(uvs);
    uv.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }

  dispose() { this.body.dispose(); this.surface.dispose(); }
}
