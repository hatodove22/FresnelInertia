import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { normalizePose, contactAngle, type DevicePose } from './mechanismMotion';
export type Vec3 = [number, number, number];
export interface KinematicGroup {id: string; pivot: Vec3; axis: Vec3; ratio: number; nodeIndices: number[]}
export interface DeviceKinematics {
  channels: {id: string; groups: KinematicGroup[]; contact?: {anchorRestMeters: Vec3; normalRest?: Vec3; attachedNodeIndex: number}}[];
  [key: string]: unknown;
}
export interface RigConfiguration {channelIds: readonly string[]; vibrationCount: number}
/** Verified CAD joints applied to the existing world-positioned mesh export. */
export class DeviceRig {
  readonly root: THREE.Group;
  readonly vibrating: THREE.Mesh[] = [];
  readonly meshes: THREE.Mesh[] = [];
  readonly metadata: DeviceKinematics;
  private joints: {group: THREE.Group; axis: THREE.Vector3; ratio: number; channel: string}[] = [];
  private nodes = new Map<number, THREE.Object3D>();
  private transparent = false;
  private moving = new Set<THREE.Object3D>();
  constructor(gltf: GLTF, metadata: DeviceKinematics, config: RigConfiguration = {channelIds: ['left', 'right'], vibrationCount: 4}) {
    this.root = gltf.scene; this.metadata = metadata;
    const nodes = this.nodes;
    gltf.scene.traverse(object => {
      const index = gltf.parser.associations.get(object)?.nodes;
      if (index !== undefined) nodes.set(index, object);
      if (!(object instanceof THREE.Mesh)) return;
      this.meshes.push(object);
      const original = Array.isArray(object.material) ? object.material : [object.material];
      const role = object.userData.role;
      const gear = /pinion/i.test(object.name), contact = role === 'contactPlane', vibrator = role === 'vibration';
      object.material = new THREE.MeshStandardMaterial({
        color: contact ? 0xff6135 : vibrator ? 0x29bfb4 : gear ? 0xdfa84b : role === 'pressureSensor' ? 0x253d43 : role === 'servo' ? 0x252e37 : role === 'controller' ? 0x4e5963 : 0x7b858b,
        metalness: gear ? .45 : contact ? .18 : role === 'servo' ? .35 : .18,
        roughness: contact ? .32 : .42,
      });
      original.forEach(material => material.dispose());
      if (vibrator) this.vibrating.push(object);
    });
    this.vibrating.sort((a, b) => (gltf.parser.associations.get(a)?.nodes ?? 0) - (gltf.parser.associations.get(b)?.nodes ?? 0));
    if (this.vibrating.length !== config.vibrationCount) throw new Error('CAD transducer count differs from its mechanism profile.');
    if (!config.channelIds.length || new Set(config.channelIds).size !== config.channelIds.length || metadata.channels?.length !== config.channelIds.length || new Set(metadata.channels.map(c => c.id)).size !== config.channelIds.length) throw new Error('Independently described CAD channels must match the mechanism profile.');
    const assigned = new Set<number>();
    for (const channel of metadata.channels) {
      if (!config.channelIds.includes(channel.id)) throw new Error('Unknown CAD channel.');
      for (const joint of channel.groups) {
        if (![...joint.pivot, ...joint.axis, joint.ratio].every(Number.isFinite)) throw new Error(`Invalid CAD joint ${joint.id}.`);
        const axis = new THREE.Vector3(...joint.axis);
        if (Math.abs(axis.length() - 1) > .001 || !joint.nodeIndices.length) throw new Error(`Invalid axis/membership ${joint.id}.`);
        const group = new THREE.Group(); group.name = `joint_${joint.id}`;
        group.position.set(...joint.pivot); this.root.add(group);
        for (const index of joint.nodeIndices) {
          if (assigned.has(index)) throw new Error(`CAD node ${index} assigned twice.`);
          const mesh = nodes.get(index);
          if (!mesh || !(mesh instanceof THREE.Mesh)) throw new Error(`Missing CAD mesh node ${index}.`);
          // Vertices already use centered CAD world coordinates. Keep original geometry intact.
          group.add(mesh); mesh.position.set(-joint.pivot[0], -joint.pivot[1], -joint.pivot[2]); assigned.add(index); this.moving.add(mesh);
        }
        this.joints.push({group, axis, ratio: joint.ratio, channel: channel.id});
      }
    }
  }
  setPose(input: DevicePose) {
    const pose = normalizePose(input);
    this.setAngles({left: pose.leftDeg, right: pose.rightDeg});
    this.vibrating.forEach((mesh, i) => {
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.emissive.setHex(0x36f6d4); material.emissiveIntensity = pose.pulse[i] * 1.8;
      if (this.transparent) material.opacity = .12 + pose.pulse[i] * .75;
    });
    this.root.updateMatrixWorld(true);
  }
  /** Contact-pad angles in degrees. Driver signs/ratios belong to the CAD profile. */
  setAngles(angles: Readonly<Record<string, number>>) {
    for (const joint of this.joints) joint.group.quaternion.setFromAxisAngle(joint.axis,
      THREE.MathUtils.degToRad(contactAngle(angles[joint.channel] ?? 0) * joint.ratio));
    this.root.updateMatrixWorld(true);
  }
  /** A verified rest-coordinate contact anchor follows its actual animated CAD node. */
  getContactAnchors() {
    return this.metadata.channels.flatMap(channel => {
      const contact = channel.contact;
      if (!contact) return [];
      const node = this.nodes.get(contact.attachedNodeIndex);
      if (!node) throw new Error('Contact anchor references a missing CAD node.');
      const position = node.localToWorld(new THREE.Vector3(...contact.anchorRestMeters));
      const normal = contact.normalRest ? new THREE.Vector3(...contact.normalRest).transformDirection(node.matrixWorld) : undefined;
      return [{id: channel.id, position, normal}];
    });
  }
  setCutaway(value: boolean) {
    if (this.transparent === value) return; this.transparent = value;
    for (const mesh of this.meshes) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      const reveal = !this.moving.has(mesh);
      material.transparent = reveal && value;
      material.opacity = reveal && value ? (mesh.userData.role === 'servo' ? .28 : .12) : 1;
      material.depthWrite = !(reveal && value); material.needsUpdate = true;
    }
  }
  dispose() {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    for (const mesh of this.meshes) {geometries.add(mesh.geometry); (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => materials.add(m));}
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  }
}
