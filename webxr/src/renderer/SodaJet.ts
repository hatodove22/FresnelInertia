import * as THREE from "three";

export interface SodaPressureState {
  charge: number;
  phase: "sealed" | "burst" | "spent";
  phaseS: number;
  remaining: number;
  burstSequence: number;
}

const TAU = Math.PI * 2;
// Different attachment heights and reaches avoid a symmetrical fountain/flower.
const sheetProfiles = [
  { angle: 0.3, origin: 0.64, reach: 0.23, lift: 0.07, drop: 0.14, width: 0.066 },
  { angle: 1.86, origin: 0.75, reach: 0.12, lift: 0.11, drop: 0.07, width: 0.047 },
  { angle: 3.7, origin: 0.48, reach: 0.18, lift: 0.17, drop: 0.16, width: 0.078 },
  { angle: 5.03, origin: 0.82, reach: 0.15, lift: 0.025, drop: 0.12, width: 0.036 }
];
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const smooth = (from: number, to: number, value: number) => {
  const x = clamp((value - from) / (to - from), 0, 1);
  return x * x * (3 - 2 * x);
};

/** A connected visual realization of the shared pressure state, not a fluid solver. */
export class SodaJet {
  readonly group = new THREE.Group();
  private readonly span: number;
  private readonly mouthY: number;
  private readonly core: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  private readonly foam: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  private readonly sheets: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  private signature = "";
  private disposed = false;

  constructor(size: THREE.Vector3) {
    this.span = Math.max(0.001, Math.min(size.x, size.y, size.z));
    this.mouthY = size.y / 2;
    this.group.name = "content-soda-jet";
    this.group.visible = false;

    this.core = new THREE.Mesh(this.grid(36, 28), new THREE.MeshPhysicalMaterial({
      color: "#a7e6d7", roughness: 0.115, metalness: 0,
      transmission: 0.58, opacity: 1, ior: 1.333,
      thickness: this.span * 0.12, attenuationColor: new THREE.Color("#39baa0"),
      attenuationDistance: this.span * 0.8, envMapIntensity: 1.35,
      clearcoat: 0.35, clearcoatRoughness: 0.08, side: THREE.DoubleSide
    }));
    this.core.name = "content-soda-jet-core";

    this.foam = new THREE.Mesh(this.grid(28, 32), new THREE.MeshPhysicalMaterial({
      color: "#c2e5d9", roughness: 0.3, metalness: 0,
      transmission: 0.16, opacity: 1, ior: 1.333,
      thickness: this.span * 0.08, envMapIntensity: 0.6,
      clearcoat: 0.2, clearcoatRoughness: 0.17, side: THREE.DoubleSide
    }));
    this.foam.name = "content-soda-jet-foam";
    this.addFoamDetail(this.foam.material);

    this.sheets = new THREE.Mesh(this.grid(18, 8, sheetProfiles.length), new THREE.MeshPhysicalMaterial({
      color: "#dafff5", roughness: 0.09, metalness: 0,
      transmission: 0.72, opacity: 1, ior: 1.333,
      thickness: this.span * 0.015, envMapIntensity: 1.5,
      clearcoat: 0.5, clearcoatRoughness: 0.07, side: THREE.DoubleSide
    }));
    this.sheets.name = "content-soda-jet-sheets";
    this.group.add(this.core, this.sheets, this.foam);
  }

