// Session lifecycle and tracked-input regression tests; no WebGL, XR device or service.
// Run from webxr: node --test tests/webxr-bridge.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { setImmediate as turn } from "node:timers/promises";
import { build } from "esbuild";
import { Group, PerspectiveCamera, Scene, Vector3 } from "three";

const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../src/xr/WebXrBridge.ts", import.meta.url))],
  bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent"
});
const { WebXrBridge } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

class Element extends EventTarget {
  textContent = "";
  title = "";
  disabled = false;
  style = {};
  attributes = {};
  adjacent = [];
  classes = new Set();
  classList = {
    contains: name => this.classes.has(name),
    add: name => this.classes.add(name),
    remove: name => this.classes.delete(name),
    toggle: (name, active) => active ? this.classes.add(name) : this.classes.delete(name)
  };
  click() { if (!this.disabled) this.dispatchEvent(new Event("click")); }
  setAttribute(name, value) { this.attributes[name] = value; }
  insertAdjacentElement(position, element) { this.adjacent.push(element); return element; }
}

class Session extends EventTarget {
  visibilityState = "visible";
  endCalls = 0;
  ended = false;
  async end() {
    this.endCalls++;
    if (this.endError) throw this.endError;
    this.ended = true;
    if (this.xr) this.xr.isPresenting = false;
    this.dispatchEvent(new Event("end"));
  }
}

function fixture(t, { supported = true } = {}) {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const previousDocument = globalThis.document;
  const requests = [];
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: supported ? {
    xr: {
      requestSession(mode, options) {
        const pending = deferred();
        requests.push({ mode, options, ...pending });
        return pending.promise;
      }
    }
  } : {} });
  const modes = new Map(["#hand-mode-button", "#touch-mode-button", "#tilt-mode-button"].map(id => [id, new Element()]));
  modes.get("#touch-mode-button").classList.add("active");
  globalThis.document = { querySelector: selector => modes.get(selector) ?? null, createElement: () => new Element() };
  t.after(() => {
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
    else delete globalThis.navigator;
    globalThis.document = previousDocument;
  });
  const scene = new Scene();
  const world = new Group();
  world.position.set(0.1, 0.2, 0.3);
  scene.add(world);
  const container = new Group();
  container.position.set(0, 0.85, -0.72);
  container.rotation.set(0.2, 0, -0.3);
  container.userData.deviceState = { preset: "granular_sand_box", massX: 0.3, massY: -1 };
  world.add(container);
  const camera = new PerspectiveCamera(52, 1.5, 0.01, 20);
  camera.zoom = 1.2;
  camera.setViewOffset(1200, 800, -200, 0, 1200, 800);
  const xrCamera = new PerspectiveCamera();
  xrCamera.position.y = 1.65;
  const hands = [], controllers = [], references = [];
  const xr = {
    enabled: false, isPresenting: false, setSessionCalls: [], setupGate: null, setupError: null,
    setReferenceSpaceType(value) { references.push(value); },
    getCamera() { return xrCamera; },
    getHand(i) {
      if (!hands[i]) {
        const hand = new Group();
        hand.visible = false;
        hand.joints = {};
        hands[i] = hand;
      }
      return hands[i];
    },
    getController(i) {
      if (!controllers[i]) { controllers[i] = new Group(); controllers[i].visible = false; }
      return controllers[i];
    },
    async setSession(session) {
      assert.equal(hands.length, 2, "input slots must be ready before XR session setup");
      assert.equal(controllers.length, 2);
      this.setSessionCalls.push(session);
      session.xr = this;
      if (this.setupGate) await this.setupGate.promise;
      if (this.setupError) throw this.setupError;
      if (session.ended) return;
      this.isPresenting = true;
      // This is what Three's WebXRManager does to the ordinary user camera.
      camera.fov = 94;
      camera.zoom = 1;
    }
  };
  const calls = [];
  const panel = {
    resetCount: 0,
    resetInteractions() { this.resetCount++; calls.push({ kind: "reset" }); },
    releaseInteraction(sourceId) { calls.push({ kind: "release", sourceId }); },
    interactRay(origin, direction, pressed, sourceId) { calls.push({ kind: "ray", pressed, sourceId, origin: origin.toArray(), direction: direction.toArray() }); },
    interactPoint(point, pressed, sourceId) { calls.push({ kind: "point", pressed, sourceId, point: point.toArray() }); }
  };
  const grip = { visible: false, setVisible(value) { this.visible = value; } };
  const badge = new Element();
  badge.textContent = "Preview";
  const button = new Element();
  button.textContent = "Enter MR";
  const bridge = new WebXrBridge({ xr }, scene, world, container, badge, panel, grip, camera);
  bridge.installButton(button);
  const enter = async () => {
    button.click();
    const session = new Session();
    requests.at(-1).resolve(session);
    await turn();
    return session;
  };
  const joint = (hand, name, position = [0, 0, 0]) => {
    const node = new Group();
    node.position.fromArray(position);
    hand.joints[name] = node;
    hand.add(node);
    return node;
  };
  return { bridge, xr, xrCamera, world, camera, container, hands, controllers, panel, calls, grip, badge, button, requests, references, modes, enter, joint };
}

