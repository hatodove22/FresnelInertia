import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const asURL = js => `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
const transpile = path => ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022},
}).outputText;
const motionURL = asURL(transpile('../src/mechanismMotion.ts'));
const {DeviceRig} = await import(asURL(transpile('../src/deviceRig.ts')
  .replace(/from ['"]three['"]/g, `from ${JSON.stringify(import.meta.resolve('three'))}`)
  .replace(/from ['"]\.\/mechanismMotion['"]/g, `from ${JSON.stringify(motionURL)}`)));
const metadata = JSON.parse(fs.readFileSync(new URL('../public/models/whc2025-kinematics.json', import.meta.url), 'utf8'));
const glb = fs.readFileSync(new URL('../public/models/whc2025-demo.glb', import.meta.url));
const config = {channelIds: ['A', 'B', 'C'], vibrationCount: 0};
const Z = new THREE.Vector3(0, 0, 1);
const near = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-12, `${message}: ${a} versus ${b}`);

async function load(t) {
  const gltf = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
  gltf.scene.updateMatrixWorld(true);
  const nodes = new Map(), rest = new Map();
  gltf.scene.traverse(mesh => {
    if (!(mesh instanceof THREE.Mesh)) return;
    const index = gltf.parser.associations.get(mesh)?.nodes;
    nodes.set(index, mesh); rest.set(index, mesh.matrixWorld.clone());
  });
  t.after(() => gltf.scene.traverse(mesh => {
    if (!(mesh instanceof THREE.Mesh)) return;
    mesh.geometry.dispose();
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => material.dispose());
  }));
  return {gltf, nodes, rest};
}

test('WHC loads its actual 217 meshes as three channels, with 15 moving and 202 retained-rest nodes', async t => {
  const f = await load(t), rig = new DeviceRig(f.gltf, metadata, config);
  rig.setAngles({A: 0, B: 0, C: 0});
  assert.equal(f.nodes.size, 217); assert.equal(rig.meshes.length, 217); assert.equal(rig.vibrating.length, 0);
  const moving = metadata.channels.flatMap(c => c.groups.flatMap(g => g.nodeIndices));
  assert.equal(moving.length, 15); assert.equal(new Set(moving).size, 15);
  assert.equal(metadata.fixedNodeIndices.length, 202);
  assert.equal(new Set([...moving, ...metadata.fixedNodeIndices]).size, 217);
  for (const [i, mesh] of f.nodes) assert.deepEqual(mesh.matrixWorld.elements, f.rest.get(i).elements, `neutral node ${i}`);
  for (const i of [215, 216, 217]) {
    assert.equal(f.nodes.get(i).userData.role, 'pressureSensor');
    assert.ok(metadata.fixedNodeIndices.includes(i));
  }
});

test('each WHC pad drives only its own fin, pinion and horn with opposite signs, preserving all retained-rest nodes', async t => {
  const f = await load(t), rig = new DeviceRig(f.gltf, metadata, config);
  // Explicit physical pairings catch an accidental B/C servo or metadata-sign swap.
  const pairs = [['A', 55, 52, 4], ['B', 56, 53, 38], ['C', 57, 54, 21]];
  for (const channel of config.channelIds) for (const degrees of [-10, 10]) {
    rig.setAngles({[channel]: degrees});
    for (const [owner, fin, pinion, horn] of pairs) for (const [index, sign] of [[fin, 1], [pinion, -1], [horn, -1]]) {
      const group = metadata.channels.find(c => c.id === owner).groups.find(g => g.nodeIndices.includes(index));
      const mesh = f.nodes.get(index), p = mesh.geometry.getAttribute('position'), pivot = new THREE.Vector3(...group.pivot);
      let vertex = new THREE.Vector3(), radius2 = -1;
      for (let i = 0; i < p.count; i++) {
        const candidate = new THREE.Vector3().fromBufferAttribute(p, i);
        const r2 = (candidate.x - pivot.x) ** 2 + (candidate.y - pivot.y) ** 2;
        if (r2 > radius2) {radius2 = r2; vertex = candidate;}
      }
      const a = vertex.clone().applyMatrix4(f.rest.get(index)).sub(pivot);
      const b = vertex.clone().applyMatrix4(mesh.matrixWorld).sub(pivot);
      near(Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y),
        owner === channel ? degrees * sign * Math.PI / 180 : 0, `node ${index} signed angle`);
      near(Math.hypot(a.x, a.y), Math.hypot(b.x, b.y), `node ${index} axis radius`);
      near(a.z, b.z, `node ${index} axis height`);
    }
    for (const i of metadata.fixedNodeIndices) assert.deepEqual(f.nodes.get(i).matrixWorld.elements, f.rest.get(i).elements, `retained-rest node ${i}`);
  }
  for (let i = 0; i < 30; i++) rig.setAngles({A: Math.sin(i) * 10, B: Math.cos(i) * 10, C: Math.sin(i * .3) * 10});
  rig.setAngles({A: 0, B: 0, C: 0});
  for (const [i, mesh] of f.nodes) assert.deepEqual(mesh.matrixWorld.elements, f.rest.get(i).elements, `no drift node ${i}`);
});

test('WHC contact anchors and normals follow their fins and the complete assembly transform', async t => {
  const f = await load(t), rig = new DeviceRig(f.gltf, metadata, config), angles = {A: 7, B: -8, C: 9};
  rig.root.position.set(.12, -.03, .07); rig.root.rotation.set(.2, -.3, .4);
  rig.setAngles(angles);
  const anchors = rig.getContactAnchors(); assert.equal(anchors.length, 3);
  for (const c of metadata.channels) {
    const fin = c.groups.find(g => g.id === 'fin'), contact = c.contact, anchor = anchors.find(a => a.id === c.id);
    assert.ok(fin.nodeIndices.includes(contact.attachedNodeIndex));
    const pivot = new THREE.Vector3(...fin.pivot), radians = angles[c.id] * Math.PI / 180;
    const expected = new THREE.Vector3(...contact.anchorRestMeters).sub(pivot).applyAxisAngle(Z, radians).add(pivot).applyMatrix4(rig.root.matrixWorld);
    const normal = new THREE.Vector3(...contact.normalRest).applyAxisAngle(Z, radians).transformDirection(rig.root.matrixWorld);
    assert.ok(anchor.position.distanceTo(expected) < 1e-12, `world contact position ${c.id}`);
    assert.ok(anchor.normal.distanceTo(normal) < 1e-12, `world contact normal ${c.id}`);
    near(anchor.normal.length(), 1, `unit contact normal ${c.id}`);
  }
});

test('WHC rejects a missing channel instead of silently using a two-pad profile', async t => {
  const f = await load(t), missing = structuredClone(metadata); missing.channels.pop();
  assert.throws(() => new DeviceRig(f.gltf, missing, config), /channels.*profile/i);
  const second = await load(t);
  assert.throws(() => new DeviceRig(second.gltf, metadata, {channelIds: ['A', 'B'], vibrationCount: 0}), /channels.*profile/i);
});