  update(pressure: SodaPressureState | undefined) {
    if (this.disposed) return;
    const valid = pressure && pressure.phase === "burst" &&
      Number.isFinite(pressure.phaseS) && Number.isFinite(pressure.charge) &&
      Number.isFinite(pressure.remaining) && Number.isFinite(pressure.burstSequence);
    if (!valid || pressure.phaseS <= 0 || pressure.phaseS >= 1.8 || pressure.remaining <= 0) {
      this.group.visible = false;
      this.signature = "";
      return;
    }
    this.group.visible = true;
    const time = clamp(pressure.phaseS, 0, 1.8);
    const remaining = clamp(pressure.remaining, 0, 1);
    const charge = clamp(pressure.charge, 0, 1);
    // Bounded seed also keeps malformed/large telemetry values numerically stable.
    const seed = ((Math.trunc(pressure.burstSequence) % 997) + 997) % 997;
    const signature = `${time},${remaining},${charge},${seed}`;
    if (signature === this.signature) return;
    this.signature = signature;

    const strength = smooth(0, 0.12, time) * (1 - smooth(0.65, 1.8, time));
    const height = this.span * strength * (0.88 + charge * 0.17);
    const width = this.span * Math.sqrt(strength) * (0.82 + remaining * 0.18);
    const phase = time * 11 + seed * 1.73;
    this.writeColumn(this.core.geometry, 36, 28, height, width, phase, false);
    this.writeColumn(this.foam.geometry, 28, 32, height, width, phase, true);
    this.writeSheets(height, width, phase);
    this.group.userData.sharedPhaseS = time;
    this.group.userData.burstSequence = pressure.burstSequence;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const mesh of [this.core, this.foam, this.sheets]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.group.clear();
    this.group.visible = false;
  }

  private grid(rows: number, columns: number, copies = 1) {
    const geometry = new THREE.BufferGeometry();
    const count = (rows + 1) * (columns + 1) * copies;
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const uv = new Float32Array(count * 2);
    const index: number[] = [];
    for (let copy = 0; copy < copies; copy++) {
      const start = copy * (rows + 1) * (columns + 1);
      for (let row = 0; row <= rows; row++) {
        for (let column = 0; column <= columns; column++) {
          const at = start + row * (columns + 1) + column;
          uv[at * 2] = column / columns;
          uv[at * 2 + 1] = row / rows;
          if (row < rows && column < columns) {
            const next = at + columns + 1;
            index.push(at, next, at + 1, at + 1, next, next + 1);
          }
        }
      }
    }
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(index);
    return geometry;
  }

  private writeColumn(geometry: THREE.BufferGeometry, rows: number, columns: number,
    height: number, width: number, phase: number, foam: boolean) {
    const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
    const array = positions.array as Float32Array;
    for (let row = 0; row <= rows; row++) {
      const v = row / rows;
      const u = foam ? 0.23 + v * 0.77 : v;
      const crest = Math.exp(-Math.pow((u - 0.8) / 0.16, 2));
      const neck = 0.088 + 0.012 * Math.sin(u * 14 - phase) + crest * 0.048;
      // A hemisphere-like closure stays rounded, unlike a smoothstep taper
      // whose radius collapses into a needle at the top of the foam column.
      const cap = clamp((u - 0.76) / 0.24, 0, 1);
      const taper = Math.sqrt(Math.max(0, 1 - cap * cap));
      const foamEdge = foam ? smooth(0, 0.12, v) : 1;
      const centerX = width * 0.065 * Math.sin(u * 4 + phase * 0.21) * u * u;
      const centerZ = width * 0.052 * Math.cos(u * 5 - phase * 0.16) * u * u;
      for (let column = 0; column <= columns; column++) {
        const angle = column / columns * TAU;
        const lobes = Math.sin(angle * 5 + u * 10 - phase) * 0.15 +
          Math.sin(angle * 9 - u * 16 + phase * 0.7) * 0.075;
        const radius = width * (neck + (foam ? 0.014 + crest * 0.018 : 0)) *
          taper * foamEdge * (1 + lobes);
        const at = (row * (columns + 1) + column) * 3;
        array[at] = centerX + Math.cos(angle) * radius;
        array[at + 1] = this.mouthY + height * (u + crest * taper * 0.018 *
          (Math.sin(angle * 3 + phase * 0.31) + 0.35 * Math.cos(angle * 7 - phase * 0.27)));
        array[at + 2] = centerZ + Math.sin(angle) * radius;
      }
    }
    this.finishGeometry(geometry);
  }

