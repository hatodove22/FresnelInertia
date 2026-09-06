import * as THREE from "three";

/** Desktop/narrow presentation only; XR supplies its own tracked camera.
 * Keep the preferred desktop close-up while fitting every container orientation
 * above the narrow HUD. Fit in camera space, without scaling physical geometry. */
export function frameDesktopContainer(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  size: THREE.Vector3,
  viewport: { width: number; height: number },
  preferredDistance: number
) {
  const narrow = viewport.width <= 520;
  let distance = preferredDistance;
  if (narrow) {
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5) / camera.zoom;
    // The view offset puts the target at 27% height. Reserve the top 2% and
    // 4% on either side, then fit the orientation-independent bounding sphere.
    const fitHalfAngle = Math.atan(tanHalfFov * Math.min(0.5, viewport.width / viewport.height * 0.92));
    const cameraRadius = size.length() * 0.5 / Math.sin(fitHalfAngle);
    distance = Math.max(distance, cameraRadius / Math.hypot(1, 0.38));
  }
  camera.position.set(target.x, target.y + distance * 0.38, target.z + distance);
  camera.lookAt(target);
  camera.setViewOffset(viewport.width, viewport.height,
    narrow ? 0 : -Math.min(215, viewport.width * 0.17),
    narrow ? viewport.height * 0.23 : 0,
    viewport.width, viewport.height);
}
