import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { BufferAttribute, BufferGeometry, Matrix4, Vector3 } from "three";

const load = async path => {
  const result = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
};
const { SandSurfaceSampler } = await load("../src/renderer/SandSurfaceSampler.ts");
const { SandPileRenderer } = await load("../src/renderer/SandPileRenderer.ts");
const { ContainerGeometry } = await load("../src/renderer/ContainerGeometry.ts");
const close = (actual, expected, tolerance = 1e-8, label = "value") =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);

function triangleGeometry(points) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(points.flat()), 3));
  return geometry;
}
const planeY = (x, z) => 0.003 + x * 0.65 - z * 0.25;
const point = (x, z, height = planeY(x, z)) => [x, height, z];

test("surface sampler interpolates actual sloped triangles, shared edges and rebuilds after mesh changes", () => {
  const surface = triangleGeometry([
    point(-0.03, -0.02), point(0.03, -0.02), point(-0.03, 0.02),
    // Opposite winding is still a valid geometric height query.
    point(-0.03, 0.02), point(0.03, 0.02), point(0.03, -0.02),
  ]);
  surface.setDrawRange(0, 6);
  const sampler = new SandSurfaceSampler(surface, new Vector3(0.06, 0.06, 0.04));
  sampler.rebuild();
  for (const [x, z] of [[-0.021, -0.011], [0.019, 0.014], [0, 0], [-0.03, -0.02], [0.03, 0.02]]) {
    close(sampler.heightAt(x, z), planeY(x, z), 1e-8, "barycentric slope");
  }
  assert.equal(sampler.heightAt(0.04, 0), undefined);
  const positions = surface.getAttribute("position");
  for (let i = 0; i < positions.count; i++) positions.setY(i, positions.getY(i) + 0.004);
  positions.needsUpdate = true;
  sampler.rebuild();
  close(sampler.heightAt(0.01, -0.003), planeY(0.01, -0.003) + 0.004);
  surface.dispose();
});

test("surface sampler ignores unused drawRange storage, clears stale triangles and rejects degenerate projections", () => {
  const giant = [point(-0.04, -0.04, 0.9), point(0.05, -0.04, 0.9), point(0, 0.05, 0.9)];
  const surface = triangleGeometry([
    ...giant,
    point(-0.03, -0.02), point(0.03, -0.02), point(-0.03, 0.02),
    ...giant,
  ]);
  surface.setDrawRange(3, 3);
  const sampler = new SandSurfaceSampler(surface, new Vector3(0.08, 0.1, 0.08));
  sampler.rebuild();
  close(sampler.heightAt(-0.01, -0.005), planeY(-0.01, -0.005));
  assert.equal(sampler.heightAt(0.02, 0.01), undefined, "unused allocation must not become another surface");
  surface.setDrawRange(0, 0); sampler.rebuild();
  assert.equal(sampler.heightAt(-0.01, -0.005), undefined, "rebuild removes the previous surface");
  const positions = surface.getAttribute("position");
  [[0, 0, -0.02], [0, 0.01, 0], [0, 0.02, 0.02]].forEach((p, i) => positions.setXYZ(i, ...p));
  surface.setDrawRange(0, 3); sampler.rebuild();
  assert.equal(sampler.heightAt(0, 0), undefined, "a vertical/degenerate projection has no single height");
  surface.dispose();
});

const base = { massX: 0.2, massY: -0.5, velocityX: 0, velocityY: 0, energy: 0,
  fill: 0.35, pileSlope: 0.55, granularFlow: 0, phaseS: 0 };
