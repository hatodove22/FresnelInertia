// The moving free surface and the walls enclose one volume, not a fixed tank
// plus a second decorative cap. These are geometry checks, not fluid physics.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Plane, Vector3 } from "three";

async function load(path) {
  const output = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
  return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
}
const { ContainedVolume } = await load("../src/renderer/ContainedVolume.ts");
const { ContainerGeometry } = await load("../src/renderer/ContainerGeometry.ts");
const size = new Vector3(0.08, 0.12, 0.05);
const waves = (revision = 1, phase = 0) => ({ revision, maxDisplacement: 0.009,
  displacement: (u, v) => 0.008 * (Math.sin(u * 7 + phase) + 0.45 * Math.sin(v * 11 + phase * 0.7) + 0.3 * Math.sin(u * 5 + v * 3)) });

function points(geometry) {
  return Array.from({ length: geometry.drawRange.count }, (_, index) =>
    new Vector3().fromBufferAttribute(geometry.attributes.position, index));
}
function assertVolumeAndBounds(volume, fill) {
  let signedVolume = 0;
  for (const geometry of [volume.body, volume.surface]) {
    const vertices = points(geometry);
    for (const point of vertices) {
      assert.ok(point.toArray().every(Number.isFinite));
      assert.ok(volume.contains(point, -1e-7), "the complete deformed mesh stays inside the convex cavity");
    }
    for (let i = 0; i < vertices.length; i += 3) signedVolume += vertices[i].dot(vertices[i + 1].clone().cross(vertices[i + 2])) / 6;
  }
  assert.ok(Math.abs(Math.abs(signedVolume) - volume.capacity * fill) < volume.capacity * 6e-6,
    `actual wall + surface volume matches fill ${fill}: ${Math.abs(signedVolume) / volume.capacity}`);
}
function assertSharedWaterline(volume) {
  const surface = points(volume.surface), wall = points(volume.body);
  for (const point of volume.boundary) {
    assert.ok(surface.some(vertex => vertex.distanceToSquared(point) < 1e-14), "waterline is part of the actual free surface");
    // Earcut may omit a collinear vertex; matching its wall edge is equally
    // exact geometrically and must not be mistaken for a disconnected seam.
    let wallDistance = Infinity;
    for (let i = 0; i < wall.length; i += 3) {
      for (let j = 0; j < 3; j++) {
        const a = wall[i + j], b = wall[i + (j + 1) % 3], edge = b.clone().sub(a);
        const t = Math.max(0, Math.min(1, point.clone().sub(a).dot(edge) / Math.max(edge.lengthSq(), 1e-24)));
        wallDistance = Math.min(wallDistance, a.clone().addScaledVector(edge, t).distanceToSquared(point));
      }
    }
    assert.ok(wallDistance < 1e-14, "body walls terminate at the same deformed waterline, without a straight ghost edge");
  }
}

test("upright waves raise and lower the actual wall waterline with no fixed internal cap", () => {
  const volume = new ContainedVolume(size);
  volume.update(0.55, new Vector3(0, 1, 0), 0, 0, waves());
  const heights = volume.boundary.map(point => point.y - volume.offset);
  assert.ok(Math.max(...heights) > 0.002 && Math.min(...heights) < -0.002,
    "the visible wall contact rises and falls with the same water surface");
  assertSharedWaterline(volume);
  assertVolumeAndBounds(volume, 0.55);
  const wall = points(volume.body);
  for (let i = 0; i < wall.length; i += 3) {
    assert.ok(!wall.slice(i, i + 3).every(point => Math.abs(point.y - volume.offset) < 1e-7),
      "the body must not retain a second flat cap at the original water level");
  }
  volume.dispose();
});

test("tilted, sideways and inverted waterlines keep exact volume and obey pinned caps", () => {
  const volume = new ContainedVolume(size);
  let revision = 0;
  for (const normal of [[0.35, 1, -0.3], [1, 0, 0], [0, 0, -1], [0, -1, 0], [0.75, 0.15, -0.7]]) {
    for (const fill of [0.01, 0.16, 0.55, 0.92, 0.99]) {
      volume.update(fill, new Vector3(...normal), 0, 0, waves(++revision, 0.7));
      assertVolumeAndBounds(volume, fill);
      assertSharedWaterline(volume);
      const axis = volume.normal.toArray().map(Math.abs).indexOf(Math.max(...volume.normal.toArray().map(Math.abs)));
      for (const point of volume.boundary) {
        const originalAxisCoordinate = point.getComponent(axis) + (volume.offset - point.dot(volume.normal)) / volume.normal.getComponent(axis);
        const onCap = Math.abs(Math.abs(originalAxisCoordinate) - size.getComponent(axis) / 2) < 1e-8;
        if (onCap) assert.ok(Math.abs(point.dot(volume.normal) - volume.offset) < 1e-8,
          "an end-cap intersection cannot slide outside its incompatible wall");
      }
    }
  }
  volume.dispose();
});

