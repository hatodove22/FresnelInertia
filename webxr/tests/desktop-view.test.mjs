import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Euler, PerspectiveCamera, Vector3 } from "three";

const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../src/renderer/desktopView.ts", import.meta.url))],
  bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent"
});
const { frameDesktopContainer } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

test("desktop close-up and panel offset retain their existing distance", () => {
  const target = new Vector3(0.12, 0.85, -0.72);
  const camera = new PerspectiveCamera(52, 1440 / 1000, 0.01, 20);
  frameDesktopContainer(camera, target, new Vector3(0.06, 0.06, 0.06), { width: 1440, height: 1000 }, 0.18);
  assert.deepEqual(camera.position.toArray(), [target.x, target.y + 0.18 * 0.38, target.z + 0.18]);
  assert.equal(camera.view.offsetX, -215);
  assert.equal(camera.view.offsetY, 0);
});

test("narrow framing contains tilted marble, liquid, sand and hybrid corners above the HUD", () => {
  const target = new Vector3(0, 0.86, -0.72);
  for (const [width, height] of [[390, 844], [320, 740], [520, 844]]) {
    for (const spans of [[0.05, 0.05, 0.05], [0.06, 0.06, 0.06], [0.06, 0.06, 0.04], [0.07, 0.07, 0.09]]) {
      const size = new Vector3(...spans);
      const camera = new PerspectiveCamera(52, width / height, 0.01, 20);
      frameDesktopContainer(camera, target, size, { width, height }, Math.max(0.18, Math.max(...spans) * 2.8));
      camera.updateMatrixWorld();
      for (const [pitch, roll] of [[0, 0.59], [0.7, -0.8], [-0.7, 1.3], [0, 0]]) {
        for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
          const corner = new Vector3(x * size.x, y * size.y, z * size.z)
            .applyEuler(new Euler(pitch, 0, roll)).add(target).project(camera);
          assert.ok(Math.abs(corner.x) <= 0.92 + 1e-9, `horizontal clipping: ${width}x${height}, ${spans}, x=${corner.x}`);
          assert.ok(corner.y <= 0.96 + 1e-9 && corner.y >= -0.04 - 1e-9, `vertical clipping/occlusion: y=${corner.y}`);
        }
      }
    }
  }
});
