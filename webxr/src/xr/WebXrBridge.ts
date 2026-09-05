import * as THREE from "three";
import { XRHandModelFactory } from "three/examples/jsm/webxr/XRHandModelFactory.js";
import type { GripProxy } from "../renderer/GripProxy";
import type { SpatialControlPanel } from "../renderer/SpatialControlPanel";
import type { TiltState } from "../types";

type HandGroup = THREE.Group<THREE.Object3DEventMap & {
  connected: { data: XRInputSource };
  disconnected: { data: XRInputSource };
}> & {
  joints: Record<string, THREE.Object3D>;
};

const opposingGripMinSpan = 0.035;
const opposingGripMaxSpan = 0.105;

export class WebXrBridge {
  readonly tilt: TiltState = { x: 0, y: 0 };
  private readonly handFactory = new XRHandModelFactory();
  private readonly hands: HandGroup[] = [];
  private readonly handModels = new Map<HandGroup, THREE.Object3D>();
  private readonly handSides = new Map<HandGroup, XRHandedness>();
  private readonly xrCameraPosition = new THREE.Vector3();
  private readonly rayOrigin = new THREE.Vector3();
  private readonly rayDirection = new THREE.Vector3();
  private readonly rayQuaternion = new THREE.Quaternion();
  private readonly directTouchPoint = new THREE.Vector3();
  private readonly pinchPointA = new THREE.Vector3();
  private readonly pinchPointB = new THREE.Vector3();
  private readonly wristWorldPosition = new THREE.Vector3();
  private readonly gripWorldPosition = new THREE.Vector3();
  private readonly gripLocalPosition = new THREE.Vector3();
  private readonly handRight = new THREE.Vector3();
  private readonly handForward = new THREE.Vector3();
  private readonly handUp = new THREE.Vector3();
  private readonly controllers: THREE.Group[] = [];
  private readonly controllerPressed = [false, false];
  private preferredHand: "left" | "right" | "any" = "any";
  private selectedHand?: HandGroup;
  private activeHand?: HandGroup;
  private grabbed = false;
  private referenceHeightSettled = false;
  private session?: XRSession;
  private sessionPending = false;
  private sessionButton?: HTMLButtonElement;
  private sessionStatus?: HTMLElement;
  private savedWorldPosition?: THREE.Vector3;
  private savedProjection?: { fov: number; zoom: number };
  private savedBadge?: string;
  private savedModeClasses: Array<{ element: Element; active: boolean }> = [];

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly worldRoot: THREE.Group,
    private readonly container: THREE.Group,
    private readonly modeBadge: HTMLElement,
    private readonly spatialPanel?: SpatialControlPanel,
    private readonly gripProxy?: GripProxy,
    private readonly desktopCamera?: THREE.PerspectiveCamera
  ) {
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType("local-floor");
  }

  installButton(button: HTMLButtonElement) {
    this.sessionButton = button;
    this.sessionStatus = document.createElement("span");
    this.sessionStatus.id = "xr-session-status";
    this.sessionStatus.setAttribute("role", "status");
    this.sessionStatus.setAttribute("aria-live", "polite");
    this.sessionStatus.style.fontSize = "0.8rem";
    button.insertAdjacentElement("afterend", this.sessionStatus);
    if (!("xr" in navigator)) {
      button.disabled = true;
      button.textContent = "No XR";
      this.sessionStatus.textContent = "WebXR is unavailable in this browser.";
      return;
    }
    button.addEventListener("click", () => { void this.toggleSession(button); });
  }

  update() {
    if (!this.renderer.xr.isPresenting) {
      return;
    }
    if (this.session && this.session.visibilityState !== "visible") {
      this.resetInputs();
      return;
    }

    this.updateWorldRootHeight();
    this.updatePanelInteractions();

    const grabbingHand = this.findFollowHand();
    if (!grabbingHand) {
      this.grabbed = false;
      this.activeHand = undefined;
      this.updateHandVisibility();
      return;
    }

    if (!this.getGripPose(grabbingHand, this.gripWorldPosition)) {
      return;
    }

    const acquired = !this.grabbed;
    if (acquired) {
      this.grabbed = true;
      this.activeHand = grabbingHand;
      this.updateHandVisibility(grabbingHand);
    }

    this.gripLocalPosition.copy(this.gripWorldPosition);
    this.container.parent?.worldToLocal(this.gripLocalPosition);
    // The hand supplies translation only; device telemetry owns orientation.
    // Attach immediately, even when the initial table position is far away.
    if (acquired) this.container.position.copy(this.gripLocalPosition);
    else this.container.position.lerp(this.gripLocalPosition, 0.34);
  }

  setPreferredHand(hand: "left" | "right" | "any") {
    if (this.preferredHand === hand) return;
    this.preferredHand = hand;
    this.selectedHand = undefined;
    this.releaseGrab();
  }

  resetTilt() {
    this.tilt.x = 0;
    this.tilt.y = 0;
    this.releaseGrab();
  }

  releaseGrab() {
    this.grabbed = false;
    this.activeHand = undefined;
    this.updateHandVisibility();
  }

  private async toggleSession(button: HTMLButtonElement) {
    if (this.sessionPending) return;
    this.sessionPending = true;
    button.disabled = true;
    button.title = "";
    if (this.sessionStatus) this.sessionStatus.textContent = "";
    if (this.session) {
      button.textContent = "Leaving MR…";
      try {
        await this.session.end(); // The actual end event owns UI/restoration.
      } catch (error) {
        this.sessionPending = false;
        button.disabled = false;
        button.textContent = this.session ? "Exit MR" : "Enter MR";
        button.title = `MR exit failed: ${error instanceof Error ? error.message : String(error)}`;
        if (this.sessionStatus) this.sessionStatus.textContent = button.title;
      }
      return;
    }

    button.textContent = "Entering MR…";
    this.savedWorldPosition = this.worldRoot.position.clone();
    this.savedProjection = this.desktopCamera ? { fov: this.desktopCamera.fov, zoom: this.desktopCamera.zoom } : undefined;
    this.savedBadge = this.modeBadge.textContent ?? "";
    this.savedModeClasses = ["#hand-mode-button", "#touch-mode-button", "#tilt-mode-button"]
      .map(selector => document.querySelector(selector))
      .filter((element): element is Element => element !== null)
      .map(element => ({ element, active: element.classList.contains("active") }));
    try {
      // Called synchronously from the user's click, before any awaited work.
      // Do not create/click an ARButton whose onclick is installed asynchronously.
      const session = await navigator.xr!.requestSession("immersive-ar", {
        requiredFeatures: ["local-floor"],
        optionalFeatures: ["hand-tracking", "hit-test", "anchors", "plane-detection", "mesh-detection"]
      });
      this.session = session;
      session.addEventListener("end", this.onSessionEnded);
      session.addEventListener("visibilitychange", this.onVisibilityChanged);
      this.referenceHeightSettled = false;
      this.resetInputs();
      // Input slots must exist before Three receives session input-source events.
      this.attachHands();
      this.renderer.xr.setReferenceSpaceType("local-floor");
      this.desktopCamera?.clearViewOffset();
      await this.renderer.xr.setSession(session);
      if (this.session !== session || !this.renderer.xr.isPresenting) throw new Error("MR session ended before initialization");
      this.sessionPending = false;
      button.disabled = false;
      button.textContent = "Exit MR";
      this.modeBadge.textContent = "Quest MR";
      document.querySelector("#hand-mode-button")?.classList.add("active");
      document.querySelector("#touch-mode-button")?.classList.remove("active");
      document.querySelector("#tilt-mode-button")?.classList.remove("active");
    } catch (error) {
      const failedSession = this.session;
      this.detachSession();
      await failedSession?.end().catch(() => undefined);
      this.restoreDesktopState();
      this.sessionPending = false;
      button.disabled = false;
      button.textContent = "MR failed — Retry";
      button.title = error instanceof Error ? error.message : String(error);
      if (this.sessionStatus) this.sessionStatus.textContent = button.title;
    }
  }

  private readonly onSessionEnded = () => {
    this.detachSession();
    this.restoreDesktopState();
    this.sessionPending = false;
    if (this.sessionButton) {
      this.sessionButton.disabled = false;
      this.sessionButton.textContent = "Enter MR";
      this.sessionButton.title = "";
    }
    if (this.sessionStatus) this.sessionStatus.textContent = "";
  };

  private readonly onVisibilityChanged = () => {
    if (this.session?.visibilityState !== "visible") this.resetInputs();
  };

  private detachSession() {
    this.session?.removeEventListener("end", this.onSessionEnded);
    this.session?.removeEventListener("visibilitychange", this.onVisibilityChanged);
    this.session = undefined;
  }

  private resetInputs() {
    this.controllerPressed.fill(false);
    this.spatialPanel?.resetInteractions();
    this.releaseGrab();
  }

  private restoreDesktopState() {
    if (this.savedWorldPosition) this.worldRoot.position.copy(this.savedWorldPosition);
    this.savedWorldPosition = undefined;
    if (this.desktopCamera && this.savedProjection) {
      this.desktopCamera.fov = this.savedProjection.fov;
      this.desktopCamera.zoom = this.savedProjection.zoom;
      this.desktopCamera.clearViewOffset();
      this.desktopCamera.updateProjectionMatrix();
    }
    this.savedProjection = undefined;
    if (this.savedBadge !== undefined) this.modeBadge.textContent = this.savedBadge;
    this.savedBadge = undefined;
    for (const { element, active } of this.savedModeClasses) element.classList.toggle("active", active);
    this.savedModeClasses = [];
    this.referenceHeightSettled = false;
    this.resetInputs();
    this.selectedHand = undefined;
    for (const source of [...this.hands, ...this.controllers]) source.visible = false;
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
      hand.addEventListener("connected", event => {
        if (this.selectedHand === hand && this.handSides.get(hand) !== event.data.handedness) {
          this.selectedHand = undefined;
          this.releaseGrab();
        }
        this.handSides.set(hand, event.data.handedness);
      });
      hand.addEventListener("disconnected", () => {
        this.spatialPanel?.releaseInteraction(`hand-${i}`);
        if (this.activeHand === hand) this.releaseGrab();
      });
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
        this.spatialPanel?.releaseInteraction(`controller-${i}`);
      });
      controller.addEventListener("disconnected", () => {
        this.controllerPressed[i] = false;
        this.spatialPanel?.releaseInteraction(`controller-${i}`);
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
      const sourceId = `controller-${i}`;
      if (!controller.visible) {
        this.controllerPressed[i] = false;
        this.spatialPanel.releaseInteraction(sourceId);
        continue;
      }
      controller.getWorldPosition(this.rayOrigin);
      controller.getWorldQuaternion(this.rayQuaternion);
      this.rayDirection.set(0, 0, -1).applyQuaternion(this.rayQuaternion).normalize();
      this.spatialPanel.interactRay(this.rayOrigin, this.rayDirection, this.controllerPressed[i], sourceId);
    }

    for (let i = 0; i < this.hands.length; i += 1) {
      const hand = this.hands[i];
      const sourceId = `hand-${i}`;
      const indexTip = hand.joints["index-finger-tip"];
      if (!hand.visible || !indexTip?.visible) {
        this.spatialPanel.releaseInteraction(sourceId);
        continue;
      }
      indexTip.getWorldPosition(this.directTouchPoint);
      this.spatialPanel.interactPoint(this.directTouchPoint, true, sourceId);
    }
  }

  private updateHandVisibility(activeHand?: HandGroup) {
    for (const [hand, model] of this.handModels) {
      model.visible = hand !== activeHand;
    }
    this.gripProxy?.setVisible(Boolean(activeHand));
  }

  private findFollowHand(): HandGroup | undefined {
    // Temporary tracking loss holds the last position, rather than moving the
    // container to the other hand that is operating the panel.
    if (this.selectedHand) {
      return this.getGripPose(this.selectedHand, this.gripWorldPosition) ? this.selectedHand : undefined;
    }
    this.selectedHand = this.hands.find(hand =>
      (this.preferredHand === "any" || this.handSides.get(hand) === this.preferredHand)
      && this.getGripPose(hand, this.gripWorldPosition)
    );
    return this.selectedHand;
  }

  private getGripPose(hand: HandGroup, outPosition: THREE.Vector3) {
    const wrist = hand.joints["wrist"];
    if (!hand.visible || !wrist?.visible) {
      return false;
    }

    const thumbTip = hand.joints["thumb-tip"]?.visible ? hand.joints["thumb-tip"] : undefined;
    const indexTip = hand.joints["index-finger-tip"]?.visible ? hand.joints["index-finger-tip"] : undefined;
    const middleTip = hand.joints["middle-finger-tip"]?.visible ? hand.joints["middle-finger-tip"] : undefined;
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
