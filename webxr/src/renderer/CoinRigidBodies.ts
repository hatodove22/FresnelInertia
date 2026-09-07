import type * as Rapier from "@dimforge/rapier3d-compat";

type Vector = { x: number; y: number; z: number };
type Rotation = { x: number; y: number; z: number; w: number };
export interface CoinRigidBodyPose { position: Vector; rotation: Rotation }
export interface CoinRigidBodyInput {
  timeS?: number;
  /** Body-local gravity, in g; the container's accepted orientation owns it. */
  gravity: Vector;
  /** Accepted body acceleration residual, in g. Opposed by inertial motion. */
  acceleration?: readonly number[];
  fill: number;
}
export interface CoinRigidBodyModel {
  update(input: CoinRigidBodyInput): readonly CoinRigidBodyPose[];
  dispose(): void;
}

const SCALE = 100; // Centimetres keep thin-disc contact geometry well resolved.
const ZERO = { x: 0, y: 0, z: 0 };
const finiteVector = (v: Vector) => [v.x, v.y, v.z].every(Number.isFinite);
let loading: Promise<typeof Rapier> | undefined;

/** One local chunk/embedded Wasm module shared by independently owned worlds.
 * No CDN, render timer, three.js physics addon or background simulation. */
function loadRapier() {
  if (!loading) loading = import("@dimforge/rapier3d-compat").then(async library => {
    await library.init();
    return library;
  }).catch(error => { loading = undefined; throw error; });
  return loading;
}

/** Presentation-only finite bodies. Every translation and rotation after
 * initialization comes from gravity, inertia and contacts, never a prescribed
 * turnover, fixed face angle, ordered coin or source-position teleport. */
