// Shortcut/controller-boundary tests without a browser, hardware or rendering.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const bundle = await build({ entryPoints: [fileURLToPath(new URL("../src/input/DemoKeyboard.ts", import.meta.url))],
  bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
  plugins: [{ name: "no-output-dependencies", setup(builder) {
    builder.onResolve({ filter: /HapticLink|deviceDemo|PreviewEngine/ }, () => {
      throw new Error("Keyboard shortcuts must use existing UI controls, not output/model APIs");
    });
  } }] });
const { DemoKeyboard } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

class Element {
  disabled = false; hidden = false; inert = false; value = ""; parentElement = null;
  options = []; attributes = {}; dataset = {};
  constructor(tag = "button", id = "") { this.tagName = tag.toUpperCase(); this.id = id; }
  get selectedIndex() { return this.options.findIndex(option => option.value === this.value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  matches(selector) {
    return selector.split(",").some(part => {
      const s = part.trim();
      if (s.startsWith("#")) return this.id === s.slice(1);
      if (s === ":disabled") return this.disabled || (this.parentElement?.tagName === "FIELDSET" && this.parentElement.disabled);
      if (s === "[hidden]") return this.hidden;
      if (s === "[inert]") return this.inert;
      if (s === 'a[href]') return this.tagName === "A" && this.attributes.href !== undefined;
      if (s === '[contenteditable]:not([contenteditable="false"])') {
        return this.attributes.contenteditable !== undefined && this.attributes.contenteditable !== "false";
      }
      const attr = s.match(/^\[([^=]+)="([^"]*)"\]$/);
      if (attr) return this.attributes[attr[1]] === attr[2];
      return this.tagName === s.toUpperCase();
    });
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
  click() { if (!this.matches(":disabled")) this.onclick?.(); }
  dispatchEvent(event) { this[`on${event.type}`]?.(event); return true; }
}

function fixture() {
  let mode = "preview";
  const elements = new Map(), calls = [], listeners = new Set();
  const body = new Element("body");
  const element = (id, tag = "button") => {
    if (!elements.has(id)) {
      const control = new Element(tag, id); control.parentElement = body;
      control.onclick = () => calls.push(["click", id]);
      elements.set(id, control);
    }
    return elements.get(id);
  };
  const select = (id, names) => {
    const control = element(id, "select");
    control.options = names.map(value => { const option = new Element("option"); option.value = value; return option; });
    control.value = names[0];
    control.onchange = event => calls.push(["change", id, control.value, event.bubbles]);
    return control;
  };
  const device = select("device-preset", Array.from({ length: 12 }, (_, i) => `device-${i + 1}`));
  const preview = select("preset-select", Array.from({ length: 12 }, (_, i) => `preview-${i + 1}`));
  const stimulus = select("stimulus-select", ["manual", "gentle_roll", "wall_tap"]);
  const labButtons = Array.from({ length: 12 }, (_, index) => {
    const button = element(`lab-material-${index + 1}`); button.dataset.labPreset = `lab-${index + 1}`;
    button.setAttribute("aria-pressed", index === 0);
    button.onclick = () => {
      calls.push(["lab-preset", button.dataset.labPreset]);
      labButtons.forEach(candidate => candidate.setAttribute("aria-pressed", candidate === button));
    };
    return button;
  });
  element("device-start").disabled = true;
  element("device-stop").disabled = true;
  const pause = element("lab-pause"); pause.setAttribute("aria-pressed", false);
  pause.onclick = () => { calls.push(["click", "lab-pause"]); pause.setAttribute("aria-pressed", pause.getAttribute("aria-pressed") !== "true"); };
  for (const [id, min, max] of [["lab-roll", -60, 60], ["lab-pitch", -35, 35]]) {
    const slider = element(id, "input"); slider.min = String(min); slider.max = String(max); slider.value = "0";
    slider.oninput = event => calls.push(["input", id, slider.value, event.bubbles]);
  }
  const document = {
    getElementById: id => elements.get(id) ?? null,
    querySelectorAll: selector => { assert.equal(selector, "[data-lab-preset]"); return labButtons; },
    addEventListener: (name, listener, capture) => { assert.equal(name, "keydown"); assert.equal(capture, true); listeners.add(listener); },
    removeEventListener: (name, listener, capture) => { assert.equal(name, "keydown"); assert.equal(capture, true); listeners.delete(listener); }
  };
  element("lab-reset"); element("lab-shake");
  const keyboard = new DemoKeyboard(document, () => mode);
  function key(key, options = {}) {
    const target = options.target ?? body;
    const path = []; for (let current = target; current; current = current.parentElement) path.push(current);
    const event = { key, repeat: false, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false,
      isComposing: false, keyCode: 0, defaultPrevented: false, target,
      composedPath: () => path, preventDefault() { this.defaultPrevented = true; }, ...options };
    for (const listener of listeners) listener(event);
    return event;
  }
  return { element, key, calls, device, preview, stimulus, pause, labButtons, keyboard,
    mode: value => { mode = value; },
    connected: () => { mode = "device"; element("device-start").disabled = false; element("device-stop").disabled = false; } };
}

test("preview selection and Space use only the preview controls", () => {
  const f = fixture();
  assert.equal(f.key("2").defaultPrevented, true);
  f.key(" "); f.key(" ");
  for (const key of ["Enter", "Escape", "r", "s", "ArrowRight"]) f.key(key);
  assert.deepEqual(f.calls, [["change", "preset-select", "preview-2", true],
    ["change", "stimulus-select", "wall_tap", true], ["change", "stimulus-select", "manual", true]]);
  assert.equal(f.device.value, "device-1");
});

test("mode routing follows the current source on every key without falling back from device mode", () => {
  const f = fixture(); f.connected(); f.key("2");
  f.element("device-start").disabled = true; f.device.disabled = true; // stale/pending controls
  f.key("3"); f.key("Enter"); f.key(" ");
  f.mode("lab"); f.element("device-stop").disabled = true; f.key("2"); f.key(" ");
  f.mode("preview"); f.key("2");
  assert.deepEqual(f.calls, [["change", "device-preset", "device-2", true],
    ["lab-preset", "lab-2"], ["click", "lab-pause"], ["change", "preset-select", "preview-2", true]]);
});

test("Enter is an explicit enabled Start and Escape preserves priority Stop during pending work", () => {
  const f = fixture(); f.connected();
  f.element("device-start").onclick = () => {
    f.calls.push(["click", "device-start"]);
    f.element("device-start").disabled = true; f.device.disabled = true;
  };
  f.key("Enter"); f.key("Enter"); f.key("4");
  const stop = f.key("Escape", { target: f.element("typing", "input"), defaultPrevented: true });
  assert.equal(stop.defaultPrevented, true);
  assert.deepEqual(f.calls, [["click", "device-start"], ["click", "device-stop"]]);
});

test("0 selects item ten and brackets reach all later items and wrap in every material list", () => {
  for (const mode of ["preview", "device", "lab"]) {
    const f = fixture(); f.mode(mode);
    f.key("0"); f.key("]"); f.key("]"); f.key("]"); f.key("[");
    const values = f.calls.map(call => call[0] === "lab-preset" ? call[1] : call[2]);
    const prefix = mode === "device" ? "device" : mode === "lab" ? "lab" : "preview";
    assert.deepEqual(values, [10, 11, 12, 1, 12].map(index => `${prefix}-${index}`));
  }
});

test("disabled options keep their numeric position and brackets skip unavailable entries", () => {
  const f = fixture(); f.connected();
  f.device.options[1].disabled = true;
  f.key("2"); assert.deepEqual(f.calls, []);
  f.key("]"); assert.equal(f.device.value, "device-3");
  f.labButtons[1].disabled = true; f.mode("lab");
  f.key("2"); f.key("]");
  assert.deepEqual(f.calls.at(-1), ["lab-preset", "lab-3"]);
});

test("unknown selections, empty lists and unavailable controls do not produce invalid changes", () => {
  const f = fixture(); f.preview.value = "unknown";
  f.key("["); assert.equal(f.preview.value, "preview-12");
  f.preview.value = "unknown"; f.key("]"); assert.equal(f.preview.value, "preview-1");
  f.calls.length = 0; f.preview.options = [];
  f.key("1"); f.key("["); f.key("]");
  f.preview.setAttribute("aria-disabled", "true"); f.key("2");
  f.mode("lab"); f.labButtons.forEach(button => { button.hidden = true; }); f.key("]");
  assert.deepEqual(f.calls, []);
});

test("Escape pauses Lab idempotently and never resumes it; Space explicitly toggles", () => {
  const f = fixture(); f.mode("lab");
  f.key("Escape"); f.key("Escape");
  assert.equal(f.pause.getAttribute("aria-pressed"), "true");
  assert.equal(f.calls.length, 1);
  f.key(" "); assert.equal(f.pause.getAttribute("aria-pressed"), "false");
  f.element("device-stop").disabled = false;
  f.key("Escape");
  assert.deepEqual(f.calls.at(-1), ["click", "device-stop"]);
  assert.equal(f.pause.getAttribute("aria-pressed"), "false", "available device Stop takes precedence over Lab");
});

test("Lab arrows change bounded existing sliders and R/S use reset/shake buttons", () => {
  const f = fixture(); f.mode("lab");
  f.key("ArrowRight"); f.key("ArrowUp"); f.key("r"); f.key("s");
  assert.deepEqual(f.calls, [["input", "lab-roll", "5", true], ["input", "lab-pitch", "-5", true],
    ["click", "lab-reset"], ["click", "lab-shake"]]);
  f.element("lab-roll").value = "59"; f.key("ArrowRight"); assert.equal(f.element("lab-roll").value, "60");
  f.element("lab-pitch").value = "-34"; f.key("ArrowUp"); assert.equal(f.element("lab-pitch").value, "-35");
  f.calls.length = 0; f.element("lab-roll").disabled = true; f.element("lab-shake").disabled = true;
  f.key("ArrowLeft"); f.key("s"); assert.deepEqual(f.calls, []);
});

test("typing, editable ancestors and custom inputs retain their keys; Escape still stops", () => {
  const f = fixture(); f.connected();
  const targets = [f.element("text", "input"), f.element("notes", "textarea"), f.device];
  const editor = f.element("editor", "div"); editor.setAttribute("contenteditable", "true");
  const nested = f.element("nested", "span"); nested.parentElement = editor; targets.push(nested);
  const custom = f.element("custom", "div"); custom.setAttribute("role", "textbox"); targets.push(custom);
  for (const target of targets) for (const key of ["1", "]", "Enter", " ", "r", "ArrowRight"]) {
    assert.equal(f.key(key, { target }).defaultPrevented, false);
  }
  assert.deepEqual(f.calls, []);
  f.key("Escape", { target: nested }); assert.deepEqual(f.calls, [["click", "device-stop"]]);
});

test("modifiers, IME, held keys and prior consumption do not trigger shortcuts", () => {
  const f = fixture(); f.connected();
  for (const flag of ["ctrlKey", "metaKey", "altKey", "shiftKey", "isComposing", "repeat"]) {
    for (const key of ["Enter", "Escape", "3", "]", " "]) f.key(key, { [flag]: true });
  }
  f.key("Escape", { keyCode: 229 }); f.key("Enter", { keyCode: 229 });
  f.key("Enter", { defaultPrevented: true }); f.key("1", { defaultPrevented: true });
  assert.deepEqual(f.calls, []);
});

test("focused native controls do not also run a shortcut and Space never activates physical Start", () => {
  const f = fixture(); f.connected();
  const start = f.element("device-start"), stop = f.element("device-stop");
  assert.equal(f.key(" ", { target: start }).defaultPrevented, true);
  assert.equal(f.key(" ", { target: start, repeat: true }).defaultPrevented, true);
  assert.equal(f.key("Enter", { target: start, repeat: true }).defaultPrevented, true);
  assert.equal(f.key("Enter", { target: start }).defaultPrevented, false, "a deliberate native Enter still works");
  assert.equal(f.key("Enter", { target: stop }).defaultPrevented, false, "native Stop is preserved");
  assert.equal(f.key(" ", { target: stop }).defaultPrevented, false);
  f.mode("lab"); assert.equal(f.key(" ", { target: f.pause }).defaultPrevented, false);
  assert.deepEqual(f.calls, [], "native controls will perform their default activation once, outside the shortcut");
});

test("XR ignores demonstration shortcuts except available Stop; dispose removes the listener", () => {
  const f = fixture(); f.mode("xr"); f.element("device-stop").disabled = false;
  for (const key of ["Enter", "1", "]", " ", "r", "s", "ArrowRight"]) f.key(key);
  f.key("Escape"); assert.deepEqual(f.calls, [["click", "device-stop"]]);
  f.keyboard.dispose(); f.key("Escape"); assert.equal(f.calls.length, 1);
});