test("round parallel walls carry the wave but tapered walls retain their conservative seam", () => {
  for (const shape of ["cylinder_bottle", "tumbler_cup"]) {
    const geometry = new ContainerGeometry({ preset: "liquid", family: "Liquid", visual_shape: shape,
      container: { span_x_m: 0.07, span_y_m: 0.12, span_z_m: 0.07, fill: 0.5 } }, false);
    const hull = geometry.liquidHull(), volume = new ContainedVolume(hull);
    volume.update(0.5, new Vector3(0, 1, 0), 0, 0, waves());
    assertVolumeAndBounds(volume, 0.5);
    assertSharedWaterline(volume);
    const boundaryHeights = volume.boundary.map(point => Math.abs(point.y - volume.offset));
    if (shape === "cylinder_bottle") assert.ok(Math.max(...boundaryHeights) > 0.002, "cylindrical wall contact follows the crest");
    else {
      assert.ok(Math.max(...boundaryHeights) < 1e-8, "tapered side intersections stay pinned to avoid leaving their hull");
      assert.ok(points(volume.surface).some(point => Math.abs(point.y - volume.offset) > 0.0005), "pinned taper still allows an interior wave");
    }
    const planes = hull.map(face => new Plane().setFromCoplanarPoints(face[0], face[1], face[2]));
    for (const point of volume.boundary) assert.ok(planes.some(plane => Math.abs(plane.distanceToPoint(point)) < 1e-8));
    volume.dispose();
  }
});

test("waterline revision, attributes and samples freeze together; empty/full clears the contour", () => {
  const volume = new ContainedVolume(size);
  const field = waves();
  volume.update(0.55, new Vector3(0, 1, 0), 0, 0, field);
  const revision = volume.revision;
  const bodyAttribute = volume.body.attributes.position, surfaceAttribute = volume.surface.attributes.position;
  const snapshot = { body: Array.from(bodyAttribute.array), surface: Array.from(surfaceAttribute.array),
    boundary: volume.boundary.map(point => point.toArray()) };
  volume.update(0.55, new Vector3(0, 1, 0), 0, 0, field);
  assert.equal(volume.revision, revision);
  assert.deepEqual({ body: Array.from(bodyAttribute.array), surface: Array.from(surfaceAttribute.array),
    boundary: volume.boundary.map(point => point.toArray()) }, snapshot);
  volume.update(0.55, new Vector3(0, 1, 0), 0, 0, waves(2, 1.1));
  assert.equal(volume.revision, revision + 1);
  assert.equal(volume.body.attributes.position, bodyAttribute);
  assert.equal(volume.surface.attributes.position, surfaceAttribute);
  assert.notDeepEqual(volume.boundary.map(point => point.toArray()), snapshot.boundary);
  for (const fill of [0, 1]) {
    volume.update(fill, new Vector3(0, 1, 0), 0, 0, waves(3));
    assert.equal(volume.boundary.length, 0);
    assert.equal(volume.surface.drawRange.count, 0);
    assertVolumeAndBounds(volume, fill);
  }
  volume.dispose();
});

test("dominant-axis transitions meet continuously instead of snapping the wall waterline", () => {
  const normalAt = [
    angle => new Vector3(Math.sin(angle), Math.cos(angle), 0),
    angle => new Vector3(0, Math.cos(angle), Math.sin(angle)),
    angle => new Vector3(Math.cos(angle), 0.2, Math.sin(angle)),
    angle => new Vector3(Math.sin(angle), -Math.cos(angle), 0)
  ];
  const snapshot = normal => {
    const volume = new ContainedVolume(size);
    volume.update(0.55, normal, 0, 0, waves());
    assertVolumeAndBounds(volume, 0.55);
    const result = { surface: points(volume.surface), boundary: volume.boundary.map(point => point.clone()) };
    volume.dispose();
    return result;
  };
  const difference = (a, b, property) => {
    assert.equal(a[property].length, b[property].length);
    return Math.max(...a[property].map((point, index) => point.distanceTo(b[property][index])));
  };
  for (const normal of normalAt) {
    const around = deltaDegrees => [-1, 1].map(sign => snapshot(normal((45 + sign * deltaDegrees) * Math.PI / 180)));
    const coarse = around(0.01), fine = around(0.0001);
    for (const property of ["surface", "boundary"]) {
      const coarseDifference = difference(...coarse, property), fineDifference = difference(...fine, property);
      assert.ok(fineDifference < size.z * 0.0001, `${property} has no finite jump as the selected axis changes`);
      assert.ok(fineDifference < coarseDifference * 0.03,
        `${property} difference tends to zero with the input angle, rather than retaining the old axis-switch discontinuity`);
    }
    for (const angle of [35, 45, 55]) {
      const volume = new ContainedVolume(size);
      volume.update(0.55, normal(angle * Math.PI / 180), 0, 0, waves());
      const amplitude = Math.max(...points(volume.surface).map(point => Math.abs(point.dot(volume.normal) - volume.offset)));
      if (angle === 45) assert.ok(amplitude < 1e-8, "both ambiguous projections meet at the same supporting plane");
      else assert.ok(amplitude > 0.001, "ordinary off-transition poses retain clearly visible waves");
      volume.dispose();
    }
  }
});