test("no XR capability disables the button without requesting a session", t => {
  const { button, requests } = fixture(t, { supported: false });
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, "No XR");
  button.click();
  assert.deepEqual(requests, []);
});

test("user click requests MR immediately; success is shown only after renderer setup", async t => {
  const { button, badge, requests, xr, references, camera, modes } = fixture(t);
  xr.setupGate = deferred();
  button.click();
  assert.equal(requests.length, 1, "requestSession must run during the original click, without an async support-probe click proxy");
  assert.equal(requests[0].mode, "immersive-ar");
  assert.deepEqual(requests[0].options.requiredFeatures, ["local-floor"]);
  assert.ok(requests[0].options.optionalFeatures.includes("hand-tracking"));
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, "Entering MR…");
  assert.equal(badge.textContent, "Preview");
  button.click();
  assert.equal(requests.length, 1);
  const session = new Session();
  requests[0].resolve(session);
  await turn();
  assert.equal(xr.setSessionCalls.length, 1);
  assert.equal(button.textContent, "Entering MR…");
  assert.equal(badge.textContent, "Preview");
  assert.equal(camera.view.enabled, false);
  xr.setupGate.resolve();
  await turn();
  assert.equal(button.textContent, "Exit MR");
  assert.equal(button.disabled, false);
  assert.equal(badge.textContent, "Quest MR");
  assert.ok(references.every(value => value === "local-floor"));
  assert.equal(modes.get("#hand-mode-button").classList.contains("active"), true);
  await session.end();
});

test("permission denial remains truthful and the next explicit click can retry", async t => {
  const { button, badge, requests, enter, world } = fixture(t);
  const original = world.position.toArray();
  button.click();
  requests[0].reject(new Error("Permission denied"));
  await turn();
  assert.equal(button.textContent, "MR failed — Retry");
  assert.match(button.title, /Permission denied/);
  assert.match(button.adjacent[0].textContent, /Permission denied/);
  assert.equal(button.adjacent[0].attributes["aria-live"], "polite");
  assert.equal(button.disabled, false);
  assert.equal(badge.textContent, "Preview");
  assert.deepEqual(world.position.toArray(), original);
  const session = await enter();
  assert.equal(requests.length, 2);
  assert.equal(button.textContent, "Exit MR");
  assert.equal(button.adjacent[0].textContent, "");
  await session.end();
});

test("renderer initialization failure ends the accepted session and allows retry", async t => {
  const { xr, button, badge, requests, camera, enter } = fixture(t);
  xr.setupError = new Error("XR layer initialization failed");
  button.click();
  const failed = new Session();
  requests[0].resolve(failed);
  await turn();
  assert.equal(failed.endCalls, 1);
  assert.equal(failed.ended, true);
  assert.equal(button.textContent, "MR failed — Retry");
  assert.match(button.title, /layer initialization/);
  assert.equal(badge.textContent, "Preview");
  assert.equal(camera.fov, 52);
  assert.equal(camera.zoom, 1.2);
  xr.setupError = null;
  const retried = await enter();
  assert.equal(button.textContent, "Exit MR");
  await retried.end();
});