export async function createCoinRigidBodies(
  size: Vector,
  coins: Array<CoinRigidBodyPose & { radius: number }>
): Promise<CoinRigidBodyModel> {
  if (!finiteVector(size) || Math.min(size.x, size.y, size.z) <= 0 || !coins.length ||
      coins.some(coin => !finiteVector(coin.position) || !finiteVector(coin.rotation) ||
        !Number.isFinite(coin.rotation.w) || Math.hypot(coin.rotation.x, coin.rotation.y, coin.rotation.z, coin.rotation.w) < 1e-8 ||
        !Number.isFinite(coin.radius) || coin.radius <= 0)) {
    throw new RangeError("Coin physics requires finite positive dimensions and valid finite coin poses");
  }
  const initial = coins.map(coin => ({ position: { ...coin.position }, rotation: { ...coin.rotation }, radius: coin.radius }));
  const dimensions = { ...size };
  const R = await loadRapier();
  let world: Rapier.World;
  let bodies: Rapier.RigidBody[];
  let disposed = false;
  let lastTime: number | undefined;
  let remainder = 0;
  const restingTime = initial.map(() => 0);
  let previousGravity = { x: 0, y: -9.80665 * SCALE, z: 0 };
  const poses = initial.map(coin => ({ position: { ...coin.position }, rotation: { ...coin.rotation } }));
  const half = [dimensions.x * 0.48, dimensions.y * 0.474, dimensions.z * 0.48].map(value => value * SCALE);

  function buildWorld() {
    world = new R.World(previousGravity);
    world.lengthUnit = SCALE; // Physical units per metre, including recovery speeds.
    world.numSolverIterations = 8;
    world.numInternalPgsIterations = 2;
    world.integrationParameters.normalizedAllowedLinearError = 0.000005;
    world.integrationParameters.normalizedPredictionDistance = 0.0002;
    world.integrationParameters.contact_natural_frequency = 5000;
    world.integrationParameters.maxCcdSubsteps = 8;
    for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
      const normal = [0, 0, 0], position = [0, 0, 0];
      normal[axis] = -sign; position[axis] = sign * half[axis];
      world.createCollider(new R.ColliderDesc(new R.HalfSpace({ x: normal[0], y: normal[1], z: normal[2] }))
        .setTranslation(position[0], position[1], position[2]).setFriction(0.34).setRestitution(0.10));
    }
    bodies = initial.map(coin => {
      const qLength = Math.hypot(coin.rotation.x, coin.rotation.y, coin.rotation.z, coin.rotation.w);
      const rotation = { x: coin.rotation.x / qLength, y: coin.rotation.y / qLength, z: coin.rotation.z / qLength, w: coin.rotation.w / qLength };
      const body = world.createRigidBody(R.RigidBodyDesc.dynamic()
        .setTranslation(coin.position.x * SCALE, coin.position.y * SCALE, coin.position.z * SCALE)
        .setRotation(rotation).setLinearDamping(1.2).setAngularDamping(2.4)
        .setCcdEnabled(true).setCanSleep(true));
      world.createCollider(R.ColliderDesc.cylinder(coin.radius * 0.08 * SCALE, coin.radius * SCALE)
        .setMass(1).setFriction(0.28).setRestitution(0.14), body);
      return body;
    });
  }
  function readPoses() {
    bodies.forEach((body, index) => {
      const p = body.translation(), q = body.rotation();
      Object.assign(poses[index].position, { x: p.x / SCALE, y: p.y / SCALE, z: p.z / SCALE });
      Object.assign(poses[index].rotation, q);
    });
    return poses;
  }
  function quiet() {
    remainder = 0;
    restingTime.fill(0);
    for (const body of bodies) {
      body.setLinvel(ZERO, false); body.setAngvel(ZERO, false);
      body.resetForces(false); body.resetTorques(false);
    }
  }
  /** Exact plane support constraints supplement the engine's discrete cylinder
   * contacts. Correct penetration and its outward contact velocity, not the
   * orientation: any torque is the physical impulse at the contact point.
   * This prevents thin, rapidly rotating rims crossing the visible vessel. */
  function solveWallSupports() {
    bodies.forEach((body, i) => {
      if (body.isSleeping()) return;
      const q = body.rotation(), radius = initial[i].radius * SCALE;
      const n = [2 * (q.x * q.y - q.w * q.z), 1 - 2 * (q.x * q.x + q.z * q.z), 2 * (q.y * q.z + q.w * q.x)];
      for (let axis = 0; axis < 3; axis++) {
        const position = body.translation(), values = [position.x, position.y, position.z];
        const sign = Math.sign(values[axis]) || 1;
        const cosine = Math.max(-1, Math.min(1, n[axis] * sign));
        const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
        const support = radius * (sine + .08 * Math.abs(cosine));
        const penetration = Math.abs(values[axis]) + support - half[axis];
        if (penetration <= .000001 * SCALE) continue;
        values[axis] -= sign * penetration;
        const corrected = { x: values[0], y: values[1], z: values[2] };
        body.setTranslation(corrected, false);
        const d = [0, 0, 0]; d[axis] = sign;
        const r = n.map((v, a) => radius * ((sine > 1e-5 ? (d[a] - cosine * v) / sine : 0) + .08 * Math.sign(cosine) * v));
        const point = { x: corrected.x + r[0], y: corrected.y + r[1], z: corrected.z + r[2] };
        const velocity = body.velocityAtPoint(point), outward = [velocity.x, velocity.y, velocity.z][axis] * sign;
        if (outward <= 0) continue;
        const cross = [r[1] * d[2] - r[2] * d[1], r[2] * d[0] - r[0] * d[2], r[0] * d[1] - r[1] * d[0]];
        const inertia = body.effectiveWorldInvInertia();
        const angular = cross[0] * (inertia.m11 * cross[0] + inertia.m12 * cross[1] + inertia.m13 * cross[2]) +
          cross[1] * (inertia.m21 * cross[0] + inertia.m22 * cross[1] + inertia.m23 * cross[2]) +
          cross[2] * (inertia.m31 * cross[0] + inertia.m32 * cross[1] + inertia.m33 * cross[2]);
        const impulse = outward / Math.max(1e-8, body.invMass() + angular);
        body.applyImpulseAtPoint({ x: -d[0] * impulse, y: -d[1] * impulse, z: -d[2] * impulse }, point, false);
      }
    });
  }
  buildWorld();
  readPoses();

  return {
    update(input) {
      if (disposed) return poses;
      if (!Number.isFinite(input.timeS)) { quiet(); lastTime = undefined; return poses; }
      if (input.timeS === lastTime) return poses;
      const time = input.timeS!, dt = lastTime === undefined ? 0 : time - lastTime;
      if (dt < 0) {
        world.free(); buildWorld(); remainder = 0; restingTime.fill(0); lastTime = time;
        return readPoses();
      }
      if (lastTime === undefined || dt > 0.5 || !Number.isFinite(input.fill) || input.fill <= 0 || !finiteVector(input.gravity)) {
        quiet(); lastTime = time; return poses;
      }
      lastTime = time;
      const acceleration = input.acceleration?.length === 3 && input.acceleration.every(Number.isFinite) ? input.acceleration : [0, 0, 0];
      const force = {
        x: (input.gravity.x - acceleration[0]) * 9.80665 * SCALE,
        y: (input.gravity.y - acceleration[1]) * 9.80665 * SCALE,
        z: (input.gravity.z - acceleration[2]) * 9.80665 * SCALE,
      };
      if (Math.hypot(force.x - previousGravity.x, force.y - previousGravity.y, force.z - previousGravity.z) > 0.001) {
        restingTime.fill(0);
        for (const body of bodies) body.wakeUp();
      }
      previousGravity = force;
      world.gravity = force;
      remainder += dt;
      const stepS = 1 / 480;
      const steps = Math.floor((remainder + 1e-10) / stepS);
      remainder = Math.max(0, remainder - steps * stepS);
      world.timestep = stepS;
      for (let step = 0; step < steps; step++) {
        if (bodies.every(body => body.isSleeping())) break;
        world.step(); solveWallSupports();
        // Thin contact stacks otherwise creep from numerical impulses. A short
        // sustained low-velocity rest can sleep; any changed input or collision
        // wakes it again. No angle is snapped to a face or prescribed turn.
        bodies.forEach((body, i) => {
          const v = body.linvel(), w = body.angvel();
          restingTime[i] = Math.hypot(v.x, v.y, v.z) < .01 * SCALE && Math.hypot(w.x, w.y, w.z) < 1
            ? restingTime[i] + stepS : 0;
          if (restingTime[i] > .35) body.sleep();
        });
      }
      return readPoses();
    },
    dispose() {
      if (disposed) return;
      disposed = true; world.free();
    },
  };
}
