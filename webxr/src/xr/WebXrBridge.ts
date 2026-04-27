import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton.js";
import { XRHandModelFactory } from "three/examples/jsm/webxr/XRHandModelFactory.js";
import type { GripProxy } from "../renderer/GripProxy";
import type { SpatialControlPanel } from "../renderer/SpatialControlPanel";
import type { TiltState } from "../types";

type HandGroup = THREE.Group & {
  joints: Record<string, THREE.Object3D>;
};

const grabAcquireRadius = 0.095;
const grabReleaseRadius = 0.18;
const opposingGripMinSpan = 0.035;
const opposingGripMaxSpan = 0.105;
const resetGrabCooldownMs = 750;

export class WebXrBridge {
  readonly tilt: TiltState = { x: 0, y: 0 };
  private readonly handFactory = new XRHandModelFactory();
  private readonly hands: HandGroup[] = [];
  private readonly handModels = new Map<HandGroup, THREE.Object3D>();
  private readonly xrCameraPosition = new THREE.Vector3();
  private readonly rayOrigin = new THREE.Vector3();
  private readonly rayDirection = new THREE.Vector3();
  private readonly rayQuaternion = new THREE.Quaternion();
  private readonly directTouchPoint = new THREE.Vector3();
  private readonly pinchPointA = new THREE.Vector3();
  private readonly pinchPointB = new THREE.Vector3();
  private readonly wristWorldPosition = new THREE.Vector3();
  private readonly containerWorldPosition = new THREE.Vector3();
  private readonly gripWorldPosition = new THREE.Vector3();
  private readonly gripLocalPosition = new THREE.Vector3();
  private readonly handRight = new THREE.Vector3();
  private readonly handForward = new THREE.Vector3();
  private readonly handUp = new THREE.Vector3();
  private readonly controllers: THREE.Group[] = [];
  private readonly controllerPressed = [false, false];
  private activeHand?: HandGroup;
  private grabbed = false;
  private grabCooldownUntil = 0;
  private referenceHeightSettled = false;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly worldRoot: THREE.Group,
    private readonly container: THREE.Group,
    private readonly modeBadge: HTMLElement,
    private readonly spatialPanel?: SpatialControlPanel,
    private readonly gripProxy?: GripProxy
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
    this.updatePanelInteractions();

    const grabbingHand = this.findNearHand();
    if (!grabbingHand) {
      this.grabbed = false;
      this.activeHand = undefined;
      this.updateHandVisibility();
      return;
    }

    if (!this.getGripPose(grabbingHand, this.gripWorldPosition)) {
      return;
    }

    if (!this.grabbed) {
      this.grabbed = true;
      this.activeHand = grabbingHand;
      this.updateHandVisibility(grabbingHand);
    }

