import * as THREE from "three";

type Face = THREE.Vector3[];

/** A closed convex vessel clipped by a plane. Rendering geometry only: no fluid
 * integration, collision events or new material state. Faces point outwards. */
export function clipVolume(faces: readonly Face[], normal: THREE.Vector3, level: number) {
  const sides: Face[] = [];
  const rim: THREE.Vector3[] = [];
  for (const face of faces) {
    const clipped: Face = [];
    for (let i = 0; i < face.length; i++) {
      const a = face[i], b = face[(i + 1) % face.length];
      const da = a.dot(normal) - level, db = b.dot(normal) - level;
      if (da <= 0) clipped.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const point = a.clone().lerp(b, da / (da - db));
        clipped.push(point);
        if (!rim.some(p => p.distanceToSquared(point) < 1e-16)) rim.push(point);
      } else if (Math.abs(da) < 1e-10 && !rim.some(p => p.distanceToSquared(a) < 1e-16)) {
        rim.push(a);
      }
    }
    if (clipped.length >= 3) sides.push(clipped);
  }
  if (rim.length >= 3) {
    const center = rim.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(rim.length);
    const u = new THREE.Vector3(Math.abs(normal.y) < 0.9 ? 0 : 1, Math.abs(normal.y) < 0.9 ? 1 : 0, 0).cross(normal).normalize();
    const v = normal.clone().cross(u);
    const angle = (p: THREE.Vector3) => Math.atan2(p.clone().sub(center).dot(v), p.clone().sub(center).dot(u));
    rim.sort((a, b) => angle(a) - angle(b));
  }
  return { sides, surface: rim.length >= 3 ? rim : [] };
}

export function enclosedVolume(faces: readonly Face[]) {
  let volume = 0;
  const cross = new THREE.Vector3();
  for (const face of faces) for (let i = 1; i < face.length - 1; i++) {
    volume += face[0].dot(cross.crossVectors(face[i], face[i + 1])) / 6;
  }
  return Math.abs(volume);
}

/** Reuses GPU buffers, and solves only when the requested fill/plane changes. */
export class ContainedVolume {
  readonly body = this.makeBuffer();
  readonly surface = this.makeBuffer();
  readonly capacity: number;
  private signature = "";
  level = 0;
  volume = 0;
  normal = new THREE.Vector3(0, 1, 0);

  constructor(readonly faces: Face[], private readonly uvScale: number) {
    this.capacity = enclosedVolume(faces);
  }

  update(fill: number, requestedNormal: THREE.Vector3) {
    fill = THREE.MathUtils.clamp(fill, 0, 1);
    const normal = requestedNormal.clone().normalize();
    const signature = [fill, normal.x, normal.y, normal.z].map(v => v.toFixed(5)).join(",");
    if (signature === this.signature) return;
    this.signature = signature;
    this.normal.copy(normal);
    const projections = this.faces.flat().map(v => v.dot(normal));
    let lo = Math.min(...projections), hi = Math.max(...projections);
    // Relative fill accuracy < 0.01%, independent of dimensions or orientation.
    for (let i = 0; i < 18; i++) {
      const level = (lo + hi) / 2;
      const clipped = clipVolume(this.faces, normal, level);
      const volume = enclosedVolume([...clipped.sides, clipped.surface]);
      if (volume < this.capacity * fill) lo = level; else hi = level;
    }
    this.level = fill === 0 ? Math.min(...projections) - 1e-8 : fill === 1 ? Math.max(...projections) + 1e-8 : (lo + hi) / 2;
    const clipped = clipVolume(this.faces, normal, this.level);
    this.volume = enclosedVolume([...clipped.sides, clipped.surface]);
    this.write(this.body, clipped.sides);
    this.write(this.surface, clipped.surface.length ? [clipped.surface] : [], true);
  }

  private makeBuffer() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(4096 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(4096 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(4096 * 2), 2).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    return geometry;
  }

  private write(geometry: THREE.BufferGeometry, faces: Face[], freeSurface = false) {
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    const normals = geometry.getAttribute("normal") as THREE.BufferAttribute;
    const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
    let count = 0;
    const normal = new THREE.Vector3(), edge = new THREE.Vector3();
    // Project onto the plane's own basis; world X/Z UVs collapse when sideways.
    const u = new THREE.Vector3(Math.abs(this.normal.y) < 0.9 ? 0 : 1,
      Math.abs(this.normal.y) < 0.9 ? 1 : 0, 0).cross(this.normal).normalize();
    const v = this.normal.clone().cross(u);
    for (const face of faces) for (let i = 1; i < face.length - 1; i++) {
      normal.subVectors(face[i], face[0]).cross(edge.subVectors(face[i + 1], face[0])).normalize();
      for (const p of [face[0], face[i], face[i + 1]]) {
        if (count >= position.count) throw new Error("ContainedVolume buffer capacity exceeded");
        position.setXYZ(count, p.x, p.y, p.z);
        normals.setXYZ(count, normal.x, normal.y, normal.z);
        uv.setXY(count++, (freeSurface ? p.dot(u) : p.x) / this.uvScale + 0.5,
          (freeSurface ? p.dot(v) : p.z) / this.uvScale + 0.5);
      }
    }
    position.needsUpdate = normals.needsUpdate = uv.needsUpdate = true;
    geometry.setDrawRange(0, count);
    // Frustum bounds include the reusable buffer's unused vertices as well.
    geometry.computeBoundingSphere();
  }
}
