import * as THREE from "three";
import { disposeObjectTree } from "./disposeObjectTree";

export class GripProxy {
  readonly group = new THREE.Group();

  private readonly thumbPad: THREE.Mesh;
  private readonly indexPad: THREE.Mesh;
  private readonly contactLine: THREE.Line;
  private readonly basePadScale = new THREE.Vector3(0.012, 0.016, 0.008);
  private active = false;

  constructor() {
    this.group.name = "fixed-pose-grip-proxy";
    this.group.visible = false;

    const contactMaterial = new THREE.MeshStandardMaterial({
      color: "#fff0dc", roughness: 0.72, metalness: 0.0, transparent: true, opacity: 0.82
    });

    const padGeometry = new THREE.SphereGeometry(1, 20, 12);
    this.thumbPad = new THREE.Mesh(padGeometry, contactMaterial);
    this.indexPad = new THREE.Mesh(padGeometry, contactMaterial);
    this.group.add(this.thumbPad, this.indexPad);

    this.contactLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.04, 0, 0), new THREE.Vector3(0.04, 0, 0)]),
      new THREE.LineBasicMaterial({ color: "#bdf7ef", transparent: true, opacity: 0.74 })
    );
    this.group.add(this.contactLine);
  }

  dispose() {
    this.setVisible(false);
    disposeObjectTree(this.group);
    this.group.removeFromParent();
  }

  setVisible(visible: boolean) {
    this.active = visible;
    this.group.visible = visible;
  }

  setSize(dimensions: THREE.Vector3) {
    const halfX = dimensions.x * 0.5;
    const halfZ = dimensions.z * 0.5;
    const contactX = halfX + 0.006;
    const padScale = Math.min(0.016, Math.max(0.010, dimensions.x * 0.2));

    this.thumbPad.position.set(-contactX, 0, halfZ * 0.1);
    this.indexPad.position.set(contactX, 0, halfZ * 0.1);
    this.basePadScale.set(padScale * 0.8, padScale * 1.1, padScale * 0.55);
    this.thumbPad.scale.copy(this.basePadScale);
    this.indexPad.scale.copy(this.thumbPad.scale);

    this.contactLine.geometry.dispose();
    this.contactLine.geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-contactX, 0, halfZ * 0.1),
      new THREE.Vector3(contactX, 0, halfZ * 0.1)
    ]);
  }

  pulse(elapsed: number) {
    if (!this.active) {
      return;
    }
    const squeeze = 1 + Math.sin(elapsed * 9.0) * 0.025;
    this.thumbPad.scale.set(this.basePadScale.x * squeeze, this.basePadScale.y, this.basePadScale.z);
    this.indexPad.scale.copy(this.thumbPad.scale);
  }
}