  private writeSheets(height: number, width: number, phase: number) {
    const geometry = this.sheets.geometry;
    const array = geometry.getAttribute("position").array as Float32Array;
    const rows = 18, columns = 8;
    for (let sheet = 0; sheet < sheetProfiles.length; sheet++) {
      const profile = sheetProfiles[sheet];
      const direction = profile.angle + Math.sin(phase * 0.23 + sheet) * 0.12;
      const twist = Math.sin(sheet * 2.39 + phase * 0.4) * 0.32;
      const reach = profile.reach * (0.78 + 0.22 * Math.sin(phase * 0.43 + sheet * 1.3));
      // Each sheet starts inside the connected column at its own height.
      const originX = width * 0.065 * Math.sin(profile.origin * 4 + phase * 0.21) * profile.origin ** 2;
      const originZ = width * 0.052 * Math.cos(profile.origin * 5 - phase * 0.16) * profile.origin ** 2;
      for (let row = 0; row <= rows; row++) {
        const u = row / rows;
        const radial = width * (0.062 + reach * Math.sin(u * 1.45));
        const centerY = this.mouthY + height * (profile.origin + profile.lift * Math.sin(u * 2.25) - profile.drop * u * u);
        const breadth = width * (0.018 + profile.width * Math.sin(Math.PI * u)) * (1 - u * 0.9);
        for (let column = 0; column <= columns; column++) {
          const side = column / columns * 2 - 1;
          const angle = direction + twist * u;
          const wave = Math.sin(u * 15 - phase + sheet) * height * 0.009 * u;
          const at = (sheet * (rows + 1) * (columns + 1) + row * (columns + 1) + column) * 3;
          array[at] = originX + Math.cos(angle) * radial - Math.sin(angle) * side * breadth;
          array[at + 1] = centerY + side * side * height * 0.022 * Math.sin(Math.PI * u) + wave;
          array[at + 2] = originZ + Math.sin(angle) * radial + Math.cos(angle) * side * breadth;
        }
      }
    }
    this.finishGeometry(geometry);
  }

  private finishGeometry(geometry: THREE.BufferGeometry) {
    geometry.getAttribute("position").needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }

  private addFoamDetail(material: THREE.MeshPhysicalMaterial) {
    // Object-locked microstructure: pausing a shared snapshot freezes the entire jet.
    material.onBeforeCompile = shader => {
      shader.uniforms.sodaFoamScale = { value: 1 / (this.span * 0.012) };
      shader.vertexShader = shader.vertexShader.replace("#include <common>",
        "#include <common>\nvarying vec3 vSodaFoamPosition;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSodaFoamPosition = position;");
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
        varying vec3 vSodaFoamPosition;
        uniform float sodaFoamScale;
        float sodaFoamHash(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }
        float sodaFoamNoise(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(sodaFoamHash(i), sodaFoamHash(i + vec3(1,0,0)), f.x),
                         mix(sodaFoamHash(i + vec3(0,1,0)), sodaFoamHash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(sodaFoamHash(i + vec3(0,0,1)), sodaFoamHash(i + vec3(1,0,1)), f.x),
                         mix(sodaFoamHash(i + vec3(0,1,1)), sodaFoamHash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }`)
        .replace("#include <color_fragment>", `#include <color_fragment>
          vec3 foamPoint = vSodaFoamPosition * sodaFoamScale;
          float foamGrain = sodaFoamNoise(foamPoint);
          float foamResolution = 1.0 - smoothstep(0.65, 1.8, max(length(dFdx(foamPoint)), length(dFdy(foamPoint))));
          diffuseColor.rgb *= mix(1.0, 0.8 + foamGrain * 0.29, foamResolution);
        `);
    };
    material.customProgramCacheKey = () => "soda-foam-detail-v1";
  }
}
