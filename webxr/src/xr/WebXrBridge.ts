import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton.js";
import { XRHandModelFactory } from "three/examples/jsm/webxr/XRHandModelFactory.js";
import type { TiltState } from "../types";

type HandGroup = THREE.Group & {
  joints: Record<string, THREE.Object3D>;
};

export class WebXrBridge {
  readonly tilt: TiltState = { x: 0, y: 0 };

  private readonly handFactory = new XRHandModelFactory();
  private readonly hands: HandGroup[] = [];
  private readonly tempPosition = new THREE.Vector3();
  private grabOffset = new THREE.Vector3();
  private grabbed = false;
  private baseQuaternion = new THREE.Quaternion();
  private initialGrabQuaternion = new THREE.Quaternion();

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly container: THREE.Group,
    private readonly modeBadge: HTMLElement
  ) {
    this.renderer.xr.enabled = true;
  }

  installButton(button: HTMLButtonElement) {
    if (!("xr" in navigator)) {
      button.disabled = true;
      button.textContent = "No XR";
      return;
    }
    button.addEventListener("click", () => this.enter(button));
  }

  update() {
    if (!this.renderer.xr.isPresenting) {
      return;
    }

    const grabbingHand = this.findPinchingHand();
    if (!grabbingHand) {
      this.grabbed = false;
      return;
    }

    const wrist = grabbingHand.joints["wrist"];
    if (!wrist) {
      return;
    }

    wrist.getWorldPosition(this.tempPosition);
    if (!this.grabbed) {
      this.grabbed = true;
      this.grabOffset.copy(this.container.position).sub(this.tempPosition);
      this.baseQuaternion.copy(this.container.quaternion);
      this.initialGrabQuaternion.copy(wrist.quaternion);
    }

    this.container.position.copy(this.tempPosition).add(this.grabOffset);
    const delta = this.initialGrabQuaternion.clone().invert().multiply(wrist.quaternion);
    this.container.quaternion.copy(this.baseQuaternion).premultiply(delta);
    this.tilt.x = THREE.MathUtils.clamp(-this.container.rotation.z / 0.8, -1, 1);
    this.tilt.y = THREE.MathUtils.clamp(this.container.rotation.x / 0.8, -1, 1);
  }

  private enter(button: HTMLButtonElement) {
    const generated = ARButton.createButton(this.renderer, {
      requiredFeatures: ["local-floor"],
      optionalFeatures: ["hand-tracking", "hit-test", "anchors", "plane-detection", "mesh-detection"]
    });
    generated.style.display = "none";
    document.body.appendChild(generated);
    generated.click();
    generated.remove();
    button.textContent = "MR Active";
    this.modeBadge.textContent = "Quest MR";
    this.attachHands();
  }

  private attachHands() {
    if (this.hands.length > 0) {
      return;
    }

    for (let i = 0; i < 2; i += 1) {
      const hand = this.renderer.xr.getHand(i) as HandGroup;
      hand.add(this.handFactory.createHandModel(hand, "mesh"));
      this.scene.add(hand);
      this.hands.push(hand);
    }
  }

  private findPinchingHand(): HandGroup | undefined {
    for (const hand of this.hands) {
      const indexTip = hand.joints["index-finger-tip"];
      const thumbTip = hand.joints["thumb-tip"];
      if (!indexTip || !thumbTip) {
        continue;
      }
      const distance = indexTip.getWorldPosition(new THREE.Vector3()).distanceTo(thumbTip.getWorldPosition(new THREE.Vector3()));
      if (distance < 0.032) {
        return hand;
      }
    }
    return undefined;
  }
}