test("actual end restores world/projection/input state and re-entry recalculates reference height", async t => {
  const { bridge, button, badge, world, camera, xrCamera, controllers, panel, modes, container, enter } = fixture(t);
  const originalWorld = world.position.toArray();
  const originalRotation = container.quaternion.toArray();
  const device = structuredClone(container.userData.deviceState);
  const first = await enter();
  xrCamera.position.y = 0;
  bridge.update();
  assert.equal(world.position.y, -1.55);
  controllers[0].visible = true;
  controllers[0].dispatchEvent({ type: "selectstart" });
  const resets = panel.resetCount;
  await first.end();
  assert.equal(button.textContent, "Enter MR");
  assert.equal(button.disabled, false);
  assert.equal(badge.textContent, "Preview");
  assert.deepEqual(world.position.toArray(), originalWorld);
  assert.equal(camera.fov, 52);
  assert.equal(camera.zoom, 1.2);
  assert.equal(camera.view.enabled, false);
  assert.equal(controllers[0].visible, false);
  assert.ok(panel.resetCount > resets);
  assert.equal(modes.get("#touch-mode-button").classList.contains("active"), true);
  assert.equal(modes.get("#hand-mode-button").classList.contains("active"), false);
  assert.deepEqual(container.quaternion.toArray(), originalRotation);
  assert.deepEqual(container.userData.deviceState, device);
  xrCamera.position.y = 1.7;
  const second = await enter();
  bridge.update();
  assert.equal(world.position.y, 0, "the first session's reference-height decision must not survive re-entry");
  await second.end();
  assert.deepEqual(world.position.toArray(), originalWorld);
  assert.equal(camera.fov, 52);
});

test("the visible Exit button requests end; failed end does not falsely report desktop mode", async t => {
  const { button, badge, xr, enter } = fixture(t);
  const session = await enter();
  session.endError = new Error("Session still active");
  button.click();
  await turn();
  assert.equal(session.endCalls, 1);
  assert.equal(xr.isPresenting, true);
  assert.equal(button.textContent, "Exit MR");
  assert.equal(button.disabled, false);
  assert.match(button.title, /Session still active/);
  assert.match(button.adjacent[0].textContent, /Session still active/);
  assert.equal(badge.textContent, "Quest MR");
  session.endError = null;
  button.click();
  await turn();
  assert.equal(xr.isPresenting, false);
  assert.equal(button.textContent, "Enter MR");
  assert.equal(badge.textContent, "Preview");
});

test("separate source IDs, lost tracking, selectend and hidden sessions release only relevant input", async t => {
  const { bridge, hands, controllers, calls, panel, joint, enter } = fixture(t);
  const session = await enter();
  for (const hand of hands) {
    hand.visible = true;
    joint(hand, "wrist");
    joint(hand, "index-finger-tip");
  }
  controllers.forEach(controller => { controller.visible = true; });
  controllers[0].dispatchEvent({ type: "selectstart" });
  calls.length = 0;
  bridge.update();
  assert.deepEqual(calls.filter(call => call.kind === "ray").map(call => [call.sourceId, call.pressed]), [["controller-0", true], ["controller-1", false]]);
  assert.deepEqual(calls.filter(call => call.kind === "point").map(call => call.sourceId), ["hand-0", "hand-1"]);
  controllers[0].visible = false;
  hands[0].joints["index-finger-tip"].visible = false;
  calls.length = 0;
  bridge.update();
  assert.ok(calls.some(call => call.kind === "release" && call.sourceId === "controller-0"));
  assert.ok(calls.some(call => call.kind === "release" && call.sourceId === "hand-0"));
  assert.ok(!calls.some(call => call.kind === "point" && call.sourceId === "hand-0"));
  controllers[0].visible = true;
  calls.length = 0;
  bridge.update();
  assert.equal(calls.find(call => call.kind === "ray" && call.sourceId === "controller-0").pressed, false);
  controllers[1].dispatchEvent({ type: "selectend" });
  hands[1].dispatchEvent({ type: "disconnected" });
  assert.ok(calls.some(call => call.kind === "release" && call.sourceId === "controller-1"));
  assert.ok(calls.some(call => call.kind === "release" && call.sourceId === "hand-1"));
  const resets = panel.resetCount;
  session.visibilityState = "hidden";
  session.dispatchEvent(new Event("visibilitychange"));
  calls.length = 0;
  bridge.update();
  assert.ok(panel.resetCount > resets);
  assert.ok(!calls.some(call => call.kind === "ray" || call.kind === "point"));
  await session.end();
});