function make(size = [0.06, 0.06, 0.04]) {
  const geometry = new ContainerGeometry({ preset: "granular_sand_pile_box", family: "Granular", visual_shape: "box",
    container: { span_x_m: size[0], span_y_m: size[1], span_z_m: size[2], fill: 0.35, particle_count: 0.9, particle_hardness: 0.35 } }, true);
  const renderer = new SandPileRenderer(geometry);
  return { renderer, volume: renderer.sandVolume,
    grains: renderer.group.getObjectByName("content-sand-grains"),
    body: renderer.group.getObjectByName("content-sand-body"),
    surface: renderer.group.getObjectByName("content-sand-surface") };
}
function snapshot(item) {
  return { grains: Array.from(item.grains.instanceMatrix.array),
    body: Array.from(item.volume.body.getAttribute("position").array),
    surface: Array.from(item.volume.surface.getAttribute("position").array) };
}
const grainPoses = item => Array.from({ length: item.grains.count }, (_, index) => {
  const matrix = new Matrix4().fromArray(item.grains.instanceMatrix.array, index * 16);
  const position = new Vector3().setFromMatrixPosition(matrix), scale = new Vector3().setFromMatrixScale(matrix);
  return { matrix, position, scale, visible: Math.max(scale.x, scale.y, scale.z) > 1e-7 };
});
function advance(item, frames, extra = {}, start = 0) {
  for (let i = 1; i <= frames; i++) item.renderer.update(Object.freeze({ ...base, ...extra, phaseS: start + i / 60 }));
}

test("resting retained slopes and first tilted samples are quiet despite advancing render/source clocks", () => {
  const resting = make(), firstFlow = make();
  try {
    resting.renderer.update(Object.freeze({ ...base, energy: 1 }));
    firstFlow.renderer.update(Object.freeze({ ...base, granularFlow: 1, velocityX: 1 }));
    const before = snapshot(resting);
    assert.deepEqual(snapshot(firstFlow), before, "an already tilted first sample cannot manufacture an avalanche");
    advance(resting, 60, { energy: 1 });
    assert.deepEqual(snapshot(resting), before, "residual energy or a retained slope cannot keep grains moving");
  } finally { resting.renderer.dispose(); firstFlow.renderer.dispose(); }
});

test("duplicate, missing and discontinuous source time hold grain poses and relief; stopped flow does not snap grains home", () => {
  const item = make();
  try {
    item.renderer.update(base);
    const initial = snapshot(item);
    advance(item, 18, { granularFlow: 0.8, velocityX: 0.7 });
    const moving = snapshot(item);
    assert.notDeepEqual(moving.grains, initial.grains);
    assert.notDeepEqual(moving.surface, initial.surface, "local erosion/deposition changes visible relief");
    for (let i = 0; i < 50; i++) item.renderer.update({ ...base, phaseS: 0.3, granularFlow: 1, velocityX: -1, energy: 1 });
    assert.deepEqual(snapshot(item), moving, "same source sample holds all visible state");
    item.renderer.update({ ...base, phaseS: 0.3 + 1 / 60 });
    assert.deepEqual(snapshot(item), moving, "ending flow retains the transported grains and deposit");
    item.renderer.update({ ...base, phaseS: undefined, granularFlow: 1, velocityX: 1 });
    assert.deepEqual(snapshot(item), moving, "missing source time cannot animate the surface");
    item.renderer.update({ ...base, phaseS: 4, granularFlow: 1, velocityX: 1 });
    assert.deepEqual(snapshot(item), moving, "first resumed time establishes a quiet baseline");
    item.renderer.update({ ...base, phaseS: 8, granularFlow: 1, velocityX: -1 });
    assert.deepEqual(snapshot(item), moving, "a large gap is not a catch-up avalanche");
  } finally { item.renderer.dispose(); }
});

test("surface grains advect in either reported velocity direction, independent of the sign of the retained slope", () => {
  for (const direction of [-1, 1]) {
    const item = make();
    try {
      item.renderer.update(base);
      const before = grainPoses(item);
      advance(item, 12, { granularFlow: 0.85, velocityX: direction * 0.6 });
      const after = grainPoses(item), deltas = [];
      before.forEach((pose, index) => {
        if (!pose.visible || !after[index].visible || Math.abs(pose.position.x) > item.volume.size.x * 0.18) return;
        const dx = after[index].position.x - pose.position.x;
        close(after[index].position.z, pose.position.z, 1e-8, "surface flow does not invent a z transport model");
        if (Math.abs(dx) > 2e-6) deltas.push(dx);
      });
      assert.ok(deltas.length > 5, "a visible minority of grains must travel");
      assert.ok(deltas.every(dx => dx * direction > 0), `no sinusoidal backtracking during ${direction} flow: ${deltas}`);
      close(item.volume.normal.x / item.volume.normal.y, -base.pileSlope, 1e-12, "source plane slope remains authoritative");
    } finally { item.renderer.dispose(); }
  }
});

