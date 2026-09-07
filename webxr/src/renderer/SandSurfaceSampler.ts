import type * as THREE from "three";

interface SurfaceTriangle {
  x: number; y: number; z: number;
  ux: number; uy: number; uz: number;
  vx: number; vy: number; vz: number;
  inverse: number;
}

/** Samples the final, volume-corrected free surface, not its reference plane.
 * Small spatial bins keep grain contact inexpensive without a second surface. */
export class SandSurfaceSampler {
  private readonly resolution = 16;
  private readonly bins: number[][] = Array.from({ length: 16 * 16 }, () => []);
  private readonly triangles: SurfaceTriangle[] = [];

  constructor(private readonly surface: THREE.BufferGeometry, private readonly size: THREE.Vector3) {}

  private bin(value: number, span: number) {
    return Math.max(0, Math.min(this.resolution - 1, Math.floor((value / span + 0.5) * this.resolution)));
  }

  rebuild(): void {
    for (const bin of this.bins) bin.length = 0;
    this.triangles.length = 0;
    const position = this.surface.getAttribute("position");
    if (!position) return;
    const start = this.surface.drawRange.start;
    const end = Math.min(position.count, start + this.surface.drawRange.count);
    for (let i = start; i + 2 < end; i += 3) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      const ux = position.getX(i + 1) - x, uy = position.getY(i + 1) - y, uz = position.getZ(i + 1) - z;
      const vx = position.getX(i + 2) - x, vy = position.getY(i + 2) - y, vz = position.getZ(i + 2) - z;
      const determinant = ux * vz - uz * vx;
      if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-16) continue;
      const index = this.triangles.length;
      this.triangles.push({ x, y, z, ux, uy, uz, vx, vy, vz, inverse: 1 / determinant });
      const x0 = this.bin(Math.min(x, x + ux, x + vx), this.size.x);
      const x1 = this.bin(Math.max(x, x + ux, x + vx), this.size.x);
      const z0 = this.bin(Math.min(z, z + uz, z + vz), this.size.z);
      const z1 = this.bin(Math.max(z, z + uz, z + vz), this.size.z);
      for (let bz = z0; bz <= z1; bz++) for (let bx = x0; bx <= x1; bx++) {
        this.bins[bz * this.resolution + bx].push(index);
      }
    }
  }

  heightAt(x: number, z: number): number | undefined {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return undefined;
    const candidates = this.bins[this.bin(z, this.size.z) * this.resolution + this.bin(x, this.size.x)];
    for (const index of candidates) {
      const t = this.triangles[index], dx = x - t.x, dz = z - t.z;
      const a = (dx * t.vz - dz * t.vx) * t.inverse;
      const b = (t.ux * dz - t.uz * dx) * t.inverse;
      if (a >= -1e-6 && b >= -1e-6 && a + b <= 1 + 1e-6) return t.y + a * t.uy + b * t.vy;
    }
    return undefined;
  }
}