test("default hand follow acquires a distant hand without a pinch and never compounds device tilt", async t => {
  const { bridge, world, container, hands, joint, grip, enter } = fixture(t);
  const session = await enter();
  world.position.set(0, 0, 0);
  const hand = hands[0];
  hand.visible = true;
  const center = container.getWorldPosition(new Vector3()).add(new Vector3(0.6, 0.4, 0.2));
  const wrist = joint(hand, "wrist", center.clone().add(new Vector3(0, -0.05, 0.04)).toArray());
  wrist.rotation.set(0.7, 1.1, -0.9);
  joint(hand, "thumb-tip", center.clone().add(new Vector3(-0.03, 0, 0)).toArray());
  joint(hand, "index-finger-tip", center.clone().add(new Vector3(0.03, 0, 0)).toArray());
  joint(hand, "middle-finger-tip", center.clone().add(new Vector3(0, 0, -0.04)).toArray());
  const rotation = container.quaternion.toArray();
  const position = container.position.clone();
  bridge.update();
  assert.ok(container.position.distanceTo(position) > 0.5);
  assert.ok(container.getWorldPosition(new Vector3()).distanceTo(center) < 1e-9);
  assert.deepEqual(container.quaternion.toArray(), rotation);
  assert.equal(grip.visible, true);
  hand.visible = false;
  bridge.update();
  assert.equal(grip.visible, false);
  await session.end();
});

test("tracking loss holds position and the selected hand reacquires instead of switching to the panel hand", async t => {
  const { bridge, container, hands, joint, grip, enter } = fixture(t);
  const session = await enter();
  hands[0].visible = true;
  const wrist = joint(hands[0], "wrist", [0.4, 1.2, -0.5]);
  bridge.update();
  hands[1].visible = true;
  joint(hands[1], "wrist", [-0.4, 1.1, -0.6]);
  hands[0].visible = false;
  const held = container.position.clone();
  bridge.update();
  assert.deepEqual(container.position.toArray(), held.toArray());
  assert.equal(grip.visible, false);
  session.visibilityState = "hidden";
  session.dispatchEvent(new Event("visibilitychange"));
  session.visibilityState = "visible";
  bridge.update();
  assert.deepEqual(container.position.toArray(), held.toArray(), "visibility pause must not select the other hand");
  hands[0].visible = true;
  wrist.position.x = 0.7;
  bridge.update();
  assert.ok(container.getWorldPosition(new Vector3()).distanceTo(wrist.getWorldPosition(new Vector3())) < 1e-9);
  assert.equal(grip.visible, true);
  await session.end();
});

test("explicit handedness chooses the grip hand regardless of XR input slot order", async t => {
  const { bridge, container, hands, joint, enter } = fixture(t);
  bridge.setPreferredHand("right");
  const session = await enter();
  for (const [index, side] of ["left", "right"].entries()) {
    hands[index].dispatchEvent({ type: "connected", data: { handedness: side } });
    joint(hands[index], "wrist", [index === 0 ? -0.4 : 0.4, 1.2, -0.5]);
  }
  hands[0].visible = true;
  const held = container.position.clone();
  bridge.update();
  assert.deepEqual(container.position.toArray(), held.toArray(), "do not fall back to the other side while the preferred hand is absent");
  hands[1].visible = true;
  bridge.update();
  assert.ok(container.getWorldPosition(new Vector3()).distanceTo(new Vector3(0.4, 1.2, -0.5)) < 1e-9);
  bridge.setPreferredHand("left");
  bridge.update();
  assert.ok(container.getWorldPosition(new Vector3()).distanceTo(new Vector3(-0.4, 1.2, -0.5)) < 1e-9);
  await session.end();
});
