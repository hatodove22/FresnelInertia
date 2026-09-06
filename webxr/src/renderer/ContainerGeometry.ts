import * as THREE from "three";
import type { ContainerPreset, VisualContainerShape } from "../types";

export const boxVisualSizeM = 0.07;
export const bottleBodyDiameterM = 0.07;
export const bottleBodyHeightM = 0.086;
export const bottleNeckHeightM = 0.024;
export const bottleNeckRadiusM = 0.014;
export const tumblerTopDiameterM = 0.07;
export const tumblerBottomDiameterM = 0.052;
export const tumblerHeightM = 0.07;
export const tableTopY = 0.824;
export const containerRestY = tableTopY + boxVisualSizeM * 0.5;

/** Geometry shared by shell, liquid and particles; connected boxes use reported metres. */
export class ContainerGeometry {
  readonly dimensions = new THREE.Vector3();
  readonly shape: VisualContainerShape;
  readonly liquidInset = 0.96;

  constructor(preset: ContainerPreset, resolvedDimensions: boolean) {
    this.shape = resolvedDimensions ? "box" : preset.visual_shape ?? "box";
    if (resolvedDimensions) {
      const dimension = (value: number) => Number.isFinite(value) && value > 0 ? value : 0.06;
      this.dimensions.set(dimension(preset.container.span_x_m), dimension(preset.container.span_y_m), dimension(preset.container.span_z_m));
    } else if (this.shape === "cylinder_bottle") {
      this.dimensions.set(bottleBodyDiameterM, bottleBodyHeightM + bottleNeckHeightM, bottleBodyDiameterM);
    } else if (this.shape === "tumbler_cup") {
      this.dimensions.set(tumblerTopDiameterM, tumblerHeightM, tumblerTopDiameterM);
    } else {
      this.dimensions.set(boxVisualSizeM, boxVisualSizeM, boxVisualSizeM);
    }
  }

  makeShellGeometry() {
    if (this.shape === "cylinder_bottle") {
      return new THREE.CylinderGeometry(this.dimensions.x * 0.5, this.dimensions.x * 0.5, bottleBodyHeightM, 64, 1, true);
    }
    if (this.shape === "tumbler_cup") {
      return new THREE.CylinderGeometry(tumblerTopDiameterM * 0.5, tumblerBottomDiameterM * 0.5, tumblerHeightM, 64, 1, true);
    }
    return new THREE.BoxGeometry(this.dimensions.x, this.dimensions.y, this.dimensions.z);
  }

  /** Closed inner cavity; bottle fill refers to body volume below the neck. */
  liquidHull(): THREE.Vector3[][] {
    const n = this.isRoundContainer() ? 40 : 4;
    const bottom = this.liquidBottomY() + this.dimensions.y * 0.02;
    const top = this.liquidBottomY() + this.liquidHeight() - this.dimensions.y * 0.02;
    const ring = (y: number, isTop: boolean) => Array.from({ length: n }, (_, i) => {
      if (!this.isRoundContainer()) {
        return new THREE.Vector3([1, 1, -1, -1][i] * this.dimensions.x * this.liquidInset / 2,
          y, [-1, 1, 1, -1][i] * this.dimensions.z * this.liquidInset / 2);
      }
      const radius = (this.shape === "tumbler_cup" && !isTop ? tumblerBottomDiameterM : this.dimensions.x) * this.liquidInset / 2;
      return new THREE.Vector3(Math.cos(i * Math.PI * 2 / n) * radius, y, Math.sin(i * Math.PI * 2 / n) * radius);
    });
    const low = ring(bottom, false), high = ring(top, true);
    return [low, [...high].reverse(), ...low.map((p, i) => [p, high[i], high[(i + 1) % n], low[(i + 1) % n]])];
  }

  liquidBottomY() {
    return -this.dimensions.y * 0.5;
  }

  liquidHeight() {
    if (this.shape === "cylinder_bottle") {
      return bottleBodyHeightM;
    }
    if (this.shape === "tumbler_cup") {
      return tumblerHeightM;
    }
    return this.dimensions.y;
  }

  isRoundContainer() {
    return this.shape === "cylinder_bottle" || this.shape === "tumbler_cup";
  }

  innerRadiusAt(y: number) {
    const h = y + this.dimensions.y / 2;
    if (this.shape === "tumbler_cup") return THREE.MathUtils.lerp(tumblerBottomDiameterM, tumblerTopDiameterM,
      THREE.MathUtils.clamp(h / tumblerHeightM, 0, 1)) * this.liquidInset / 2;
    if (this.shape === "cylinder_bottle") return THREE.MathUtils.lerp(this.dimensions.x / 2, bottleNeckRadiusM,
      THREE.MathUtils.clamp((h - bottleBodyHeightM) / 0.014, 0, 1)) * this.liquidInset;
    return Math.min(this.dimensions.x, this.dimensions.z) * this.liquidInset / 2;
  }

}
