import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// Exercise the production TypeScript without browser/WebGL or generated test files.
const moduleURL = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const transpile = path => ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022},
}).outputText;
const motionURL = moduleURL(transpile('../src/mechanismMotion.ts'));
const {contactAngle, normalizePose, mechanismPose} = await import(motionURL);
const rigJS = transpile('../src/deviceRig.ts')
  .replace(/from ['"]three['"]/g, `from ${JSON.stringify(import.meta.resolve('three'))}`)
  .replace(/from ['"]\.\/mechanismMotion['"]/g, `from ${JSON.stringify(motionURL)}`);
const {DeviceRig} = await import(moduleURL(rigJS));
const metadata = JSON.parse(fs.readFileSync(new URL('../public/models/device-kinematics.json', import.meta.url), 'utf8'));
const glb = fs.readFileSync(new URL('../public/models/device-cad.glb', import.meta.url));
const zero = () => ({leftDeg: 0, rightDeg: 0, pulse: [0, 0, 0, 0]});
const EPS = 1e-12; // metres; only rigid double-precision transforms, no retessellation.
const near = (actual, expected, message, tolerance = EPS) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} versus ${expected}`);
const vectorNear = (actual, expected, message) => {
  near(actual.x, expected.x, `${message} x`);
  near(actual.y, expected.y, `${message} y`);
  near(actual.z, expected.z, `${message} z`);
};

function worldVertices(mesh) {
  const p = mesh.geometry.getAttribute('position'), v = new THREE.Vector3();
  const result = new Float64Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
    v.toArray(result, i * 3);
  }
  return result;
}

async function fixture(t) {
  const bytes = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
  const gltf = await new GLTFLoader().parseAsync(bytes, '');
  gltf.scene.updateMatrixWorld(true);
  const nodes = new Map(), before = new Map(), matrices = new Map();
  gltf.scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const index = gltf.parser.associations.get(object)?.nodes;
    assert.notEqual(index, undefined, 'each actual CAD mesh has a GLB node association');
    nodes.set(index, object);
    before.set(index, worldVertices(object));
    matrices.set(index, object.matrixWorld.clone());
  });
  const rig = new DeviceRig(gltf, metadata);
  t.after(() => rig.dispose());
  rig.root.updateMatrixWorld(true);
  return {rig, nodes, before, matrices};
}

function assertPoseMatchesRest(f, label) {
  for (const [index, mesh] of f.nodes) {
    const actual = worldVertices(mesh), expected = f.before.get(index);
    assert.equal(actual.length, expected.length);
    for (let i = 0; i < actual.length; i++) near(actual[i], expected[i], `${label}, node ${index}, coordinate ${i}`);
  }
}

function groupFor(index) {
  return metadata.channels.flatMap(channel => channel.groups).find(group => group.nodeIndices.includes(index));
}

test('actual 57-mesh GLB retains every world vertex when reparented at zero pad angle', async t => {
  const f = await fixture(t);
  assert.equal(f.nodes.size, 57);
  assert.equal(f.rig.meshes.length, 57);
  assert.equal(f.rig.vibrating.length, 4);
  assertPoseMatchesRest(f, 'constructor reparenting');
  f.rig.setPose(zero());
  assertPoseMatchesRest(f, 'explicit zero command');
  assert.equal(metadata.fixedNodeIndices.length, 47);
  for (const [index, expectedRatio] of [[37, 1], [38, 1], [35, -1], [36, -1]]) {
    assert.deepEqual(groupFor(index).axis, [0, 0, 1]);
    assert.equal(groupFor(index).ratio, expectedRatio, `pad-angle convention for node ${index}`);
  }
});

test('independent ±10° pad commands rotate each fin forward and its actual pinion backward', async t => {
  const f = await fixture(t);
  for (const channel of ['left', 'right']) for (const degrees of [-10, 10]) {
    const input = {...zero(), [`${channel}Deg`]: degrees};
    f.rig.setPose(input);
    for (const [index, owner, direction] of [[37, 'left', 1], [35, 'left', -1], [38, 'right', 1], [36, 'right', -1]]) {
      const pivot = new THREE.Vector3(...groupFor(index).pivot);
      const rest = f.before.get(index), actual = worldVertices(f.nodes.get(index));
      // Use an actual vertex far from the axis: an on-axis point cannot reveal a sign error.
      let probe = 0, farthest = -1;
      for (let i = 0; i < rest.length; i += 3) {
        const radius2 = (rest[i] - pivot.x) ** 2 + (rest[i + 1] - pivot.y) ** 2;
        if (radius2 > farthest) {farthest = radius2; probe = i;}
      }
      assert.ok(farthest > 1e-6, 'CAD probe is at least 1 mm from the axis');
      const a = new THREE.Vector3().fromArray(rest, probe).sub(pivot);
      const b = new THREE.Vector3().fromArray(actual, probe).sub(pivot);
      const angle = Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y);
      const expected = owner === channel ? degrees * direction * Math.PI / 180 : 0;
      near(angle, expected, `${channel} ${degrees}°, measured rotation of node ${index}`);
    }
  }
});

test('all moving vertices preserve distance to the CAD axis; all other 47 node transforms stay fixed', async t => {
  const f = await fixture(t);
  const poses = [
    {leftDeg: 10, rightDeg: 10, pulse: [1, .5, 0, .2]},
    {leftDeg: -10, rightDeg: -10, pulse: [0, 1, .5, .2]},
    {leftDeg: 10, rightDeg: -10, pulse: [.1, 0, 1, .4]},
    {leftDeg: -10, rightDeg: 10, pulse: [.1, .2, 0, 1]},
  ];
  for (const input of poses) {
    f.rig.setPose(input);
    for (const channel of metadata.channels) for (const group of channel.groups) {
      const pivot = new THREE.Vector3(...group.pivot);
      for (const index of group.nodeIndices) {
        const mesh = f.nodes.get(index), rest = f.before.get(index), actual = worldVertices(mesh);
        const localPivot = pivot.clone().applyMatrix4(f.matrices.get(index).clone().invert());
        vectorNear(localPivot.applyMatrix4(mesh.matrixWorld), pivot, `axis point remains fixed, node ${index}`);
        for (let i = 0; i < actual.length; i += 3) {
          near(Math.hypot(actual[i] - pivot.x, actual[i + 1] - pivot.y),
            Math.hypot(rest[i] - pivot.x, rest[i + 1] - pivot.y), `axis radius, node ${index}, vertex ${i / 3}`);
          near(actual[i + 2] - pivot.z, rest[i + 2] - pivot.z, `axis height, node ${index}, vertex ${i / 3}`);
        }
      }
    }
    for (const index of metadata.fixedNodeIndices) {
      assert.deepEqual(f.nodes.get(index).matrixWorld.elements, f.matrices.get(index).elements,
        `fixed node ${index} must not move, including when its pulse changes`);
    }
  }
});

test('200 changes of direction return all actual CAD vertices to the original pose without drift', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 200; i++) {
    f.rig.setPose({leftDeg: Math.sin(i * .7) * 10, rightDeg: Math.cos(i * .9) * 10,
      pulse: [i % 2, (i % 3) / 2, (i % 4) / 3, (i % 5) / 4]});
  }
  f.rig.setPose(zero());
  assertPoseMatchesRest(f, 'return to exported rest pose');
});

test('presentation normalization rejects nonfinite values and bounds angles and four pulses without changing the input', () => {
  for (const value of [NaN, Infinity, -Infinity]) assert.equal(contactAngle(value), 0);
  for (const [input, expected] of [[-100, -10], [100, 10], [-10, -10], [10, 10], [3.25, 3.25]]) {
    assert.equal(contactAngle(input), expected);
  }
  const input = {leftDeg: 99, rightDeg: -99, pulse: [-1, .25, 2, NaN]};
  const before = structuredClone(input), actual = normalizePose(input);
  assert.deepEqual(actual, {leftDeg: 10, rightDeg: -10, pulse: [0, .25, 1, 0]});
  assert.deepEqual(input, before);
  assert.notEqual(actual.pulse, input.pulse);
  assert.deepEqual(normalizePose({leftDeg: Infinity, rightDeg: NaN, pulse: [Infinity, -Infinity, NaN]}), zero());
});

test('bounded normalized inputs reach the actual rig; pulse changes never translate a transducer', async t => {
  const f = await fixture(t);
  f.rig.setPose({leftDeg: 1e9, rightDeg: -1e9, pulse: [-1, .25, 4, NaN]});
  const extreme = new Map([...f.nodes].map(([i, mesh]) => [i, mesh.matrixWorld.clone()]));
  f.rig.setPose({leftDeg: 10, rightDeg: -10, pulse: [0, .25, 1, 0]});
  for (const [i, mesh] of f.nodes) assert.deepEqual(mesh.matrixWorld.elements, extreme.get(i).elements);
  for (const [i, mesh] of f.rig.vibrating.entries()) {
    near(mesh.material.emissiveIntensity, [0, .25, 1, 0][i] * 1.8, `pulse ${i} intensity`);
  }
  f.rig.setPose({leftDeg: NaN, rightDeg: Infinity, pulse: [NaN, Infinity, -Infinity, 0]});
  assertPoseMatchesRest(f, 'nonfinite command returns to rest');
  assert.ok(f.rig.vibrating.every(mesh => mesh.material.emissiveIntensity === 0));
});

test('teaching sequences preserve common/differential signs and four bounded pulse channels', () => {
  assert.deepEqual(mechanismPose('common', 0, 7), {leftDeg: 7, rightDeg: 7, pulse: [0, 0, 0, 0]});
  assert.deepEqual(mechanismPose('differential', 0, 7), {leftDeg: 7, rightDeg: -7, pulse: [0, 0, 0, 0]});
  for (const mode of ['common', 'differential', 'impact']) {
    for (const time of [NaN, Infinity, -Infinity, -1, ...Array.from({length: 141}, (_, i) => i / 10)]) {
      const pose = mechanismPose(mode, time);
      assert.ok(Number.isFinite(pose.leftDeg) && Math.abs(pose.leftDeg) <= 10);
      assert.ok(Number.isFinite(pose.rightDeg) && Math.abs(pose.rightDeg) <= 10);
      assert.equal(pose.pulse.length, 4);
      assert.ok(pose.pulse.every(p => Number.isFinite(p) && p >= 0 && p <= 1));
    }
  }
  for (const cycle of [0, 1, 7, 100]) for (let i = 0; i < 4; i++) {
    const pulse = mechanismPose('impact', cycle * 5.6 + i * 1.4).pulse;
    near(pulse[i], 1, `pulse ${i} begins at its assigned time in cycle ${cycle}`, 1e-8);
    assert.equal(pulse.indexOf(Math.max(...pulse)), i, 'the scheduled transducer is the dominant channel');
    assert.equal(pulse.filter(p => p > 0).length, 1, 'channel and cycle boundaries do not select adjacent channels together');
  }
});
