import * as THREE from "three";
import { tableTopY } from "./ContainerGeometry";

/** Quiet desktop stage. Spatial references stay behind the contents. */
export class EnvironmentScene {
  readonly group = new THREE.Group();

  constructor() {
    this.group.name = "demo-environment";
    const stage = new THREE.Mesh(new THREE.BoxGeometry(40, 0.025, 40),
      new THREE.MeshStandardMaterial({ color: "#12252b", roughness: 0.93, metalness: 0 }));
    stage.position.set(0, tableTopY - 0.0125, -0.72);
    stage.receiveShadow = true;
    this.group.add(stage);

    const guideMaterial = new THREE.LineBasicMaterial({ color: "#7c9fa3", transparent: true, opacity: 0.14, depthWrite: false });
    const lines: number[] = [];
    // Sparse ticks give motion/scale references without a dense cutting-mat grid.
    for (let i = -8; i <= 8; i++) {
      const x = i * 0.02;
      const length = i % 5 === 0 ? 0.005 : 0.0025;
      lines.push(x, tableTopY + 0.0002, -0.84, x, tableTopY + 0.0002, -0.84 - length);
      lines.push(-0.12, tableTopY + 0.0002, -0.72 + x, -0.12 - length, tableTopY + 0.0002, -0.72 + x);
    }
    this.group.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(lines, 3)), guideMaterial));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.112, 0.11235, 128),
      new THREE.MeshBasicMaterial({ color: "#78979c", transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, tableTopY + 0.00015, -0.72);
    this.group.add(ring);
  }
}
