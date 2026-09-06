import * as THREE from "three";
import type { ContainedVolume } from "./ContainedVolume";

/** Small, opaque optical backing for transmitted water. This is an authored
 * caustic approximation on the container floor, not traced light or fluid state. */
export class LiquidCaustics {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private readonly uniforms = {
    causticActivity: { value: 0 },
    causticPhase: { value: 0 },
    causticFill: { value: 0 },
    causticScale: { value: new THREE.Vector2(6, 6) },
    causticPlane: { value: new THREE.Vector4(0, 1, 0, 0) },
    causticClip: { value: 0 },
    causticFloorY: { value: 0 }
  };
  private disposed = false;

  constructor(size: THREE.Vector3, floor?: readonly THREE.Vector3[]) {
    const geometry = floor ? new THREE.BufferGeometry() : new THREE.PlaneGeometry(size.x, size.z);
    if (floor) {
      const vertices: number[] = [], uv: number[] = [];
      for (let i = 1; i + 1 < floor.length; i++) for (const point of [floor[0], floor[i + 1], floor[i]]) {
        vertices.push(point.x, 0, point.z);
        uv.push(point.x / size.x + 0.5, point.z / size.z + 0.5);
      }
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      geometry.computeVertexNormals();
    } else geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({
      color: "#3c929b", roughness: 0.48, metalness: 0,
      transparent: false, opacity: 1, side: THREE.DoubleSide
    });
    const aspect = Math.sqrt(size.x / size.z);
    this.uniforms.causticScale.value.set(6 * aspect, 6 / aspect);
    this.uniforms.causticFloorY.value = (floor?.[0].y ?? -size.y / 2) + Math.min(size.x, size.y, size.z) * 0.0008;
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
varying vec2 vCausticUv;
varying vec3 vCausticFloorPosition;
uniform float causticFloorY;`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>
vCausticUv = uv;
vCausticFloorPosition = position + vec3(0.0, causticFloorY, 0.0);`);
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
varying vec2 vCausticUv;
varying vec3 vCausticFloorPosition;
uniform float causticActivity;
uniform float causticPhase;
uniform float causticFill;
uniform vec2 causticScale;
uniform vec4 causticPlane;
uniform float causticClip;

vec2 causticHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}

float causticRidge(vec2 uv) {
  // The caller supplies continuous visual advection. Multiplying absolute
  // model time by a decaying activity caused phase jumps and backwards flashes.
  float t = causticPhase * 0.45;
  vec2 p = uv * causticScale;
  // Domain warping bends cell boundaries into a connected irregular network,
  // unlike a repeating grid or a sum of regular sine-wave stripes.
  p += 0.42 * vec2(sin(p.y * 1.67 + t) + 0.35 * cos(p.x * 2.13 - t),
                   cos(p.x * 1.51 - t * 0.73) + 0.30 * sin(p.y * 2.27 + t));
  vec2 cell = floor(p);
  vec2 local = fract(p);
  float nearest = 8.0;
  float nextNearest = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 point = 0.16 + 0.68 * causticHash(cell + neighbor);
      vec2 delta = neighbor + point - local;
      float distanceSquared = dot(delta, delta);
      nextNearest = min(nextNearest, max(nearest, distanceSquared));
      nearest = min(nearest, distanceSquared);
    }
  }
  float gap = sqrt(nextNearest) - sqrt(nearest);
  float aa = max(fwidth(gap), 0.008);
  float fine = 1.0 - smoothstep(0.022, 0.022 + aa * 1.25, gap);
  float halo = 1.0 - smoothstep(0.025, 0.14 + aa, gap);
  return fine * 0.78 + halo * 0.22;
}`)
        .replace("#include <color_fragment>", `#include <color_fragment>
// The backing exists only beneath the exact shared clipped liquid. In a
// tilted shallow fill, the dry side of the container must stay unpainted.
if (causticClip > 0.5 && dot(causticPlane.xyz, vCausticFloorPosition) > causticPlane.w) discard;
float caustic = causticRidge(vCausticUv);
float causticStrength = (0.25 + causticActivity * 0.40) * smoothstep(0.0, 0.08, causticFill);
float floorEdge = smoothstep(0.0, 0.035, min(min(vCausticUv.x, 1.0 - vCausticUv.x), min(vCausticUv.y, 1.0 - vCausticUv.y)));
caustic *= mix(0.55, 1.0, floorEdge);
diffuseColor.rgb *= 0.77 + 0.23 * floorEdge;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.94, 0.80), caustic * causticStrength);`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(0.82, 0.95, 0.81) * caustic * causticStrength * 0.10;`);
    };
    material.customProgramCacheKey = () => "contained-liquid-caustic-floor-v2";
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = "content-liquid-caustics";
    this.mesh.position.y = this.uniforms.causticFloorY.value;
    this.mesh.receiveShadow = true;
    this.mesh.visible = false;
    this.mesh.userData.renderingApproximation = "authored floor caustics; not ray traced";
  }

  update(fill: number, activity: number, phase: number, volume?: ContainedVolume) {
    if (this.disposed) return;
    this.uniforms.causticFill.value = THREE.MathUtils.clamp(Number.isFinite(fill) ? fill : 0, 0, 1);
    this.uniforms.causticActivity.value = THREE.MathUtils.clamp(Number.isFinite(activity) ? activity : 0, 0, 1);
    this.uniforms.causticPhase.value = Number.isFinite(phase) ? phase : 0;
    const validPlane = volume && Number.isFinite(volume.offset)
      && [volume.normal.x, volume.normal.y, volume.normal.z].every(Number.isFinite)
      && volume.normal.lengthSq() > 1e-12;
    this.uniforms.causticClip.value = validPlane ? 1 : 0;
    if (validPlane) this.uniforms.causticPlane.value.set(volume.normal.x, volume.normal.y, volume.normal.z, volume.offset);
    else this.uniforms.causticPlane.value.set(0, 1, 0, 0);
    this.mesh.visible = this.uniforms.causticFill.value > 0;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.visible = false;
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