function drawnTriangles(geometry) {
  const positions = geometry.getAttribute("position"), start = geometry.drawRange.start;
  const end = Math.min(positions.count, start + geometry.drawRange.count), triangles = [];
  for (let i = start; i + 2 < end; i += 3) triangles.push([0, 1, 2].map(offset => new Vector3().fromBufferAttribute(positions, i + offset)));
  return triangles;
}
function actualVolume(item) {
  let volume = 0;
  for (const geometry of [item.volume.body, item.volume.surface]) for (const [a, b, c] of drawnTriangles(geometry)) volume += a.dot(b.cross(c)) / 6;
  return Math.abs(volume);
}
function checkGeometryAndGrains(item, label) {
  for (const geometry of [item.volume.body, item.volume.surface]) for (const triangle of drawnTriangles(geometry)) for (const point of triangle) {
    assert.ok(point.toArray().every(Number.isFinite), label + " finite drawn vertices");
    assert.ok(item.volume.contains(point, -1e-7), label + " drawn geometry is contained");
  }
  assert.ok(Array.from(item.grains.instanceMatrix.array).every(Number.isFinite), label + " finite grain transforms");
  const sampler = new SandSurfaceSampler(item.volume.surface, item.volume.size);
  sampler.rebuild();
  const vertices = item.grains.geometry.getAttribute("position");
  const poses = grainPoses(item), largestGrain = Math.max(...poses.map(pose => Math.max(...pose.scale.toArray())));
  let visible = 0;
  for (const pose of poses) {
    if (!pose.visible || !item.grains.visible) continue;
    assert.ok(item.volume.contains(pose.position, -1e-7), label + " grain center is inside the cavity");
    const height = sampler.heightAt(pose.position.x, pose.position.z);
    assert.ok(Number.isFinite(height), label + " visible grain has a supporting surface triangle");
    close(pose.position.y, height, Math.min(...item.volume.size.toArray()) * 0.001, label + " grain stays attached to the final surface");
    let low = Infinity, high = -Infinity;
    for (let i = 0; i < vertices.count; i++) {
      const vertex = new Vector3().fromBufferAttribute(vertices, i).applyMatrix4(pose.matrix);
      assert.ok(item.volume.contains(vertex, -1e-7), label + " finite grain footprint remains in the cavity");
      const surfaceY = sampler.heightAt(vertex.x, vertex.z);
      if (surfaceY !== undefined) { low = Math.min(low, vertex.y - surfaceY); high = Math.max(high, vertex.y - surfaceY); }
    }
    // A recycling grain shrinks into the bed and can become fully occluded.
    // Normally sized grains must protrude, and no grain may float above it.
    const fading = Math.max(...pose.scale.toArray()) < largestGrain * 0.4;
    assert.ok(low <= 2e-7 && (fading || high >= -2e-7),
      label + ` grain contacts the actual surface rather than floating/burying: ${low}/${high}`);
    if (high >= -2e-7) visible++;
  }
  return visible;
}

test("near-empty/full sand at steep signed slopes keeps actual mesh volume, finite grains and surface contact", () => {
  for (const size of [[0.06, 0.06, 0.04], [0.12, 0.035, 0.025]]) {
    for (const fill of [0, 0.001, 0.04, 0.35, 0.95, 0.999, 1]) for (const slope of [-3, 0, 3]) {
      const item = make(size), source = { fill, pileSlope: slope }, label = `${size}/${fill}/${slope}`;
      try {
        item.renderer.update({ ...base, ...source });
        const reference = item.volume.centroid.toArray();
        advance(item, 8, { ...source, granularFlow: 0.9, velocityX: slope < 0 ? -1 : 1 });
        close(actualVolume(item), item.volume.capacity * fill, item.volume.capacity * 1e-5, label + " actual volume");
        close(item.volume.volume, item.volume.capacity * fill, item.volume.capacity * 1e-6, label + " source fill");
        assert.deepEqual(item.volume.centroid.toArray(), reference, "reference centroid remains source-owned; relief is not a new reported CG");
        const visible = checkGeometryAndGrains(item, label);
        if (fill === 0 || fill === 1) assert.equal(visible, 0, "no exposed free-surface grains without a free surface");
        if (fill === 0.35) assert.ok(visible > 10, "the material keeps a visible population at meaningful fill");
      } finally { item.renderer.dispose(); }
    }
  }
});