    this.gripLocalPosition.copy(this.gripWorldPosition);
    this.container.parent?.worldToLocal(this.gripLocalPosition);
    this.container.position.lerp(this.gripLocalPosition, 0.34);
  }

  resetTilt() {
    this.tilt.x = 0;
    this.tilt.y = 0;
    this.releaseGrab();
  }

  releaseGrab() {
    this.grabbed = false;
    this.activeHand = undefined;
    this.grabCooldownUntil = performance.now() + resetGrabCooldownMs;
    this.updateHandVisibility();
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
    document.querySelector("#hand-mode-button")?.classList.add("active");
    document.querySelector("#touch-mode-button")?.classList.remove("active");
    document.querySelector("#tilt-mode-button")?.classList.remove("active");
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
      const model = this.handFactory.createHandModel(hand, "mesh");
      hand.add(model);
      this.scene.add(hand);
      this.hands.push(hand);
      this.handModels.set(hand, model);
    }
    this.attachControllers();
  }

  private attachControllers() {
    if (this.controllers.length > 0) {
      return;
    }
    for (let i = 0; i < 2; i += 1) {
      const controller = this.renderer.xr.getController(i);
      controller.addEventListener("selectstart", () => {
        this.controllerPressed[i] = true;
      });
      controller.addEventListener("selectend", () => {
        this.controllerPressed[i] = false;
      });
      const rayLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -0.65)]),
        new THREE.LineBasicMaterial({ color: "#8de5df", transparent: true, opacity: 0.75 })
      );
      controller.add(rayLine);
      this.scene.add(controller);
      this.controllers.push(controller);
    }
  }

  private updatePanelInteractions() {
    if (!this.spatialPanel) {
      return;
    }

    for (let i = 0; i < this.controllers.length; i += 1) {
      const controller = this.controllers[i];
      controller.getWorldPosition(this.rayOrigin);
      controller.getWorldQuaternion(this.rayQuaternion);
      this.rayDirection.set(0, 0, -1).applyQuaternion(this.rayQuaternion).normalize();
      this.spatialPanel.interactRay(this.rayOrigin, this.rayDirection, this.controllerPressed[i]);
    }

    for (const hand of this.hands) {
      const indexTip = hand.joints["index-finger-tip"];
      if (!indexTip) {
        continue;
      }
      indexTip.getWorldPosition(this.directTouchPoint);
      this.spatialPanel.interactPoint(this.directTouchPoint, true);
    }
  }

  private updateHandVisibility(activeHand?: HandGroup) {
    for (const [hand, model] of this.handModels) {
      model.visible = hand !== activeHand;
    }
    this.gripProxy?.setVisible(Boolean(activeHand));
  }

  private findNearHand(): HandGroup | undefined {
    if (performance.now() < this.grabCooldownUntil) {
      return undefined;
    }

    this.container.getWorldPosition(this.containerWorldPosition);
    if (this.activeHand && this.getGripPose(this.activeHand, this.gripWorldPosition)) {
      if (this.gripWorldPosition.distanceTo(this.containerWorldPosition) < grabReleaseRadius) {
        return this.activeHand;
      }
    }

    let nearestHand: HandGroup | undefined;
    let nearestDistance = grabAcquireRadius;
    for (const hand of this.hands) {
      if (!this.getGripPose(hand, this.gripWorldPosition)) {
        continue;
      }
      const distance = this.gripWorldPosition.distanceTo(this.containerWorldPosition);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestHand = hand;
      }
    }
    return nearestHand;
  }

  private getGripPose(hand: HandGroup, outPosition: THREE.Vector3) {
    const wrist = hand.joints["wrist"];
    if (!wrist) {
      return false;
    }

    const thumbTip = hand.joints["thumb-tip"];
    const indexTip = hand.joints["index-finger-tip"];
    const middleTip = hand.joints["middle-finger-tip"];
    wrist.getWorldPosition(this.wristWorldPosition);

    if (thumbTip && indexTip) {
      thumbTip.getWorldPosition(this.pinchPointA);
      indexTip.getWorldPosition(this.pinchPointB);
      const pinchSpan = this.pinchPointA.distanceTo(this.pinchPointB);
      if (pinchSpan >= opposingGripMinSpan && pinchSpan <= opposingGripMaxSpan) {
        outPosition.addVectors(this.pinchPointA, this.pinchPointB).multiplyScalar(0.5);
        this.handRight.subVectors(this.pinchPointB, this.pinchPointA).normalize();

        if (middleTip) {
          middleTip.getWorldPosition(this.handForward);
          this.handForward.sub(this.wristWorldPosition).normalize();
        } else {
          this.handForward.set(0, 0, -1).applyQuaternion(wrist.quaternion).normalize();
        }

        this.handUp.crossVectors(this.handRight, this.handForward).normalize();
        if (this.handRight.lengthSq() > 0.0001 && this.handForward.lengthSq() > 0.0001 && this.handUp.lengthSq() > 0.0001) {
          return true;
        }
      }
    }

    outPosition.copy(this.wristWorldPosition).multiplyScalar(0.42);
    let weight = 0.42;

    if (thumbTip) {
      thumbTip.getWorldPosition(this.pinchPointA);
      outPosition.addScaledVector(this.pinchPointA, 0.22);
      weight += 0.22;
    }
    if (indexTip) {
      indexTip.getWorldPosition(this.pinchPointA);
      outPosition.addScaledVector(this.pinchPointA, 0.22);
      weight += 0.22;
    }
    if (middleTip) {
      middleTip.getWorldPosition(this.pinchPointA);
      outPosition.addScaledVector(this.pinchPointA, 0.14);
      weight += 0.14;
    }
    outPosition.multiplyScalar(1 / weight);
    return true;
  }
}
