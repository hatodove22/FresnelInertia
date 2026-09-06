import * as THREE from "three";

/** Dispose an exclusively owned subtree. Do not pass borrowed/shared resources.
 * Deduplicate geometry, materials and textures shared within this owner. */
export function disposeObjectTree(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse(object => {
    const renderable = object as THREE.Mesh;
    if (renderable.geometry) geometries.add(renderable.geometry);
    if (renderable.material) {
      const attached = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
      for (const material of attached) materials.add(material);
    }
    // InstancedMesh also owns instance buffers managed by the renderer.
    if (object instanceof THREE.InstancedMesh) object.dispose();
  });
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value instanceof THREE.Texture) textures.add(value);
    }
  }
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  root.clear();
}
