import * as THREE from "three";
import { makeMatTexture, makeWoodTexture } from "./ProceduralAssets";

export class EnvironmentScene {
  readonly group = new THREE.Group();

  constructor() {
    this.group.name = "demo-environment";
    this.build();
  }

  private build() {
    const wood = makeWoodTexture();
    const mat = makeMatTexture();

    const table = new THREE.Mesh(
      new THREE.BoxGeometry(2.7, 0.055, 1.55),
      new THREE.MeshStandardMaterial({ map: wood, roughness: 0.68, metalness: 0.02 })
    );
    table.position.set(0, 0.78, -0.73);
    table.receiveShadow = true;
    this.group.add(table);

    const benchMat = new THREE.Mesh(
      new THREE.BoxGeometry(1.06, 0.012, 0.74),
      new THREE.MeshStandardMaterial({ map: mat, roughness: 0.86, metalness: 0.0 })
    );
    benchMat.position.set(0, 0.818, -0.72);
    benchMat.receiveShadow = true;
    this.group.add(benchMat);

    const backPanel = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 1.32, 0.04),
      new THREE.MeshStandardMaterial({ color: "#1a2429", roughness: 0.74, metalness: 0.0 })
    );
    backPanel.position.set(0, 1.36, -1.45);
    backPanel.receiveShadow = true;
    this.group.add(backPanel);

    for (let i = 0; i < 8; i += 1) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(2.8, 0.006, 0.008),
        new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? "#36434a" : "#263238", roughness: 0.6 })
      );
      rail.position.set(0, 0.86 + i * 0.145, -1.424);
      this.group.add(rail);
    }

    const sideBlockMaterial = new THREE.MeshStandardMaterial({ color: "#303a40", roughness: 0.72, metalness: 0.04 });
    const oscilloscope = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.15, 0.16), sideBlockMaterial);
    oscilloscope.position.set(-0.72, 0.91, -0.98);
    this.group.add(oscilloscope);

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.17, 0.085),
      new THREE.MeshStandardMaterial({ color: "#7fcac6", emissive: "#2d7470", emissiveIntensity: 0.6, roughness: 0.36 })
    );
    screen.position.set(-0.72, 0.925, -0.896);
    this.group.add(screen);

    for (let i = 0; i < 3; i += 1) {
      const puck = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.028, 0.018, 28),
        new THREE.MeshStandardMaterial({ color: ["#d9d2bb", "#86b8a8", "#b9c4cf"][i], roughness: 0.55 })
      );
      puck.position.set(0.58 + i * 0.08, 0.847, -0.96 + (i % 2) * 0.08);
      puck.rotation.x = Math.PI * 0.5;
      this.group.add(puck);
    }

    const cableMaterial = new THREE.MeshStandardMaterial({ color: "#101417", roughness: 0.58 });
    for (let i = 0; i < 3; i += 1) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.58 + i * 0.05, 0.846, -0.93),
        new THREE.Vector3(-0.35 + i * 0.04, 0.84, -0.78),
        new THREE.Vector3(-0.18 + i * 0.02, 0.832, -0.92)
      ]);
      const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.004, 8), cableMaterial);
      this.group.add(cable);
    }
  }
}
