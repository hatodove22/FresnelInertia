import * as THREE from "three";

/** Static softboxes, not an animated light show. Reflections make the same
 * state-driven surface readable without adding a visual motion clock. */
export function makeMaterialEnvironment(renderer: THREE.WebGLRenderer) {
  const studio = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12),
    new THREE.MeshBasicMaterial({ color: "#263c49", side: THREE.BackSide }));
  studio.add(room);
  const card = (width: number, height: number, color: string, intensity: number, position: [number, number, number]) => {
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    material.color.multiplyScalar(intensity);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.position.set(...position);
    mesh.lookAt(0, 0, 0);
    studio.add(mesh);
  };
  card(3.4, 4.8, "#e8f6ff", 5, [-3, 3, 2]);
  card(1.1, 5.5, "#83dcf5", 3.2, [3, 1, -2]);
  card(4.5, 2, "#fff0d8", 3.4, [0, 4, -1]);
  card(0.7, 3.8, "#f4ffff", 2.2, [1.8, 0.3, 4]);
  card(3.8, 0.24, "#f2ffff", 1.5, [-0.3, 1.7, -4]);
  card(0.5, 3, "#fff8e9", 4, [-1.4, 0.5, 4]);
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromScene(studio, 0, 0.1, 30, { size: 128 });
  generator.dispose();
  studio.traverse(object => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    }
  });
  return target;
}

/** An opaque, restrained photographic backdrop also gives transmission an
 * actual scene to refract (a CSS background is invisible to the WebGL pass).
 * It stays out of XR and the existing bench view. */
export function makeMaterialBackdrop() {
  const material = new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: {},
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float glow = exp(-dot(p * vec2(1.2, 0.9), p * vec2(1.2, 0.9)) * 13.0);
        vec3 color = mix(vec3(0.003, 0.005, 0.010), vec3(0.020, 0.044, 0.055), glow);
        float ribbon = exp(-pow((p.x + p.y * 0.42 - 0.055) * 45.0, 2.0));
        color += vec3(0.015, 0.027, 0.032) * ribbon * glow;
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.name = "material-studio-backdrop";
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}
