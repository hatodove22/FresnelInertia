// Structural UI contracts without a browser, hardware or DOM dependency.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const root = { tag: "document", attributes: {}, parent: null };
const stack = [root], nodes = [];

// This page is static HTML. Keep ancestry instead of matching nested sections
// with a regex, so moving Stop into a scroll region or details is detected.
for (const match of html.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<(\/?)([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
  const [, closing, tagName, source] = match;
  const tag = tagName.toLowerCase();
  if (closing) {
    assert.equal(stack.at(-1).tag, tag, `HTML closing tag </${tag}> must match its parent`);
    stack.pop();
    continue;
  }
  const attributes = Object.fromEntries([...source.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)]
    .map(([, name, doubleQuoted, singleQuoted, unquoted]) => [name.toLowerCase(), doubleQuoted ?? singleQuoted ?? unquoted ?? ""]));
  const node = { tag, attributes, parent: stack.at(-1) };
  nodes.push(node);
  if (!voidTags.has(tag)) stack.push(node);
}
assert.equal(stack.length, 1, "All non-void HTML elements must be closed");

const hasClass = (node, name) => (node.attributes.class ?? "").split(/\s+/).includes(name);
const ancestor = (node, predicate) => {
  for (let current = node.parent; current; current = current.parent) if (predicate(current)) return current;
  return null;
};
const inClass = (node, name) => ancestor(node, parent => hasClass(parent, name));
const byId = id => {
  const matches = nodes.filter(node => node.attributes.id === id);
  assert.equal(matches.length, 1, `Exactly one #${id} is required`);
  return matches[0];
};
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, declarations]) => ({
  selectors: selectors.split(",").map(selector => selector.trim()),
  declarations: Object.fromEntries([...declarations.matchAll(/([\w-]+)\s*:\s*([^;]+);?/g)]
    .map(([, property, value]) => [property, value.trim()]))
}));
const declaration = (selector, property) => rules.filter(rule => rule.selectors.includes(selector) && property in rule.declarations)
  .at(-1)?.declarations[property];

test("each action has one DOM owner and duplicate tilt/MR proxies are absent", () => {
  const ids = nodes.map(node => node.attributes.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, "Duplicate IDs must never split event/controller ownership");
  for (const id of ["orientation-button", "hand-mode-button"]) assert.equal(ids.includes(id), false);
  for (const id of ["touch-mode-button", "tilt-mode-button", "xr-button", "quest-button", "reset-button",
    "device-connect", "device-start", "device-stop", "device-clear", "device-preview", "device-apply-fill",
    "lab-open", "lab-close", "lab-sweep", "lab-shake", "lab-reset", "lab-pause", "sound-toggle"]) {
    const button = byId(id);
    assert.equal(button.tag, "button", `${id} remains a native keyboard action`);
    assert.equal(button.attributes.type, "button");
  }
});

test("optional physics load status is visible to every mode, outside mode-specific or collapsed controls", () => {
  const status = byId("presentation-status");
  assert.equal(status.attributes.role, "status");
  assert.equal(inClass(status, "preview-controls"), null);
  assert.equal(inClass(status, "device-session"), null);
  assert.equal(ancestor(status, node => node.attributes.id === "offline-lab" || node.tag === "details"), null);
});

test("material pickers belong to exclusive device, preview and Lab sources", () => {
  const preview = byId("preset-select"), device = byId("device-preset");
  assert.equal(preview.tag, "select");
  assert.equal(device.tag, "select");
  assert.ok(inClass(preview, "preview-controls"));
  assert.equal(inClass(preview, "device-session"), null);
  assert.equal(ancestor(preview, node => node.tag === "details"), null, "The preview material picker is a primary action");
  assert.ok(inClass(device, "device-session"));
  assert.equal(inClass(device, "preview-controls"), null);
  assert.equal(ancestor(device, node => node.tag === "details"), null, "The device material picker is a primary action");
  const lab = byId("offline-lab");
  assert.ok("hidden" in lab.attributes, "Lab starts inactive");
  const labPresets = nodes.filter(node => "data-lab-preset" in node.attributes);
  assert.ok(labPresets.length > 0);
  for (const button of labPresets) assert.equal(ancestor(button, node => node === lab), lab);
  assert.equal(declaration(".device-session", "display"), "none");
  assert.equal(declaration(".device-connected .device-session", "display"), "block");
  assert.equal(declaration(".device-connected .preview-controls", "display"), "none");
  assert.equal(declaration(".offline-lab-active .preview-controls", "display"), "none");
  assert.equal(declaration(".offline-lab-active .device-panel", "display"), "none");
});

test("physical Start and Stop remain outside scrolling content and every disclosure", () => {
  const start = byId("device-start"), stop = byId("device-stop");
  const actions = inClass(start, "device-run-actions");
  assert.ok(actions);
  assert.equal(inClass(stop, "device-run-actions"), actions);
  assert.ok(hasClass(actions.parent, "hud"), "The output actions are a direct HUD child");
  for (const button of [start, stop]) {
    assert.equal(inClass(button, "hud-scroll"), null, "Output actions must remain visible when the settings scroll");
    assert.equal(ancestor(button, node => node.tag === "details"), null);
    assert.equal(ancestor(button, node => "hidden" in node.attributes || "inert" in node.attributes), null);
  }
  assert.equal(declaration(".hud > .device-run-actions", "display"), "none");
  assert.equal(declaration(".device-connected .hud > .device-run-actions", "display"), "flex");
  assert.equal(declaration(".device-connected .hud > .device-run-actions", "flex-shrink"), "0");
});

test("servo recovery is reachable without opening settings", () => {
  const clear = byId("device-clear");
  assert.ok(inClass(clear, "device-session"));
  assert.equal(inClass(clear, "device-settings"), null);
  assert.equal(ancestor(clear, node => node.tag === "details"), null);
  assert.match(clear.attributes.title, /停止.*再確認.*実機で開始/);
});

test("settings default closed while primary controls and input feedback stay exposed", () => {
  for (const className of ["transport-settings", "device-settings", "device-profile-settings", "preview-settings", "sound-settings", "lab-signals", "extra-tools"]) {
    const matches = nodes.filter(node => hasClass(node, className));
    assert.equal(matches.length, 1, `Exactly one ${className} disclosure is required`);
    assert.equal(matches[0].tag, "details");
    assert.equal("open" in matches[0].attributes, false, `${className} should not crowd the initial demo`);
  }
  assert.ok(inClass(byId("device-transport"), "transport-settings"));
  assert.ok(inClass(byId("stimulus-select"), "preview-settings"));
  assert.ok(inClass(byId("xr-button"), "extra-tools"));
  assert.equal(ancestor(byId("device-connect"), node => node.tag === "details"), null);
  assert.equal(ancestor(byId("sound-toggle"), node => node.tag === "details"), null);
  const feedback = byId("input-status");
  assert.equal(feedback.attributes.role, "status", "Tilt permission/result feedback is announced when it changes");
  assert.ok(inClass(feedback, "preview-controls"));
  assert.equal(ancestor(feedback, node => node.tag === "details"), null);
  assert.equal("hidden" in feedback.attributes, false);
  assert.notEqual(feedback.attributes["aria-hidden"], "true");
});
