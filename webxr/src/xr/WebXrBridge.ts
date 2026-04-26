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
  private readonly tempLocalPosition = new THREE.Vector3();
  private readonly xrCameraPosition = new THREE.Vector3();
  private grabOffset = new THREE.Vector3();
  private grabbed = false;
  private baseQuaternion = new THREE.Quaternion();
  private initialGrabQuaternion = new THREE.Quaternion();
  private referenceHeightSettled = false;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly worldRoot: THREE.Group,
    private readonly container: THREE.Group,
    private readonly modeBadge: HTMLElement
  ) {
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType("local-floor");
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

    this.updateWorldRootHeight();

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
    this.tempLocalPosition.copy(this.tempPosition);
    this.container.parent?.worldToLocal(this.tempLocalPosition);
    if (!this.grabbed) {
      this.grabbed = true;
      this.grabOffset.copy(this.container.position).sub(this.tempLocalPosition);
      this.baseQuaternion.copy(this.container.quaternion);
      this.initialGrabQuaternion.copy(wrist.quaternion);
    }

    this.container.position.copy(this.tempLocalPosition).add(this.grabOffset);
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

  private updateWorldRootHeight() {
    if (this.referenceHeightSettled) {
      return;
    }
    const xrCamera = this.renderer.xr.getCamera();
    xrCamera.getWorldPosition(this.xrCameraPosition);
    if (!Number.isFinite(this.xrCameraPosition.y)) {
      return;
    }

    // Some Quest Browser AR sessions behave like viewer-local space even when
    // local-floor is requested. In that case y=0 is the headset, so the demo
    // bench must be shifted down to a plausible table height.
    this.worldRoot.position.y = this.xrCameraPosition.y < 0.35 ? -1.55 : 0.0;
    this.referenceHeightSettled = true;
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
